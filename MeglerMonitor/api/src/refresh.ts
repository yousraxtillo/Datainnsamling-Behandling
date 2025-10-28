import { config } from "./config";
import { getClient } from "./db";

async function refresh() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to refresh materialized views.");
  }

  const client = await getClient();
  try {
    await client.query("REFRESH MATERIALIZED VIEW broker_commission_stats;");
    console.log("Refreshed broker_commission_stats");
  } finally {
    client.release();
  }
}

refresh()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
