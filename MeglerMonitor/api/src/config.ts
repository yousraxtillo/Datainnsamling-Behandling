import dotenv from "dotenv";

dotenv.config();

function toNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const config = {
  port: toNumber(process.env.PORT || process.env.API_PORT, 8000),
  databaseUrl: process.env.DATABASE_URL,
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  rateLimitMax: toNumber(process.env.RATE_LIMIT_MAX, 300),
  rateLimitTimeWindow: toNumber(process.env.RATE_LIMIT_TIME_WINDOW, 60_000),
  useSample: toBoolean(process.env.USE_SAMPLE, false),
};
