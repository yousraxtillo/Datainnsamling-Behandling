import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { config } from "./config";
import { closePool } from "./db";
import { aggregateRoutes } from "./routes/agg";
import { commissionsRoutes } from "./routes/commissions";
import { brokerRoutes } from "./routes/broker";
import { listingsRoutes } from "./routes/listings";
import { metricsRoutes } from "./routes/metrics";
import { metaRoutes } from "./routes/meta";

const app = Fastify({
  logger: true,
});

const allowedOrigins = config.corsOrigin.split(",").map((origin) => origin.trim());

app.register(cors, {
  origin: allowedOrigins.length === 1 && allowedOrigins[0] === "*" ? true : allowedOrigins,
});

app.register(rateLimit, {
  max: config.rateLimitMax,
  timeWindow: config.rateLimitTimeWindow,
});

app.get("/", async () => ({ 
  message: "MeglerMonitor API Server", 
  status: "running",
  endpoints: ["/api/health", "/api/listings", "/api/metrics", "/api/agg/*"]
}));

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/debug", async () => {
  try {
    const { query } = await import("./db");
    const rows = await query("SELECT COUNT(*) as count FROM listings LIMIT 1");
    const sample = await query("SELECT listing_id, snapshot_at, published FROM listings LIMIT 1");
    const dateTest = await query("SELECT DISTINCT snapshot_at::date as snapshot_date FROM listings ORDER BY snapshot_date LIMIT 5");
    const latestDate = await query("SELECT to_char(max(date_trunc('day', snapshot_at::timestamp)), 'YYYY-MM-DD') AS latest_day FROM listings");
    return {
      count: rows[0]?.count,
      sample: sample[0],
      distinctDates: dateTest,
      latestDateFunction: latestDate[0]?.latest_day,
      types: {
        snapshot_at: typeof sample[0]?.snapshot_at,
        published: typeof sample[0]?.published
      }
    };
  } catch (err: any) {
    return { error: err.message };
  }
});

app.register(listingsRoutes);
app.register(metricsRoutes);
app.register(aggregateRoutes);
app.register(commissionsRoutes);
app.register(brokerRoutes);
app.register(metaRoutes);

async function start() {
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

function handleExit(signal: NodeJS.Signals) {
  app.log.info(`Received ${signal}, shutting down gracefully`);
  closePool()
    .then(() => app.close())
    .then(() => process.exit(0))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);

start();
