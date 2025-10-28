import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { config } from "../config";
import { query, queryOne } from "../db";
import { getSampleListings } from "../sample";
import {
  buildSqlFilter,
  filterSampleListings,
  listingFilterSchema,
  toListingFilters,
  type ListingFilters,
} from "../utils/filters";
import type {
  CommissionBrokerAggregate,
  CommissionChainAggregate,
  CommissionTrendEntry,
  Listing,
} from "../types";
import { formatDate, parseWindow, shiftDate } from "../utils/time";

const commissionQuerySchema = listingFilterSchema.extend({
  window: z.string().optional().default("12m"),
  limit: z.coerce.number().optional().default(10),
});

const trendQuerySchema = listingFilterSchema.extend({
  nowDays: z.coerce.number().optional().default(30),
  limit: z.coerce.number().optional().default(5),
});

async function latestSnapshotDay(): Promise<string | null> {
  const row = await queryOne<{ day: string }>(
    `
      SELECT to_char(max(date_trunc('day', snapshot_at)), 'YYYY-MM-DD') AS day
      FROM listings
    `
  );
  return row?.day ?? null;
}

function latestSampleDay(listings: Listing[]): string | null {
  let max: string | null = null;
  for (const listing of listings) {
    if (!listing.snapshot_at) continue;
    const day = listing.snapshot_at.slice(0, 10);
    if (!max || day > max) {
      max = day;
    }
  }
  return max;
}

async function resolveWindow(window: string): Promise<{ start: string; end: string } | null> {
  const latest = await latestSnapshotDay();
  if (!latest) {
    return null;
  }
  if (window === "now") {
    return { start: latest, end: latest };
  }
  const days = parseWindow(window, 365);
  const endDate = new Date(`${latest}T00:00:00Z`);
  const startDate = shiftDate(new Date(endDate), days);
  return { start: formatDate(startDate), end: formatDate(endDate) };
}

function filterListingsByDate(listings: Listing[], start: string, end: string): Listing[] {
  return listings.filter((listing) => {
    if (!listing.snapshot_at) {
      return false;
    }
    const day = listing.snapshot_at.slice(0, 10);
    return day >= start && day <= end;
  });
}

function aggregateSampleBrokers(
  listings: Listing[],
  start: string,
  end: string,
  limit: number
): CommissionBrokerAggregate[] {
  const filtered = filterListingsByDate(listings, start, end);
  const map = new Map<string, { chain: string | null; listings: number; total: number }>();

  for (const listing of filtered) {
    if (listing.commission_est == null || listing.commission_est <= 0) continue;
    const key = `${listing.broker ?? "Ukjent"}::${listing.chain ?? ""}`;
    const entry = map.get(key) ?? { chain: listing.chain ?? null, listings: 0, total: 0 };
    entry.listings += 1;
    entry.total += listing.commission_est;
    entry.chain = entry.chain ?? listing.chain ?? null;
    map.set(key, entry);
  }

  return [...map.entries()]
    .map(([key, value]) => {
      const [broker] = key.split("::");
      return {
        broker: broker === "Ukjent" ? null : broker,
        chain: value.chain,
        listings: value.listings,
        total_commission: Math.round(value.total),
        avg_commission: value.listings ? Math.round(value.total / value.listings) : 0,
      };
    })
    .sort((a, b) => b.total_commission - a.total_commission)
    .slice(0, limit);
}

function aggregateSampleChains(
  listings: Listing[],
  start: string,
  end: string,
  limit: number
): CommissionChainAggregate[] {
  const filtered = filterListingsByDate(listings, start, end);
  const map = new Map<string, { listings: number; total: number }>();

  for (const listing of filtered) {
    if (listing.commission_est == null || listing.commission_est <= 0) continue;
    const key = listing.chain ?? "Ukjent";
    const entry = map.get(key) ?? { listings: 0, total: 0 };
    entry.listings += 1;
    entry.total += listing.commission_est;
    map.set(key, entry);
  }

  return [...map.entries()]
    .map(([chain, value]) => ({
      chain: chain === "Ukjent" ? null : chain,
      listings: value.listings,
      total_commission: Math.round(value.total),
      avg_commission: value.listings ? Math.round(value.total / value.listings) : 0,
    }))
    .sort((a, b) => b.total_commission - a.total_commission)
    .slice(0, limit);
}

function aggregateSampleTrends(
  listings: Listing[],
  nowStart: string,
  nowEnd: string,
  prevStart: string,
  prevEnd: string,
  limit: number
): { growing: CommissionTrendEntry[]; falling: CommissionTrendEntry[] } {
  const nowAgg = aggregateSampleBrokers(listings, nowStart, nowEnd, Number.MAX_SAFE_INTEGER);
  const prevAgg = aggregateSampleBrokers(listings, prevStart, prevEnd, Number.MAX_SAFE_INTEGER);

  const prevMap = new Map<string, CommissionBrokerAggregate>();
  for (const row of prevAgg) {
    const key = `${row.broker ?? ""}::${row.chain ?? ""}`;
    prevMap.set(key, row);
  }

  const combined = new Map<string, CommissionTrendEntry>();

  for (const row of nowAgg) {
    const key = `${row.broker ?? ""}::${row.chain ?? ""}`;
    const prev = prevMap.get(key);
    combined.set(key, {
      broker: row.broker,
      chain: row.chain,
      now_total: row.total_commission,
      prev_total: prev?.total_commission ?? 0,
      delta: row.total_commission - (prev?.total_commission ?? 0),
    });
  }

  for (const row of prevAgg) {
    const key = `${row.broker ?? ""}::${row.chain ?? ""}`;
    if (combined.has(key)) continue;
    combined.set(key, {
      broker: row.broker,
      chain: row.chain,
      now_total: 0,
      prev_total: row.total_commission,
      delta: -row.total_commission,
    });
  }

  const growing = [...combined.values()]
    .filter((row) => row.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);

  const falling = [...combined.values()]
    .filter((row) => row.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);

  return { growing, falling };
}

export const commissionsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/agg/commissions/brokers", async (request, reply) => {
    const parsed = commissionQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { window, limit, ...rest } = parsed.data;
    const filters = toListingFilters(rest);

    const range = await resolveWindow(window);
    if (!range) {
      return [];
    }

    if (config.useSample) {
      const sample = getSampleListings();
      const latest = latestSampleDay(sample);
      if (!latest) {
        return [];
      }
      const sampleFilters: ListingFilters = {
        ...filters,
        since: range.start,
        until: range.end,
      };
      const filtered = filterSampleListings(sample, sampleFilters, { applyMinSoldCount: false });
      const map = new Map<string, { chain: string | null; listings: number; total: number }>();

      for (const listing of filtered) {
        if (listing.commission_est == null || listing.commission_est <= 0) continue;
        const key = `${listing.broker ?? "Ukjent"}::${listing.chain ?? ""}`;
        const entry = map.get(key) ?? { chain: listing.chain ?? null, listings: 0, total: 0 };
        entry.listings += 1;
        entry.total += listing.commission_est;
        entry.chain = entry.chain ?? listing.chain ?? null;
        map.set(key, entry);
      }

      return [...map.entries()]
        .map(([key, value]) => {
          const [broker] = key.split("::");
          return {
            broker: broker === "Ukjent" ? null : broker,
            chain: value.chain,
            listings: value.listings,
            total_commission: Math.round(value.total),
            avg_commission: value.listings ? Math.round(value.total / value.listings) : 0,
          };
        })
        .sort((a, b) => b.total_commission - a.total_commission)
        .slice(0, limit);
    }

    const filtersForSql: ListingFilters = { ...filters, since: undefined, until: undefined };
    const { clause, params, nextIndex } = buildSqlFilter(filtersForSql, 3);
    const whereClause = clause ? clause.replace("WHERE", "AND") : "";

    const rows = await query<{
      broker: string | null;
      chain: string | null;
      listings: number | null;
      total_commission: number | null;
      avg_commission: number | null;
    }>(
      `
      SELECT
        broker,
        chain,
        COUNT(*) FILTER (WHERE commission_est IS NOT NULL AND commission_est > 0) AS listings,
        COALESCE(SUM(commission_est), 0) AS total_commission,
        COALESCE(AVG(commission_est), 0) AS avg_commission
      FROM listings_latest
      WHERE snapshot_at::date BETWEEN $1::date AND $2::date
        ${whereClause}
      GROUP BY broker, chain
      ORDER BY total_commission DESC NULLS LAST
      LIMIT $${nextIndex}
      `,
      [range.start, range.end, ...params, limit]
    );

    return rows.map((row) => ({
      broker: row.broker,
      chain: row.chain,
      listings: Number(row.listings ?? 0),
      total_commission: Number(row.total_commission ?? 0),
      avg_commission: Number(row.avg_commission ?? 0),
    }));
  });

  app.get("/api/agg/commissions/chains", async (request, reply) => {
    const parsed = commissionQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { window, limit } = parsed.data;

    if (config.useSample) {
      const sample = getSampleListings();
      const latest = latestSampleDay(sample);
      if (!latest) {
        return [];
      }
      const { start, end } = window === "now"
        ? { start: latest, end: latest }
        : (() => {
            const days = parseWindow(window, 365);
            const endDate = new Date(`${latest}T00:00:00Z`);
            const startDate = shiftDate(new Date(endDate), days);
            return { start: formatDate(startDate), end: formatDate(endDate) };
          })();
      return aggregateSampleChains(sample, start, end, limit);
    }

    const range = await resolveWindow(window);
    if (!range) {
      return [];
    }

    const rows = await query<CommissionChainAggregate>(
      `
      SELECT
        chain,
        COUNT(*) FILTER (WHERE commission_est IS NOT NULL) AS listings,
        COALESCE(SUM(commission_est), 0) AS total_commission,
        COALESCE(AVG(commission_est), 0) AS avg_commission
      FROM listings
      WHERE commission_est IS NOT NULL
        AND snapshot_at::date BETWEEN $1::date AND $2::date
      GROUP BY chain
      ORDER BY total_commission DESC NULLS LAST
      LIMIT $3
      `,
      [range.start, range.end, limit]
    );

    return rows.map((row) => ({
      chain: row.chain,
      listings: Number(row.listings ?? 0),
      total_commission: Number(row.total_commission ?? 0),
      avg_commission: Number(row.avg_commission ?? 0),
    }));
  });

  app.get("/api/agg/commissions/trends", async (request, reply) => {
    const parsed = trendQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { nowDays, limit } = parsed.data;

    if (config.useSample) {
      const sample = getSampleListings();
      const latest = latestSampleDay(sample);
      if (!latest) {
        return { growing: [], falling: [] };
      }
      const end = new Date(`${latest}T00:00:00Z`);
      const nowStartDate = shiftDate(new Date(end), nowDays);
      const prevStartDate = shiftDate(new Date(nowStartDate), nowDays);
      return aggregateSampleTrends(
        sample,
        formatDate(nowStartDate),
        formatDate(end),
        formatDate(prevStartDate),
        formatDate(nowStartDate),
        limit
      );
    }

    const latest = await latestSnapshotDay();
    if (!latest) {
      return { growing: [], falling: [] };
    }
    const end = new Date(`${latest}T00:00:00Z`);
    const nowStart = shiftDate(new Date(end), nowDays);
    const prevStart = shiftDate(new Date(nowStart), nowDays);

    const rows = await query<CommissionTrendEntry>(
      `
      WITH base AS (
        SELECT broker,
               chain,
               commission_est,
               snapshot_at::date AS snapshot_day
        FROM listings
        WHERE commission_est IS NOT NULL
      ),
      now_window AS (
        SELECT broker,
               chain,
               SUM(commission_est) AS total_commission
        FROM base
        WHERE snapshot_day BETWEEN $1::date AND $2::date
        GROUP BY broker, chain
      ),
      prev_window AS (
        SELECT broker,
               chain,
               SUM(commission_est) AS total_commission
        FROM base
        WHERE snapshot_day BETWEEN $3::date AND $4::date
        GROUP BY broker, chain
      )
      SELECT
        COALESCE(n.broker, p.broker) AS broker,
        COALESCE(n.chain, p.chain) AS chain,
        COALESCE(n.total_commission, 0) AS now_total,
        COALESCE(p.total_commission, 0) AS prev_total,
        COALESCE(n.total_commission, 0) - COALESCE(p.total_commission, 0) AS delta
      FROM now_window n
      FULL OUTER JOIN prev_window p
        ON n.broker = p.broker AND COALESCE(n.chain, '') = COALESCE(p.chain, '')
      WHERE COALESCE(n.total_commission, 0) <> 0 OR COALESCE(p.total_commission, 0) <> 0
      ORDER BY abs(COALESCE(n.total_commission, 0) - COALESCE(p.total_commission, 0)) DESC
      LIMIT $5
      `,
      [
        formatDate(nowStart),
        formatDate(end),
        formatDate(prevStart),
        formatDate(nowStart),
        limit * 4,
      ]
    );

    const growing = rows
      .filter((row) => row.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, limit)
      .map((row) => ({
        broker: row.broker,
        chain: row.chain,
        now_total: Number(row.now_total ?? 0),
        prev_total: Number(row.prev_total ?? 0),
        delta: Number(row.delta ?? 0),
      }));

    const falling = rows
      .filter((row) => row.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, limit)
      .map((row) => ({
        broker: row.broker,
        chain: row.chain,
        now_total: Number(row.now_total ?? 0),
        prev_total: Number(row.prev_total ?? 0),
        delta: Number(row.delta ?? 0),
      }));

    return { growing, falling };
  });
};
