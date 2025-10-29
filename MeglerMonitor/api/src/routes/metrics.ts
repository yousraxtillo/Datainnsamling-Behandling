import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { config } from "../config";
import { queryOne } from "../db";
import { getSampleListings, getSampleMetrics } from "../sample";
import type { Metrics } from "../types";
import { formatDate, parseWindow, shiftDate } from "../utils/time";

const ACTIVE_EXCLUSIONS = new Set(["sold", "solgt", "inactive", "withdrawn"]);

const metricsQuerySchema = z.object({
  asOf: z.string().optional().default("latest"),
  window: z.string().optional().default("12m"),
});

function filterActiveListings(listings: ReturnType<typeof getSampleListings>, windowDays: number, asOf: Date): Metrics {
  const windowStart = shiftDate(asOf, windowDays);
  const relevant = listings.filter((listing) => {
    if (!listing.snapshot_at) {
      return false;
    }
    const snapshotDate = new Date(listing.snapshot_at);
    return snapshotDate >= windowStart && snapshotDate <= asOf;
  });
  const active = relevant.filter((listing) => {
    const status = listing.status?.toLowerCase();
    if (!status) {
      return true;
    }
    return !ACTIVE_EXCLUSIONS.has(status);
  });
  const totalValue = active.reduce((acc, item) => acc + (item.price ?? 0), 0);
  const agents = new Set(active.map((item) => item.broker).filter(Boolean));
  return {
    as_of: asOf.toISOString(),
    total_value: totalValue,
    active_agents: agents.size,
  };
}

export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/metrics", async (request, reply) => {
    const parsed = metricsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { asOf, window } = parsed.data;
    const windowDays = parseWindow(window);

    if (config.useSample) {
      const listings = getSampleListings();
      const metrics = getSampleMetrics();
      const asOfDate =
        asOf !== "latest"
          ? new Date(`${asOf}T00:00:00Z`)
          : new Date(metrics.as_of);
      return filterActiveListings(listings, windowDays, asOfDate);
    }

    let asOfDate: Date | null = null;

    if (asOf !== "latest") {
      asOfDate = new Date(`${asOf}T00:00:00Z`);
    } else {
      const latest = await queryOne<{ latest_day: string }>(
        `
        SELECT to_char(max(date_trunc('day', snapshot_at::timestamp)), 'YYYY-MM-DD') AS latest_day
        FROM listings
        `
      );
      if (!latest?.latest_day) {
        return {
          as_of: new Date().toISOString(),
          total_value: 0,
          active_agents: 0,
        };
      }
      asOfDate = new Date(`${latest.latest_day}T00:00:00Z`);
    }

    if (Number.isNaN(asOfDate.getTime())) {
      return reply.status(400).send({ error: "Invalid asOf date" });
    }

    const windowStart = shiftDate(asOfDate, windowDays);
    const asOfDateStr = formatDate(asOfDate);
    const windowStartStr = formatDate(windowStart);

    const row = await queryOne<Metrics>(
      `
      WITH windowed AS (
        SELECT *
        FROM listings
        WHERE snapshot_at::date BETWEEN $1::date AND $2::date
      ),
      latest_per_listing AS (
        SELECT DISTINCT ON (source, listing_id)
               source,
               listing_id,
               price,
               status,
               broker,
               snapshot_at
        FROM windowed
        ORDER BY source, listing_id, snapshot_at DESC
      )
      SELECT
        to_char(timezone('UTC', (SELECT max(snapshot_at) FROM windowed)), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS as_of,
        COALESCE(SUM(price) FILTER (
          WHERE price IS NOT NULL
            AND (status IS NULL OR LOWER(status) NOT IN ('sold', 'solgt', 'inactive', 'withdrawn'))
        ), 0) AS total_value,
        COALESCE(COUNT(DISTINCT broker) FILTER (
          WHERE broker IS NOT NULL
            AND (status IS NULL OR LOWER(status) NOT IN ('sold', 'solgt', 'inactive', 'withdrawn'))
        ), 0) AS active_agents
      FROM latest_per_listing
      `,
      [windowStartStr, asOfDateStr]
    );

    if (!row) {
      return {
        as_of: asOfDate.toISOString(),
        total_value: 0,
        active_agents: 0,
      };
    }

    return {
      as_of: row.as_of ?? asOfDate.toISOString(),
      total_value: Number(row.total_value) ?? 0,
      active_agents: Number(row.active_agents) ?? 0,
    };
  });
};
