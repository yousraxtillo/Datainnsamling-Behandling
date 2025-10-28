import { z } from "zod";

import type { Listing } from "../types";

export const listingFilterSchema = z.object({
  source: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  chain: z.string().optional(),
  broker: z.string().optional(),
  broker_role: z.string().optional(),
  property_type: z.string().optional(),
  role: z.string().optional(),
  segment: z.string().optional(),
  price_bucket: z.string().optional(),
  price_min: z.coerce.number().optional(),
  price_max: z.coerce.number().optional(),
  only_sold: z.coerce.boolean().optional(),
  min_sold_count: z.coerce.number().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  search: z.string().optional(),
});

export type ListingFilterQuery = z.infer<typeof listingFilterSchema>;

export interface ListingFilters {
  sources?: string[];
  city?: string;
  districts?: string[];
  chains?: string[];
  brokers?: string[];
  roles?: string[];
  propertyTypes?: string[];
  segments?: string[];
  priceBuckets?: string[];
  priceMin?: number;
  priceMax?: number;
  onlySold?: boolean;
  since?: string;
  until?: string;
  searchTokens?: string[];
  minSoldCount?: number;
}

const SOLD_STATUSES = new Set(["sold", "solgt"]);

const parseList = (value?: string): string[] | undefined => {
  if (!value) return undefined;
  const list = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
};

export function toListingFilters(input: ListingFilterQuery): ListingFilters {
  const roles = parseList(input.role) ?? parseList(input.broker_role);
  const minSoldCount =
    typeof input.min_sold_count === "number" && Number.isFinite(input.min_sold_count)
      ? Math.max(0, Math.trunc(input.min_sold_count))
      : undefined;

  return {
    sources: parseList(input.source),
    city: input.city,
    districts: parseList(input.district),
    chains: parseList(input.chain),
    brokers: parseList(input.broker),
    roles,
    propertyTypes: parseList(input.property_type),
    segments: parseList(input.segment),
    priceBuckets: parseList(input.price_bucket),
    priceMin: input.price_min,
    priceMax: input.price_max,
    onlySold: input.only_sold,
    since: input.since,
    until: input.until,
    searchTokens: input.search
      ? input.search
          .split(/\s+/)
          .map((token) => token.trim().toLowerCase())
          .filter(Boolean)
      : undefined,
    minSoldCount,
  };
}

const matchesStringList = (list: string[] | undefined, value: string | null | undefined) => {
  if (!list || !list.length) return true;
  if (!value) return false;
  return list.some((item) => item.toLowerCase() === value.toLowerCase());
};

const withinNumberRange = (value: number | null | undefined, min?: number, max?: number) => {
  if (value == null) return true;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
};

export function filterListingsByMinSoldCount(listings: Listing[], minSoldCount?: number): Listing[] {
  if (!minSoldCount || minSoldCount <= 0) {
    return listings;
  }
  const counts = new Map<string, number>();
  for (const listing of listings) {
    if (!listing.is_sold && !SOLD_STATUSES.has((listing.status ?? "").toLowerCase())) {
      continue;
    }
    const key = (listing.broker ?? "").trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (!counts.size) {
    return [];
  }
  const allowed = new Set<string>();
  for (const [broker, count] of counts.entries()) {
    if (count >= minSoldCount) {
      allowed.add(broker);
    }
  }
  return listings.filter((listing) => allowed.has((listing.broker ?? "").trim().toLowerCase()));
}

export function filterSampleListings(
  listings: Listing[],
  filters: ListingFilters,
  options?: { defaultDay?: string | null; applyMinSoldCount?: boolean }
): Listing[] {
  const { defaultDay, applyMinSoldCount = true } = options ?? {};
  const effectiveSince = filters.since ?? defaultDay ?? undefined;
  const effectiveUntil = filters.until ?? defaultDay ?? undefined;

  const filtered = listings.filter((listing) => {
    if (filters.sources?.length && !filters.sources.includes(listing.source)) {
      return false;
    }
    if (filters.city && (!listing.city || listing.city.toLowerCase() !== filters.city.toLowerCase())) {
      return false;
    }
    if (!matchesStringList(filters.districts, listing.district)) {
      return false;
    }
    if (!matchesStringList(filters.chains, listing.chain)) {
      return false;
    }
    if (!matchesStringList(filters.brokers, listing.broker)) {
      return false;
    }
    if (!matchesStringList(filters.roles, listing.role ?? listing.broker_role)) {
      return false;
    }
    if (!matchesStringList(filters.propertyTypes, listing.property_type)) {
      return false;
    }
    if (!matchesStringList(filters.segments, listing.segment)) {
      return false;
    }
    if (!matchesStringList(filters.priceBuckets, listing.price_bucket)) {
      return false;
    }
    if (!withinNumberRange(listing.price, filters.priceMin, filters.priceMax)) {
      return false;
    }
    if (filters.onlySold && !(listing.is_sold || SOLD_STATUSES.has((listing.status ?? "").toLowerCase()))) {
      return false;
    }
    if (filters.searchTokens && filters.searchTokens.length) {
      const haystack = [
        listing.broker,
        listing.chain,
        listing.city,
        listing.district,
        listing.property_type,
        listing.segment,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      for (const token of filters.searchTokens) {
        if (!haystack.includes(token)) {
          return false;
        }
      }
    }
    if (effectiveSince) {
      if (!listing.snapshot_at || listing.snapshot_at.slice(0, 10) < effectiveSince) {
        return false;
      }
    }
    if (effectiveUntil) {
      if (!listing.snapshot_at || listing.snapshot_at.slice(0, 10) > effectiveUntil) {
        return false;
      }
    }
    return true;
  });

  if (!applyMinSoldCount) {
    return filtered;
  }
  return filterListingsByMinSoldCount(filtered, filters.minSoldCount);
}

export function buildSqlFilter(filters: ListingFilters, startIndex = 1): {
  clause: string;
  params: unknown[];
  nextIndex: number;
} {
  const params: unknown[] = [];
  const conditions: string[] = [];
  let index = startIndex;

  const addParam = (value: unknown) => {
    params.push(value);
    return `$${index++}`;
  };

  if (filters.sources?.length) {
    conditions.push(`source = ANY(${addParam(filters.sources)})`);
  }
  if (filters.city) {
    conditions.push(`LOWER(city) = LOWER(${addParam(filters.city)})`);
  }
  if (filters.districts?.length) {
    conditions.push(`district = ANY(${addParam(filters.districts)})`);
  }
  if (filters.chains?.length) {
    conditions.push(`chain = ANY(${addParam(filters.chains)})`);
  }
  if (filters.brokers?.length) {
    conditions.push(`broker = ANY(${addParam(filters.brokers)})`);
  }
  if (filters.roles?.length) {
    conditions.push(`role = ANY(${addParam(filters.roles)})`);
  }
  if (filters.propertyTypes?.length) {
    conditions.push(`property_type = ANY(${addParam(filters.propertyTypes)})`);
  }
  if (filters.segments?.length) {
    conditions.push(`segment = ANY(${addParam(filters.segments)})`);
  }
  if (filters.priceBuckets?.length) {
    conditions.push(`price_bucket = ANY(${addParam(filters.priceBuckets)})`);
  }
  if (filters.priceMin != null) {
    conditions.push(`price >= ${addParam(filters.priceMin)}`);
  }
  if (filters.priceMax != null) {
    conditions.push(`price <= ${addParam(filters.priceMax)}`);
  }
  if (filters.onlySold) {
    conditions.push(`is_sold IS TRUE`);
  }
  if (filters.searchTokens && filters.searchTokens.length) {
    for (const token of filters.searchTokens) {
      const placeholder = addParam(`%${token}%`);
      conditions.push(
        `(LOWER(broker) LIKE LOWER(${placeholder}) OR LOWER(chain) LIKE LOWER(${placeholder}) OR LOWER(city) LIKE LOWER(${placeholder}) OR LOWER(COALESCE(district, '')) LIKE LOWER(${placeholder}) OR LOWER(COALESCE(property_type, '')) LIKE LOWER(${placeholder}) OR LOWER(COALESCE(segment, '')) LIKE LOWER(${placeholder}))`
      );
    }
  }
  if (filters.since) {
    conditions.push(`snapshot_at::date >= ${addParam(filters.since)}`);
  }
  if (filters.until) {
    conditions.push(`snapshot_at::date <= ${addParam(filters.until)}`);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
    nextIndex: index,
  };
}
