CREATE TABLE IF NOT EXISTS listings_latest (
    source TEXT CHECK (source IN ('Hjem.no', 'DNB')) NOT NULL,
    listing_id TEXT NOT NULL,
    title TEXT,
    address TEXT,
    city TEXT,
    district TEXT,
    chain TEXT,
    broker TEXT,
    price BIGINT,
    commission_est BIGINT,
    status TEXT,
    published TIMESTAMPTZ,
    property_type TEXT,
    segment TEXT,
    price_bucket TEXT,
    broker_role TEXT,
    role TEXT,
    is_sold BOOLEAN,
    last_seen_at TIMESTAMPTZ,
    snapshot_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (source, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_latest_city ON listings_latest (city);
CREATE INDEX IF NOT EXISTS idx_listings_latest_city_district ON listings_latest (city, district);
CREATE INDEX IF NOT EXISTS idx_listings_latest_chain ON listings_latest (chain);
CREATE INDEX IF NOT EXISTS idx_listings_latest_broker ON listings_latest (broker);
CREATE INDEX IF NOT EXISTS idx_listings_latest_role ON listings_latest (role);
CREATE INDEX IF NOT EXISTS idx_listings_latest_segment ON listings_latest (segment);
CREATE INDEX IF NOT EXISTS idx_listings_latest_is_sold ON listings_latest (is_sold);
CREATE INDEX IF NOT EXISTS idx_listings_latest_snapshot_at ON listings_latest (snapshot_at);

INSERT INTO listings_latest (
    source,
    listing_id,
    title,
    address,
    city,
    district,
    chain,
    broker,
    price,
    commission_est,
    status,
    published,
    property_type,
    segment,
    price_bucket,
    broker_role,
    role,
    is_sold,
    last_seen_at,
    snapshot_at
)
SELECT DISTINCT ON (source, listing_id)
    source,
    listing_id,
    title,
    address,
    city,
    district,
    chain,
    broker,
    price,
    commission_est,
    status,
    published,
    property_type,
    segment,
    price_bucket,
    broker_role,
    role,
    is_sold,
    last_seen_at,
    snapshot_at
FROM listings
ORDER BY source, listing_id, snapshot_at DESC
ON CONFLICT (source, listing_id) DO NOTHING;
