CREATE TABLE IF NOT EXISTS listings (
    id SERIAL PRIMARY KEY,
    source TEXT CHECK (source IN ('Hjem.no', 'DNB')),
    listing_id TEXT NOT NULL,
    title TEXT,
    address TEXT,
    city TEXT,
    chain TEXT,
    broker TEXT,
    price BIGINT,
    status TEXT,
    published TIMESTAMPTZ,
    property_type TEXT,
    broker_role TEXT,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    snapshot_at TIMESTAMPTZ NOT NULL,
    UNIQUE (source, listing_id, broker, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_listings_snapshot_at ON listings (snapshot_at);
CREATE INDEX IF NOT EXISTS idx_listings_broker_snapshot ON listings (broker, snapshot_at);
CREATE INDEX IF NOT EXISTS idx_listings_chain_snapshot ON listings (chain, snapshot_at);
