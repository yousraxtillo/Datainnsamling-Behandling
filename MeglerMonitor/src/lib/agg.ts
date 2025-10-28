import type { DeltaAggregate, Listing } from "./api";

export function splitDeltas(deltas: DeltaAggregate[] | undefined, limit = 5) {
  if (!deltas) {
    return { growing: [], falling: [] };
  }
  const growing = deltas
    .filter((item) => item.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
  const falling = deltas
    .filter((item) => item.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);
  return { growing, falling };
}

export function uniqueValues(listings: Listing[] | undefined, key: keyof Listing) {
  if (!listings) return [];
  const set = new Set<string>();
  for (const listing of listings) {
    const value = listing[key];
    if (value && typeof value === "string") {
      set.add(value);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function computeAverageDaysOnMarket(listings: Listing[] | undefined): number | null {
  if (!listings?.length) {
    return null;
  }
  const values: number[] = [];
  for (const listing of listings) {
    if (!listing.published || !listing.snapshot_at) continue;
    const published = new Date(listing.published);
    const snapshot = new Date(listing.snapshot_at);
    if (Number.isNaN(published.getTime()) || Number.isNaN(snapshot.getTime())) continue;
    const diff = snapshot.getTime() - published.getTime();
    if (diff <= 0) continue;
    values.push(Math.round(diff / (1000 * 60 * 60 * 24)));
  }
  if (!values.length) return null;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / values.length);
}

export function countSold(listings: Listing[] | undefined): number {
  if (!listings) {
    return 0;
  }
  return listings.filter((listing) => {
    if (typeof listing.is_sold === "boolean") {
      return listing.is_sold;
    }
    return listing.status?.toLowerCase() === "sold";
  }).length;
}
