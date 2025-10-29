import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { config } from "../config";
import { query, queryOne } from "../db";
import { getSampleListings } from "../sample";
import type {
  BrokerAggregate,
  ChainAggregate,
  CommissionBrokerAggregate,
  CommissionChainAggregate,
  DeltaAggregate,
  DistrictAggregate,
  Listing,
} from "../types";
import { buildSqlFilter, filterSampleListings, listingFilterSchema, toListingFilters, type ListingFilters } from "../utils/filters";
import { formatDate, parseWindow, shiftDate } from "../utils/time";

const ACTIVE_EXCLUSIONS = new Set(["sold", "solgt", "inactive", "withdrawn"]);

const aggQuerySchema = z.object({
  window: z.string().optional().default("now"),
  limit: z.coerce.number().optional().default(10),
});

const brokerAggQuerySchema = listingFilterSchema.extend({
  window: z.string().optional().default("now"),
  sort: z.enum(["total_value", "avg_value", "count_sold", "count_active"]).optional().default("total_value"),
  limit: z.coerce.number().optional().default(20),
});

const deltaQuerySchema = z.object({
  nowDays: z.coerce.number().optional().default(30),
  limit: z.coerce.number().optional().default(5),
});

function isActive(listing: Listing): boolean {
  const status = listing.status?.toLowerCase();
  if (!status) {
    return true;
  }
  return !ACTIVE_EXCLUSIONS.has(status);
}

function latestSnapshotDate(listings: Listing[]): Date {
  let max = new Date(0);
  for (const listing of listings) {
    if (!listing.snapshot_at) {
      continue;
    }
    const date = new Date(listing.snapshot_at);
    if (!Number.isNaN(date.getTime()) && date > max) {
      max = date;
    }
  }
  return max.getTime() === 0 ? new Date() : new Date(Date.UTC(max.getUTCFullYear(), max.getUTCMonth(), max.getUTCDate()));
}

function applyWindowFilter(listings: Listing[], start: Date, end: Date): Listing[] {
  const startStr = formatDate(start);
  const endStr = formatDate(end);
  return listings.filter((listing) => {
    if (!listing.snapshot_at) {
      return false;
    }
    const day = listing.snapshot_at.slice(0, 10);
    return day >= startStr && day <= endStr;
  });
}

function aggregateArray(listings: Listing[], key: "broker", limit: number): BrokerAggregate[];
function aggregateArray(listings: Listing[], key: "chain", limit: number): ChainAggregate[];
function aggregateArray(listings: Listing[], key: "broker" | "chain", limit: number) {
  if (key === "broker") {
    const map = new Map<
      string,
      { chain: string | null; role: string | null; total: number; countActive: number; countSold: number; valueCount: number }
    >();
    for (const listing of listings) {
      const brokerName = (listing.broker ?? "Ukjent") as string;
      const entry =
        map.get(brokerName) ?? {
          chain: listing.chain ?? null,
          role: listing.role ?? listing.broker_role ?? null,
          total: 0,
          countActive: 0,
          countSold: 0,
          valueCount: 0,
        };
      const status = (listing.status ?? "").toLowerCase();
      const isSold = Boolean(listing.is_sold) || status === "sold" || status === "solgt";
      if (isSold) {
        entry.countSold += 1;
      } else if (isActive(listing)) {
        entry.countActive += 1;
      }
      if (listing.price != null) {
        entry.total += listing.price;
        entry.valueCount += 1;
      }
      entry.chain = entry.chain ?? listing.chain ?? null;
      entry.role = entry.role ?? listing.role ?? listing.broker_role ?? null;
      map.set(brokerName, entry);
    }
    return [...map.entries()]
      .map(([name, value]) => ({
        broker: name === "Ukjent" ? null : name,
        chain: value.chain,
        role: value.role,
        count_active: value.countActive,
        count_sold: value.countSold,
        count: value.countActive + value.countSold,
        total_value: Math.round(value.total),
        avg_value: value.valueCount ? Math.round(value.total / value.valueCount) : 0,
      }))
      .sort((a, b) => b.total_value - a.total_value)
      .slice(0, limit);
  }

  const map = new Map<string, { total: number; count: number }>();
  for (const listing of listings) {
    if (!isActive(listing)) {
      continue;
    }
    const identifier = (listing.chain ?? "Ukjent") as string;
    const entry = map.get(identifier) ?? { total: 0, count: 0 };
    entry.total += listing.price ?? 0;
    entry.count += 1;
    map.set(identifier, entry);
  }
  return [...map.entries()]
    .map(([name, value]) => ({
      chain: name,
      total_value: Math.round(value.total),
      count: value.count,
      avg_value: value.count ? Math.round(value.total / value.count) : 0,
    }))
    .sort((a, b) => b.total_value - a.total_value)
    .slice(0, limit);
}

export const aggregateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/agg/brokers", async (request, reply) => {
    const parsed = brokerAggQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { window, limit, sort } = parsed.data;
    const filters: ListingFilters = toListingFilters(parsed.data);

    if (config.useSample) {
      const listings = getSampleListings();
      const latestDate = latestSnapshotDate(listings);
      const latestDay = formatDate(latestDate);

      if (!filters.since && !filters.until) {
        if (window && window !== "now") {
          const days = parseWindow(window, 30);
          const end = latestDate;
          const start = shiftDate(new Date(end), days);
          filters.since = formatDate(start);
          filters.until = formatDate(end);
        } else {
          filters.since = latestDay;
          filters.until = latestDay;
        }
      }

      const filtered = filterSampleListings(listings, filters, {
        applyMinSoldCount: false,
      });
      const map = new Map<
        string,
        {
          chain: string | null;
          role: string | null;
          countActive: number;
          countSold: number;
          total: number;
          valueCount: number;
        }
      >();

      for (const listing of filtered) {
        const brokerName = listing.broker?.trim();
        if (!brokerName) continue;
        const key = brokerName;
        const entry =
          map.get(key) ??
          {
            chain: listing.chain ?? null,
            role: listing.role ?? listing.broker_role ?? null,
            countActive: 0,
            countSold: 0,
            total: 0,
            valueCount: 0,
          };
        entry.chain = entry.chain ?? listing.chain ?? null;
        entry.role = entry.role ?? listing.role ?? listing.broker_role ?? null;
        const status = (listing.status ?? "").toLowerCase();
        const isSold = Boolean(listing.is_sold) || status === "sold" || status === "solgt";
        if (isSold) {
          entry.countSold += 1;
        } else if (isActive(listing)) {
          entry.countActive += 1;
        }
        if (listing.price != null) {
          entry.total += listing.price;
          entry.valueCount += 1;
        }
        map.set(key, entry);
      }

      let results = [...map.entries()].map(([brokerName, data]) => ({
        broker: brokerName,
        chain: data.chain,
        role: data.role,
        count_active: data.countActive,
        count_sold: data.countSold,
        count: data.countActive + data.countSold,
        total_value: Math.round(data.total),
        avg_value: data.valueCount ? Math.round(data.total / data.valueCount) : 0,
      }));

      if (filters.minSoldCount && filters.minSoldCount > 0) {
        results = results.filter((entry) => entry.count_sold >= filters.minSoldCount!);
      }

      const sortKey = ({
        total_value: "total_value",
        avg_value: "avg_value",
        count_sold: "count_sold",
        count_active: "count_active",
      } as const)[sort];

      results.sort((a, b) => {
        const primary =
          (b as Record<typeof sortKey, number>)[sortKey] - (a as Record<typeof sortKey, number>)[sortKey];
        if (primary !== 0) return primary;
        return b.total_value - a.total_value;
      });

      return results.slice(0, limit);
    }

    if (!filters.since && !filters.until) {
      const latest = await queryOne<{ day: string }>(
        `
        SELECT to_char(max(date_trunc('day', snapshot_at::timestamp)), 'YYYY-MM-DD') AS day
        FROM listings
        `
      );
      if (!latest?.day) {
        return [];
      }
      if (window && window !== "now") {
        const days = parseWindow(window, 30);
        const end = new Date(`${latest.day}T00:00:00Z`);
        const start = shiftDate(new Date(end), days);
        filters.since = formatDate(start);
        filters.until = formatDate(end);
      } else {
        filters.since = latest.day;
        filters.until = latest.day;
      }
    }

    const { clause, params, nextIndex } = buildSqlFilter(filters);
    const sortColumn = (() => {
      switch (sort) {
        case "avg_value":
          return "avg_value";
        case "count_sold":
          return "count_sold";
        case "count_active":
          return "count_active";
        default:
          return "total_value";
      }
    })();

    let sql = `
      WITH filtered AS (
        SELECT *
        FROM listings_latest
        ${clause}
      )
      SELECT
        broker,
        COALESCE(MAX(chain), NULL) AS chain,
        COALESCE(MAX(role), MAX(broker_role)) AS role,
        COUNT(*) FILTER (WHERE is_sold IS NOT TRUE) AS count_active,
        COUNT(*) FILTER (WHERE is_sold IS TRUE) AS count_sold,
        COUNT(*) AS count_total,
        COALESCE(SUM(price), 0) AS total_value,
        COALESCE(AVG(price), 0) AS avg_value
      FROM filtered
      WHERE broker IS NOT NULL AND broker <> ''
      GROUP BY broker
    `;

    const finalParams = [...params];
    let parameterIndex = nextIndex;

    if (filters.minSoldCount && filters.minSoldCount > 0) {
      sql += ` HAVING COUNT(*) FILTER (WHERE is_sold IS TRUE) >= $${parameterIndex}`;
      finalParams.push(filters.minSoldCount);
      parameterIndex += 1;
    }

    sql += ` ORDER BY ${sortColumn} DESC, total_value DESC LIMIT $${parameterIndex}`;
    finalParams.push(limit);

    const rows = await query<{
      broker: string | null;
      chain: string | null;
      role: string | null;
      count_active: number | null;
      count_sold: number | null;
      count_total: number | null;
      total_value: number | null;
      avg_value: number | null;
    }>(sql, finalParams);

    return rows.map((row) => ({
      broker: row.broker,
      chain: row.chain,
      role: row.role,
      count_active: Number(row.count_active ?? 0),
      count_sold: Number(row.count_sold ?? 0),
      count: Number(row.count_total ?? 0),
      total_value: Number(row.total_value ?? 0),
      avg_value: Math.round(Number(row.avg_value ?? 0)),
    }));
  });

  app.get("/api/agg/chains", async (request, reply) => {
    const parsed = aggQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { window, limit } = parsed.data;

    if (config.useSample) {
      const listings = getSampleListings();
      const latest = latestSnapshotDate(listings);
      const end = window === "now" ? latest : latest;
      const days = window === "now" ? 0 : parseWindow(window, 30);
      const start = shiftDate(end, days);
      const filtered = applyWindowFilter(listings, start, end);
      return aggregateArray(filtered, "chain", limit);
    }

    let startDate: string;
    let endDate: string;

    if (window === "now") {
      const latest = await queryOne<{ day: string }>(
        `
        SELECT to_char(max(date_trunc('day', snapshot_at::timestamp)), 'YYYY-MM-DD') AS day
        FROM listings
        `
      );
      if (!latest?.day) {
        return [];
      }
      startDate = latest.day;
      endDate = latest.day;
    } else {
      const days = parseWindow(window, 30);
      const latest = await queryOne<{ day: string }>(
        `
        SELECT to_char(max(date_trunc('day', snapshot_at::timestamp)), 'YYYY-MM-DD') AS day
        FROM listings
        `
      );
      if (!latest?.day) {
        return [];
      }
      const end = new Date(`${latest.day}T00:00:00Z`);
      const start = shiftDate(end, days);
      startDate = formatDate(start);
      endDate = formatDate(end);
    }

    const rows = await query<ChainAggregate>(
      `
      SELECT
        chain,
        SUM(price) FILTER (WHERE price IS NOT NULL AND (status IS NULL OR LOWER(status) NOT IN ('sold', 'solgt', 'inactive', 'withdrawn'))) AS total_value,
        COUNT(*) FILTER (WHERE price IS NOT NULL AND (status IS NULL OR LOWER(status) NOT IN ('sold', 'solgt', 'inactive', 'withdrawn'))) AS count,
        AVG(price) FILTER (WHERE price IS NOT NULL AND (status IS NULL OR LOWER(status) NOT IN ('sold', 'solgt', 'inactive', 'withdrawn'))) AS avg_value
      FROM listings
      WHERE snapshot_at::date BETWEEN $1::date AND $2::date
      GROUP BY chain
      ORDER BY total_value DESC NULLS LAST
      LIMIT $3
      `,
      [startDate, endDate, limit]
    );

    return rows.map((row) => ({
      chain: row.chain,
      total_value: Number(row.total_value ?? 0),
      count: Number(row.count ?? 0),
      avg_value: Math.round(Number(row.avg_value ?? 0)),
    }));
  });

  app.get("/api/agg/deltas", async (request, reply) => {
    const parsed = deltaQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { nowDays, limit } = parsed.data;

    if (config.useSample) {
      const listings = getSampleListings();
      const end = latestSnapshotDate(listings);
      const startNow = shiftDate(end, nowDays);
      const startPrev = shiftDate(startNow, nowDays);

      const nowSlice = applyWindowFilter(listings, startNow, end);
      const prevSlice = applyWindowFilter(listings, startPrev, startNow);

      const nowAgg = aggregateArray(nowSlice, "broker", 100);
      const prevAgg = aggregateArray(prevSlice, "broker", 100);

      const map = new Map<string, { chain: string | null; now: number; prev: number }>();
      for (const record of nowAgg) {
        map.set(record.broker ?? "Ukjent", { chain: record.chain ?? null, now: record.total_value, prev: 0 });
      }
      for (const record of prevAgg) {
        const entry = map.get(record.broker ?? "Ukjent") ?? {
          chain: record.chain ?? null,
          now: 0,
          prev: 0,
        };
        entry.prev = record.total_value;
        entry.chain = entry.chain ?? record.chain ?? null;
        map.set(record.broker ?? "Ukjent", entry);
      }

      const deltas = [...map.entries()]
        .map(([broker, value]) => ({
          broker,
          chain: value.chain,
          now_value: value.now,
          prev_value: value.prev,
          delta: value.now - value.prev,
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, limit * 2); // keep more for splitting growing/falling

      return deltas;
    }

    const latest = await queryOne<{ day: string }>(
      `
      SELECT to_char(max(date_trunc('day', snapshot_at::timestamp)), 'YYYY-MM-DD') AS day
      FROM listings
      `
    );
    if (!latest?.day) {
      return [];
    }
    const end = new Date(`${latest.day}T00:00:00Z`);
    const startNow = shiftDate(end, nowDays);
    const startPrev = shiftDate(startNow, nowDays);

    const rows = await query<DeltaAggregate>(
      `
      WITH base AS (
        SELECT
          broker,
          chain,
          price,
          COALESCE(published::date, snapshot_at::date) AS effective_date
        FROM listings
        WHERE price IS NOT NULL
      ),
      now_window AS (
        SELECT broker,
               chain,
               SUM(price) AS total_value
        FROM base
        WHERE effective_date BETWEEN $1::date AND $2::date
        GROUP BY broker, chain
      ),
      prev_window AS (
        SELECT broker,
               chain,
               SUM(price) AS total_value
        FROM base
        WHERE effective_date BETWEEN $3::date AND $4::date
        GROUP BY broker, chain
      )
      SELECT
        COALESCE(n.broker, p.broker) AS broker,
        COALESCE(n.chain, p.chain) AS chain,
        COALESCE(n.total_value, 0) AS now_value,
        COALESCE(p.total_value, 0) AS prev_value,
        COALESCE(n.total_value, 0) - COALESCE(p.total_value, 0) AS delta
      FROM now_window n
      FULL OUTER JOIN prev_window p
        ON n.broker = p.broker AND COALESCE(n.chain, '') = COALESCE(p.chain, '')
      WHERE COALESCE(n.total_value, 0) <> 0 OR COALESCE(p.total_value, 0) <> 0
      ORDER BY abs(delta) DESC
      LIMIT $5
      `,
      [
        formatDate(startNow),
        formatDate(end),
        formatDate(startPrev),
        formatDate(startNow),
        limit * 2,
      ]
    );

    return rows.map((row) => ({
      broker: row.broker,
      chain: row.chain,
      now_value: Number(row.now_value ?? 0),
      prev_value: Number(row.prev_value ?? 0),
      delta: Number(row.delta ?? 0),
    }));
  });

  app.get("/api/agg/districts", async (request, reply) => {
    const schema = listingFilterSchema.extend({
      city: z.string().optional().default("Oslo"),
      limit: z.coerce.number().optional().default(5),
    });
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { city, limit, ...rest } = parsed.data;
    const filters = toListingFilters(rest);

    if (config.useSample) {
      const sampleFilters: ListingFilters = {
        ...filters,
        city,
      };
      const listings = filterSampleListings(getSampleListings(), sampleFilters, { applyMinSoldCount: false });
      const grouped = new Map<string, { brokers: Map<string, CommissionBrokerAggregate>; chains: Map<string, CommissionChainAggregate> }>();
      listings.forEach((listing) => {
        if (!listing.district) return;
        const entry = grouped.get(listing.district) ?? {
          brokers: new Map<string, CommissionBrokerAggregate>(),
          chains: new Map<string, CommissionChainAggregate>(),
        };
        const brokerKey = `${listing.broker ?? "Ukjent"}::${listing.chain ?? ""}`;
        const brokerEntry = entry.brokers.get(brokerKey) ?? {
          broker: listing.broker,
          chain: listing.chain,
          listings: 0,
          total_commission: 0,
          avg_commission: 0,
        };
        brokerEntry.listings += 1;
        brokerEntry.total_commission += listing.commission_est ?? 0;
        brokerEntry.avg_commission = brokerEntry.listings ? Math.round(brokerEntry.total_commission / brokerEntry.listings) : 0;
        entry.brokers.set(brokerKey, brokerEntry);

        const chainKey = listing.chain ?? "Ukjent";
        const chainEntry = entry.chains.get(chainKey) ?? {
          chain: listing.chain,
          listings: 0,
          total_commission: 0,
          avg_commission: 0,
        };
        chainEntry.listings += 1;
        chainEntry.total_commission += listing.commission_est ?? 0;
        chainEntry.avg_commission = chainEntry.listings ? Math.round(chainEntry.total_commission / chainEntry.listings) : 0;
        entry.chains.set(chainKey, chainEntry);

        grouped.set(listing.district, entry);
      });
      return [...grouped.entries()].map(([district, entry]) => ({
        district,
        brokers: [...entry.brokers.values()].sort((a, b) => b.total_commission - a.total_commission).slice(0, limit),
        chains: [...entry.chains.values()].sort((a, b) => b.total_commission - a.total_commission).slice(0, limit),
      }));
    }

    const { clause, params } = buildSqlFilter({ ...filters, city }, 3);
    const whereClause = clause ? clause.replace("WHERE", "AND") : "";

    const brokerRows = await query<{
      district: string;
      broker: string | null;
      chain: string | null;
      listings: number;
      total_commission: number;
      avg_commission: number;
      rank: number;
    }>(
      `
      SELECT * FROM (
        SELECT district,
               broker,
               chain,
               COUNT(*)::int AS listings,
               COALESCE(SUM(commission_est), 0) AS total_commission,
               COALESCE(AVG(commission_est), 0) AS avg_commission,
               ROW_NUMBER() OVER (PARTITION BY district ORDER BY COALESCE(SUM(commission_est), 0) DESC) AS rank
        FROM listings_latest
        WHERE city = $1::text AND district IS NOT NULL AND district <> ''
          ${whereClause}
        GROUP BY district, broker, chain
      ) ranked
      WHERE rank <= $2
      `,
      [city, limit, ...params]
    );

    const chainRows = await query<{
      district: string;
      chain: string | null;
      listings: number;
      total_commission: number;
      avg_commission: number;
      rank: number;
    }>(
      `
      SELECT * FROM (
        SELECT district,
               chain,
               COUNT(*)::int AS listings,
               COALESCE(SUM(commission_est), 0) AS total_commission,
               COALESCE(AVG(commission_est), 0) AS avg_commission,
               ROW_NUMBER() OVER (PARTITION BY district ORDER BY COALESCE(SUM(commission_est), 0) DESC) AS rank
        FROM listings_latest
        WHERE city = $1::text AND district IS NOT NULL AND district <> ''
          ${whereClause}
        GROUP BY district, chain
      ) ranked
      WHERE rank <= $2
      `,
      [city, limit, ...params]
    );

    const grouped = new Map<string, DistrictAggregate>();
    for (const row of brokerRows) {
      const entry = grouped.get(row.district) ?? {
        district: row.district,
        brokers: [],
        chains: [],
      };
      (entry.brokers as CommissionBrokerAggregate[]).push({
        broker: row.broker,
        chain: row.chain,
        listings: Number(row.listings ?? 0),
        total_commission: Number(row.total_commission ?? 0),
        avg_commission: Number(row.avg_commission ?? 0),
      });
      grouped.set(row.district, entry);
    }
    for (const row of chainRows) {
      const entry = grouped.get(row.district) ?? {
        district: row.district,
        brokers: [],
        chains: [],
      };
      (entry.chains as CommissionChainAggregate[]).push({
        chain: row.chain,
        listings: Number(row.listings ?? 0),
        total_commission: Number(row.total_commission ?? 0),
        avg_commission: Number(row.avg_commission ?? 0),
      });
      grouped.set(row.district, entry);
    }

    return [...grouped.values()].map((entry) => ({
      district: entry.district,
      brokers: entry.brokers,
      chains: entry.chains,
    }));
  });
};
