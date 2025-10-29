import type { FastifyPluginAsync } from "fastify";

import { config } from "../config";
import { query } from "../db";
import { getSampleListings } from "../sample";
import type { Listing } from "../types";
import {
  buildSqlFilter,
  filterListingsByMinSoldCount,
  filterSampleListings,
  listingFilterSchema,
  toListingFilters,
  type ListingFilters,
} from "../utils/filters";

async function fetchLatestSnapshotDate(): Promise<string | null> {
  const rows = await query<{ day: string }>(
    `
    SELECT to_char(max(date_trunc('day', snapshot_at)), 'YYYY-MM-DD') AS day
    FROM listings
    `
  );
  return rows[0]?.day ?? null;
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

export const listingsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/listings", async (request, reply) => {
    const parsed = listingFilterSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const filters: ListingFilters = toListingFilters(parsed.data);

    if (!filters.since && !filters.until) {
      const latest = await fetchLatestSnapshotDate();
      if (latest) {
        filters.since = latest;
        filters.until = latest;
      }
      // If no snapshot data exists, we'll query all available data without date filters
    }

    if (config.useSample) {
      const sample = getSampleListings();
      const latestDay = latestSampleDay(sample);
      return filterSampleListings(sample, filters, { defaultDay: latestDay });
    }

    const { clause, params } = buildSqlFilter(filters);
    const sql = `
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
             segment,
             price_bucket,
             broker_role,
             role,
             is_sold,
             to_char(timezone('UTC', last_seen_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
             to_char(timezone('UTC', snapshot_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS snapshot_at
      FROM listings_latest
      ${clause}
      ORDER BY snapshot_at DESC, price DESC NULLS LAST
    `;

    const rows = await query<Listing>(sql, params);
    const filtered = filterListingsByMinSoldCount(rows, filters.minSoldCount);
    return filtered;
  });
};
