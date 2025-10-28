import type { FastifyPluginAsync } from "fastify";

import { config } from "../config";
import { query } from "../db";
import { getSampleListings } from "../sample";
import { buildSqlFilter, filterSampleListings, listingFilterSchema, toListingFilters } from "../utils/filters";

export const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/meta/filters", async (request, reply) => {
    const parsed = listingFilterSchema.partial().safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const filters = toListingFilters(parsed.data);

    if (config.useSample) {
      const listings = getSampleListings();
      const filtered = filterSampleListings(listings, filters, { applyMinSoldCount: false });
      const cities = new Set<string>();
      const districts = new Map<string, Set<string>>();
      const roles = new Set<string>();
      const segments = new Set<string>();
      const priceBuckets = new Set<string>();
      const chains = new Set<string>();
      const sources = new Set<string>();

      for (const listing of filtered) {
        if (listing.city) {
          cities.add(listing.city);
        }
        if (listing.city && listing.district) {
          const cityKey = listing.city;
          const set = districts.get(cityKey) ?? new Set<string>();
          set.add(listing.district);
          districts.set(cityKey, set);
        }
        if (listing.role ?? listing.broker_role) {
          roles.add((listing.role ?? listing.broker_role) as string);
        }
        if (listing.segment) {
          segments.add(listing.segment);
        }
        if (listing.price_bucket) {
          priceBuckets.add(listing.price_bucket);
        }
        if (listing.chain) {
          chains.add(listing.chain);
        }
        sources.add(listing.source);
      }

      return {
        cities: [...cities].sort((a, b) => a.localeCompare(b)),
        districts: Object.fromEntries(
          [...districts.entries()].map(([city, values]) => [city, [...values].sort((a, b) => a.localeCompare(b))])
        ),
        roles: [...roles].sort((a, b) => a.localeCompare(b)),
        segments: [...segments].sort((a, b) => a.localeCompare(b)),
        price_buckets: [...priceBuckets].sort((a, b) => a.localeCompare(b)),
        chains: [...chains].sort((a, b) => a.localeCompare(b)),
        sources: [...sources].sort((a, b) => a.localeCompare(b)),
      };
    }

    const { clause, params } = buildSqlFilter(filters);
    const withFiltered = `WITH filtered AS (SELECT * FROM listings_latest ${clause})`;

    const [cityRows, districtRows, roleRows, segmentRows, priceBucketRows, chainRows, sourceRows] = await Promise.all([
      query<{ city: string }>(
        `${withFiltered}
         SELECT DISTINCT city FROM filtered WHERE city IS NOT NULL ORDER BY city`,
        params
      ),
      query<{ city: string; district: string }>(
        `${withFiltered}
         SELECT DISTINCT city, district FROM filtered WHERE city IS NOT NULL AND district IS NOT NULL ORDER BY city, district`,
        params
      ),
      query<{ role: string }>(
        `${withFiltered}
         SELECT DISTINCT role FROM filtered WHERE role IS NOT NULL ORDER BY role`,
        params
      ),
      query<{ segment: string }>(
        `${withFiltered}
         SELECT DISTINCT segment FROM filtered WHERE segment IS NOT NULL ORDER BY segment`,
        params
      ),
      query<{ price_bucket: string }>(
        `${withFiltered}
         SELECT DISTINCT price_bucket FROM filtered WHERE price_bucket IS NOT NULL ORDER BY price_bucket`,
        params
      ),
      query<{ chain: string }>(
        `${withFiltered}
         SELECT DISTINCT chain FROM filtered WHERE chain IS NOT NULL ORDER BY chain`,
        params
      ),
      query<{ source: string }>(
        `${withFiltered}
         SELECT DISTINCT source FROM filtered ORDER BY source`,
        params
      ),
    ]);

    const districtMap = new Map<string, Set<string>>();
    for (const row of districtRows) {
      if (!row.city || !row.district) continue;
      const set = districtMap.get(row.city) ?? new Set<string>();
      set.add(row.district);
      districtMap.set(row.city, set);
    }

    return {
      cities: cityRows.map((row) => row.city),
      districts: Object.fromEntries(
        [...districtMap.entries()].map(([city, values]) => [city, [...values].sort((a, b) => a.localeCompare(b))])
      ),
      roles: roleRows.map((row) => row.role),
      segments: segmentRows.map((row) => row.segment),
      price_buckets: priceBucketRows.map((row) => row.price_bucket),
      chains: chainRows.map((row) => row.chain),
      sources: sourceRows.map((row) => row.source),
    };
  });
};
