import { Pool, type PoolClient, type QueryResultRow } from "pg";

import { config } from "./config";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required when USE_SAMPLE is false.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      application_name: "megler-monitor-api",
      max: 10,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
