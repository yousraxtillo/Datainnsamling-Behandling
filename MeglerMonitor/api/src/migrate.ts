import { readFileSync, readdirSync } from "fs";
import path from "path";

import { config } from "./config";
import { getClient } from "./db";

async function runMigrations() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const migrationsDir = path.resolve(__dirname, "../..", "infra", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const client = await getClient();
  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = readFileSync(filePath, "utf-8");
      console.log(`Running migration ${file}`);
      await client.query(sql);
    }
  } finally {
    client.release();
  }
}

runMigrations()
  .then(() => {
    console.log("Migrations completed.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
