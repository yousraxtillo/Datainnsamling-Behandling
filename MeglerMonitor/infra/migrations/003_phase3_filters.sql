ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS district TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT;

UPDATE listings
SET role = COALESCE(role, broker_role)
WHERE role IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_city_chain_district ON listings (city, chain, district);
CREATE INDEX IF NOT EXISTS idx_listings_property_type ON listings (property_type);
CREATE INDEX IF NOT EXISTS idx_listings_role ON listings (role);

DROP MATERIALIZED VIEW IF EXISTS broker_commission_stats;
CREATE MATERIALIZED VIEW broker_commission_stats AS
SELECT
    broker,
    chain,
    COUNT(*) FILTER (WHERE commission_est IS NOT NULL) AS listings,
    COALESCE(SUM(commission_est), 0) AS total_commission,
    COALESCE(AVG(commission_est), 0) AS avg_commission,
    MAX(snapshot_at) AS last_snapshot
FROM listings
GROUP BY broker, chain;

CREATE INDEX IF NOT EXISTS idx_broker_commission_stats_broker ON broker_commission_stats (broker, chain);
