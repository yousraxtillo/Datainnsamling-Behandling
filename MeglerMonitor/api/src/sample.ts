import { readFileSync } from "fs";
import path from "path";

import type { Listing, Metrics } from "./types";

const SOLD_STATUSES = new Set(["sold", "solgt"]);

function derivePriceBucket(price: number | null | undefined): string | null {
  if (price == null || price <= 0) {
    return null;
  }
  if (price < 5_000_000) return "0-5M";
  if (price < 10_000_000) return "5-10M";
  if (price < 20_000_000) return "10-20M";
  return "20M+";
}

function deriveSegment(propertyType: string | null | undefined, title: string | null | undefined): string | null {
  const source = [propertyType, title].filter(Boolean).join(" ").toLowerCase();
  if (!source) {
    return propertyType ?? null;
  }
  if (source.includes("nybygg") || source.includes("prosjekt")) {
    return "Nybygg";
  }
  if (source.includes("rekkehus") || source.includes("townhouse") || source.includes("småhus") || source.includes("tomannsbolig")) {
    return "Rekkehus";
  }
  if (source.includes("leilig")) {
    return "Leilighet";
  }
  if (source.includes("enebolig")) {
    return "Enebolig";
  }
  if (source.includes("fritids")) {
    return "Fritidsbolig";
  }
  if (source.includes("tomt")) {
    return "Tomt";
  }
  return propertyType ?? null;
}

function normalizeListing(listing: Listing): Listing {
  return {
    ...listing,
    is_sold: listing.is_sold ?? SOLD_STATUSES.has((listing.status ?? "").toLowerCase()),
    price_bucket: listing.price_bucket ?? derivePriceBucket(listing.price),
    segment: listing.segment ?? deriveSegment(listing.property_type, listing.title),
  };
}

const SAMPLE_ROOT = path.resolve(__dirname, "../..", "sample");

let cachedListings: Listing[] | null = null;
let cachedMetrics: Metrics | null = null;

function loadJson<T>(filename: string): T {
  const filePath = path.join(SAMPLE_ROOT, filename);
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export function getSampleListings(): Listing[] {
  if (!cachedListings) {
    const raw = loadJson<Listing[]>("all_listings.json");
    cachedListings = raw.map(normalizeListing);
  }
  return cachedListings;
}

export function getSampleMetrics(): Metrics {
  if (!cachedMetrics) {
    cachedMetrics = loadJson<Metrics>("metrics.json");
  }
  return cachedMetrics;
}
