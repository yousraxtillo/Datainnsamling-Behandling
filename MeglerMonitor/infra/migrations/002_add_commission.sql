ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS commission_est BIGINT;

UPDATE listings
SET commission_est = ROUND(price * 0.0125)
WHERE commission_est IS NULL
  AND price IS NOT NULL;

DROP MATERIALIZED VIEW IF EXISTS broker_commission_stats;

CREATE MATERIALIZED VIEW broker_commission_stats AS
SELECT
    broker,
    chain,
    COUNT(*) AS listings,
    COALESCE(SUM(commission_est), 0) AS total_commission,
    COALESCE(AVG(commission_est), 0) AS avg_commission,
    MAX(snapshot_at) AS last_snapshot
FROM listings
GROUP BY broker, chain;

CREATE INDEX IF NOT EXISTS idx_broker_commission_stats_broker ON broker_commission_stats (broker, chain);
