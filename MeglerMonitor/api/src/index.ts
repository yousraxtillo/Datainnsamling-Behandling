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

app.get("/api/health", async () => ({ ok: true }));

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
