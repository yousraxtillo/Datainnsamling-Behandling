import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { config } from "../config";
import { query, queryOne } from "../db";
import { getSampleListings } from "../sample";
import type { Listing } from "../types";
import { formatDate } from "../utils/time";

const brokerQuery = z.object({
  chain: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

interface BrokerSummary {
  broker: string | null;
  chain: string | null;
  listings: number;
  total_price: number;
  avg_price: number;
  total_commission: number;
  avg_commission: number;
  roles: Record<string, number>;
}

interface BreakdownRow {
  label: string | null;
  listings: number;
  total_price: number;
  total_commission: number;
}

interface TrendRow {
  period: string;
  total_commission: number;
}

interface PeerSummary {
  broker: string | null;
  chain: string | null;
  listings: number;
  total_commission: number;
  avg_price: number;
}

interface BrokerResponse {
  summary: BrokerSummary;
  property_breakdown: BreakdownRow[];
  district_breakdown: BreakdownRow[];
  commission_trend: TrendRow[];
  listings: Listing[];
  peers: PeerSummary[];
  recommendations: PeerSummary[];
  rank: number | null;
  total_brokers: number | null;
}

function slugToName(slug: string): string {
  const decoded = decodeURIComponent(slug);
  return decoded.replace(/[-_]+/g, " ").trim();
}

function filterListingsSample(listings: Listing[], brokerName: string, chain?: string, since?: string, until?: string): Listing[] {
  return listings.filter((listing) => {
    if (!listing.broker || listing.broker.toLowerCase() !== brokerName.toLowerCase()) {
      return false;
    }
    if (chain && listing.chain && listing.chain.toLowerCase() !== chain.toLowerCase()) {
      return false;
    }
    if (since && listing.snapshot_at && listing.snapshot_at.slice(0, 10) < since) {
      return false;
    }
    if (until && listing.snapshot_at && listing.snapshot_at.slice(0, 10) > until) {
      return false;
    }
    return true;
  });
}

function buildSummaryFromSample(rows: Listing[]): BrokerSummary {
  const listings = rows.length;
  const totalPrice = rows.reduce((acc, item) => acc + (item.price ?? 0), 0);
  const totalCommission = rows.reduce((acc, item) => acc + (item.commission_est ?? 0), 0);
  const roles: Record<string, number> = {};
  rows.forEach((item) => {
    if (!item.role) return;
    roles[item.role] = (roles[item.role] ?? 0) + 1;
  });

  return {
    broker: rows[0]?.broker ?? null,
    chain: rows[0]?.chain ?? null,
    listings,
    total_price: totalPrice,
    avg_price: listings ? Math.round(totalPrice / listings) : 0,
    total_commission: totalCommission,
    avg_commission: listings ? Math.round(totalCommission / listings) : 0,
    roles,
  };
}

function buildBreakdown(rows: Listing[], key: "property_type" | "district"): BreakdownRow[] {
  const map = new Map<string, { listings: number; total_price: number; total_commission: number }>();
  rows.forEach((row) => {
    const label = (row[key] as string | null) ?? "Ukjent";
    const entry = map.get(label) ?? { listings: 0, total_price: 0, total_commission: 0 };
    entry.listings += 1;
    entry.total_price += row.price ?? 0;
    entry.total_commission += row.commission_est ?? 0;
    map.set(label, entry);
  });
  return [...map.entries()]
    .map(([label, value]) => ({
      label: label === "Ukjent" ? null : label,
      listings: value.listings,
      total_price: value.total_price,
      total_commission: value.total_commission,
    }))
    .sort((a, b) => b.total_commission - a.total_commission);
}

function buildTrend(rows: Listing[]): TrendRow[] {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    if (!row.snapshot_at) return;
    const period = row.snapshot_at.slice(0, 7); // YYYY-MM
    map.set(period, (map.get(period) ?? 0) + (row.commission_est ?? 0));
  });
  return [...map.entries()]
    .map(([period, total]) => ({ period: `${period}-01`, total_commission: total }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function buildPeersSample(
  listings: Listing[],
  brokerName: string,
  options: { segment?: string | null; district?: string | null; chain?: string | null },
  limit: number
): PeerSummary[] {
  const peers = new Map<string, { chain: string | null; listings: number; total: number; priceSum: number }>();
  listings.forEach((listing) => {
    if (!listing.broker) return;
    if (listing.broker.toLowerCase() === brokerName.toLowerCase()) return;
    if (options.segment && listing.segment !== options.segment) return;
    if (options.district && listing.district !== options.district) return;
    if (options.chain && listing.chain !== options.chain) return;
    const key = listing.broker;
    const entry = peers.get(key) ?? {
      chain: listing.chain ?? null,
      listings: 0,
      total: 0,
      priceSum: 0,
    };
    entry.listings += 1;
    entry.total += listing.commission_est ?? 0;
    entry.priceSum += listing.price ?? 0;
    entry.chain = entry.chain ?? listing.chain ?? null;
    peers.set(key, entry);
  });

  return [...peers.entries()]
    .map(([broker, value]) => ({
      broker,
      chain: value.chain,
      listings: value.listings,
      total_commission: Math.round(value.total),
      avg_price: value.listings ? Math.round(value.priceSum / value.listings) : 0,
    }))
    .filter((peer) => peer.total_commission > 0)
    .sort((a, b) => b.total_commission - a.total_commission)
    .slice(0, limit);
}

function computeRankSample(listings: Listing[], brokerName: string): { rank: number | null; total: number } {
  const totals = new Map<string, number>();
  listings.forEach((listing) => {
    if (!listing.broker) return;
    totals.set(listing.broker, (totals.get(listing.broker) ?? 0) + (listing.commission_est ?? 0));
  });
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.length;
  let rank: number | null = null;
  sorted.forEach(([name], idx) => {
    if (name.toLowerCase() === brokerName.toLowerCase()) {
      rank = idx + 1;
    }
  });
  return { rank, total };
}

export const brokerRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { slug: string } }>("/api/broker/:slug", async (request, reply) => {
    const parsedQuery = brokerQuery.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: parsedQuery.error.flatten() });
    }
    const { chain, since, until } = parsedQuery.data;
    const brokerName = slugToName(request.params.slug);

    if (!brokerName) {
      return reply.status(400).send({ error: "Broker slug is required" });
    }

    if (config.useSample) {
      const sampleListings = getSampleListings();
      const rows = filterListingsSample(sampleListings, brokerName, chain, since, until);
      if (!rows.length) {
        return reply.status(404).send({ error: "Broker not found" });
      }
      const summary = buildSummaryFromSample(rows);
      const propertyBreakdown = buildBreakdown(rows, "property_type");
      const districtBreakdown = buildBreakdown(rows, "district");
      const topSegment = propertyBreakdown.find((row) => row.label)?.label ?? null;
      const topDistrict = districtBreakdown.find((row) => row.label)?.label ?? null;
      const peers = buildPeersSample(sampleListings, brokerName, { segment: topSegment, district: topDistrict }, 5);
      const recommendations = buildPeersSample(sampleListings, brokerName, { chain: summary.chain ?? null }, 3);
      const { rank, total } = computeRankSample(sampleListings, brokerName);
      return {
        summary,
        property_breakdown: propertyBreakdown,
        district_breakdown: districtBreakdown,
        commission_trend: buildTrend(rows),
        listings: rows,
        peers,
        recommendations,
        rank,
        total_brokers: total,
      } satisfies BrokerResponse;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    params.push(brokerName);
    conditions.push(`LOWER(broker) = LOWER($${params.length})`);

    if (chain) {
      params.push(chain);
      conditions.push(`LOWER(chain) = LOWER($${params.length})`);
    }
    if (since) {
      params.push(since);
      conditions.push(`snapshot_at::date >= $${params.length}`);
    }
    if (until) {
      params.push(until);
      conditions.push(`snapshot_at::date <= $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const listings = await query<Listing>(
      `
        SELECT source,
               listing_id,
               title,
               address,
               city,
               district,
               chain,
               broker,
               price,
               commission_est,
               status,
               to_char(timezone('UTC', published), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS published,
               property_type,
               broker_role,
               role,
               to_char(timezone('UTC', last_seen_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
               to_char(timezone('UTC', snapshot_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS snapshot_at
        FROM listings
        ${whereClause}
        ORDER BY snapshot_at DESC
      `,
      params
    );

    if (!listings.length) {
      return reply.status(404).send({ error: "Broker not found" });
    }

    const summaryRow = await queryOne<{
      chain: string | null;
      listings: number;
      total_price: number;
      avg_price: number;
      total_commission: number;
      avg_commission: number;
    }>(
      `
        SELECT
          MAX(chain) AS chain,
          COUNT(*) AS listings,
          COALESCE(SUM(price), 0) AS total_price,
          COALESCE(AVG(price), 0) AS avg_price,
          COALESCE(SUM(commission_est), 0) AS total_commission,
          COALESCE(AVG(commission_est), 0) AS avg_commission
        FROM listings
        ${whereClause}
      `,
      params
    );

    const roleRows = await query<{ role: string | null; count: number }>(
      `
        SELECT role, COUNT(*)::int AS count
        FROM listings
        ${whereClause}
        GROUP BY role
      `,
      params
    );
    const roles: Record<string, number> = {};
    for (const row of roleRows) {
      if (!row.role) continue;
      roles[row.role] = row.count;
    }

    const propertyRows = await query<{
      label: string | null;
      listings: number | null;
      total_price: number | null;
      total_commission: number | null;
    }>(
      `
        SELECT property_type AS label,
               COUNT(*)::int AS listings,
               COALESCE(SUM(price), 0) AS total_price,
               COALESCE(SUM(commission_est), 0) AS total_commission
        FROM listings
        ${whereClause}
        GROUP BY property_type
      `,
      params
    );

    const districtRows = await query<{
      label: string | null;
      listings: number | null;
      total_price: number | null;
      total_commission: number | null;
    }>(
      `
        SELECT district AS label,
               COUNT(*)::int AS listings,
               COALESCE(SUM(price), 0) AS total_price,
               COALESCE(SUM(commission_est), 0) AS total_commission
        FROM listings
        ${whereClause}
        GROUP BY district
      `,
      params
    );

    const trendRows = await query<{ period: string; total_commission: number }>(
      `
        SELECT to_char(date_trunc('month', snapshot_at), 'YYYY-MM-01') AS period,
               COALESCE(SUM(commission_est), 0) AS total_commission
        FROM listings
        ${whereClause}
        GROUP BY date_trunc('month', snapshot_at)
        ORDER BY period
      `,
      params
    );

    const propertyBreakdown = propertyRows
      .map((row) => ({
        label: row.label,
        listings: Number(row.listings ?? 0),
        total_price: Number(row.total_price ?? 0),
        total_commission: Number(row.total_commission ?? 0),
      }))
      .sort((a, b) => b.total_commission - a.total_commission);

    const districtBreakdown = districtRows
      .map((row) => ({
        label: row.label,
        listings: Number(row.listings ?? 0),
        total_price: Number(row.total_price ?? 0),
        total_commission: Number(row.total_commission ?? 0),
      }))
      .sort((a, b) => b.total_commission - a.total_commission);

    const topSegment = propertyBreakdown.find((row) => row.label)?.label ?? null;
    const topDistrict = districtBreakdown.find((row) => row.label)?.label ?? null;
    const chainForRecommendations = summaryRow?.chain ?? listings[0]?.chain ?? null;

    const peerRows = await query<{
      broker: string | null;
      chain: string | null;
      listings: number | null;
      total_commission: number | null;
      avg_price: number | null;
    }>(
      `
      WITH base AS (
        SELECT broker, chain, commission_est, price, segment, district
        FROM listings_latest
        WHERE commission_est IS NOT NULL
          AND broker IS NOT NULL
          AND LOWER(broker) <> LOWER($1)
      )
      SELECT broker,
             MAX(chain) AS chain,
             COUNT(*)::int AS listings,
             COALESCE(SUM(commission_est), 0) AS total_commission,
             COALESCE(AVG(price), 0) AS avg_price
      FROM base
      WHERE ($2::text IS NULL OR segment = $2::text)
        AND ($3::text IS NULL OR district = $3::text)
      GROUP BY broker
      ORDER BY total_commission DESC
      LIMIT $4
      `,
      [brokerName, topSegment, topDistrict, 5]
    );

    const recommendationRows = await query<{
      broker: string | null;
      chain: string | null;
      listings: number | null;
      total_commission: number | null;
      avg_price: number | null;
    }>(
      `
      WITH base AS (
        SELECT broker, chain, commission_est, price
        FROM listings_latest
        WHERE commission_est IS NOT NULL
          AND broker IS NOT NULL
          AND LOWER(broker) <> LOWER($1)
      )
      SELECT broker,
             MAX(chain) AS chain,
             COUNT(*)::int AS listings,
             COALESCE(SUM(commission_est), 0) AS total_commission,
             COALESCE(AVG(price), 0) AS avg_price
      FROM base
      WHERE ($2::text IS NULL OR chain = $2::text)
      GROUP BY broker
      ORDER BY total_commission DESC
      LIMIT $3
      `,
      [brokerName, chainForRecommendations, 3]
    );

    const rankRow = await queryOne<{ rank: number; total_brokers: number }>(
      `
      WITH totals AS (
        SELECT broker,
               SUM(commission_est) AS total_commission
        FROM listings_latest
        WHERE commission_est IS NOT NULL
          AND broker IS NOT NULL
        GROUP BY broker
      ),
      ranked AS (
        SELECT broker,
               total_commission,
               RANK() OVER (ORDER BY total_commission DESC) AS rank
        FROM totals
      )
      SELECT ranked.rank,
             (SELECT COUNT(*) FROM totals) AS total_brokers
      FROM ranked
      WHERE LOWER(ranked.broker) = LOWER($1)
      `,
      [brokerName]
    );

    const summary: BrokerSummary = {
      broker: listings[0].broker,
      chain: summaryRow?.chain ?? listings[0].chain ?? null,
      listings: Number(summaryRow?.listings ?? listings.length),
      total_price: Number(summaryRow?.total_price ?? 0),
      avg_price: Math.round(Number(summaryRow?.avg_price ?? 0)),
      total_commission: Number(summaryRow?.total_commission ?? 0),
      avg_commission: Math.round(Number(summaryRow?.avg_commission ?? 0)),
      roles,
    };

    return {
      summary,
      property_breakdown: propertyBreakdown,
      district_breakdown: districtBreakdown,
      commission_trend: trendRows.map((row) => ({
        period: formatDate(new Date(row.period)),
        total_commission: Number(row.total_commission ?? 0),
      })),
      listings,
      peers: peerRows
        .map((row) => ({
          broker: row.broker,
          chain: row.chain,
          listings: Number(row.listings ?? 0),
          total_commission: Number(row.total_commission ?? 0),
          avg_price: Math.round(Number(row.avg_price ?? 0)),
        }))
        .filter((peer) => peer.total_commission > 0),
      recommendations: recommendationRows
        .map((row) => ({
          broker: row.broker,
          chain: row.chain,
          listings: Number(row.listings ?? 0),
          total_commission: Number(row.total_commission ?? 0),
          avg_price: Math.round(Number(row.avg_price ?? 0)),
        }))
        .filter((peer) => peer.total_commission > 0),
      rank: rankRow?.rank ?? null,
      total_brokers: rankRow?.total_brokers ?? null,
    } satisfies BrokerResponse;
  });
};
