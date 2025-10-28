ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS is_sold BOOLEAN,
    ADD COLUMN IF NOT EXISTS price_bucket TEXT,
    ADD COLUMN IF NOT EXISTS segment TEXT;

UPDATE listings
SET is_sold = CASE
    WHEN status IS NULL THEN FALSE
    WHEN LOWER(status) IN ('sold', 'solgt') THEN TRUE
    ELSE FALSE
END
WHERE is_sold IS NULL;

UPDATE listings
SET price_bucket = CASE
    WHEN price IS NULL OR price <= 0 THEN NULL
    WHEN price < 5000000 THEN '0-5M'
    WHEN price < 10000000 THEN '5-10M'
    WHEN price < 20000000 THEN '10-20M'
    ELSE '20M+'
END
WHERE price_bucket IS NULL;

UPDATE listings
SET segment = CASE
    WHEN property_type IS NULL THEN segment
    WHEN LOWER(property_type) LIKE 'leilighet%' THEN 'Leilighet'
    WHEN LOWER(property_type) LIKE 'enebolig%' THEN 'Enebolig'
    WHEN LOWER(property_type) LIKE 'rekkehus%' THEN 'Rekkehus'
    WHEN LOWER(property_type) LIKE 'tomannsbolig%' THEN 'Rekkehus'
    WHEN LOWER(property_type) LIKE 'nybygg%' THEN 'Nybygg'
    WHEN LOWER(property_type) LIKE 'prosjekt%' THEN 'Nybygg'
    ELSE property_type
END
WHERE segment IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_city ON listings (city);
CREATE INDEX IF NOT EXISTS idx_listings_city_district ON listings (city, district);
CREATE INDEX IF NOT EXISTS idx_listings_broker ON listings (broker);
CREATE INDEX IF NOT EXISTS idx_listings_chain ON listings (chain);
CREATE INDEX IF NOT EXISTS idx_listings_broker_role ON listings (broker_role);
CREATE INDEX IF NOT EXISTS idx_listings_segment ON listings (segment);
CREATE INDEX IF NOT EXISTS idx_listings_is_sold ON listings (is_sold);
CREATE INDEX IF NOT EXISTS idx_listings_published ON listings (published);
