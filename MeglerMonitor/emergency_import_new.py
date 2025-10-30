#!/usr/bin/env python3
"""
EMERGENCY DATA IMPORT SCRIPT
Re-imports all Norwegian property data to Render database
"""
import json
import psycopg2
import os
from datetime import datetime
import sys

def get_database_url():
    """Get database URL - you'll need to provide this from Render dashboard"""
    # Get this from your Render database dashboard
    # Format: postgresql://username:password@hostname:port/database
    print("Please get your database URL from Render dashboard:")
    print("1. Go to render.com dashboard")
    print("2. Click on your 'megler-monitor-db' database")
    print("3. Copy the 'External Database URL'")
    print()
    
    db_url = input("Enter your DATABASE_URL: ").strip()
    if not db_url.startswith('postgresql://'):
        print("❌ Invalid database URL format")
        sys.exit(1)
    
    return db_url

def load_sample_data():
    """Load the Norwegian property data"""
    sample_file = "/Users/yousra/MeglerMonitor/sample/all_listings.json"
    
    if not os.path.exists(sample_file):
        print(f"ERROR: Sample file not found: {sample_file}")
        return None
        
    with open(sample_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"✅ Loaded {len(data)} listings from sample file")
    return data

def create_tables(conn):
    """Create all necessary tables"""
    with conn.cursor() as cur:
        # Create main listings table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS listings (
                id SERIAL PRIMARY KEY,
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
                UNIQUE(source, listing_id, snapshot_at)
            )
        """)
        
        # Create listings_latest table
        cur.execute("""
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
            )
        """)
        
        # Create indexes
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_latest_city ON listings_latest (city)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_latest_broker ON listings_latest (broker)")
        
    conn.commit()
    print("✅ Tables created successfully")

def import_data(conn, data):
    """Import the listings data"""
    snapshot_time = datetime.now()
    
    with conn.cursor() as cur:
        # Clear existing data
        cur.execute("DELETE FROM listings")
        cur.execute("DELETE FROM listings_latest")
        
        print(f"🔄 Importing {len(data)} listings...")
        
        for i, listing in enumerate(data):
            if i % 1000 == 0:
                print(f"  Processed {i}/{len(data)} listings...")
                
            # Prepare the data
            values = (
                listing.get('source', 'Hjem.no'),
                listing.get('listing_id', ''),
                listing.get('title', ''),
                listing.get('address', ''),
                listing.get('city', ''),
                listing.get('district', ''),
                listing.get('chain', ''),
                listing.get('broker', ''),
                listing.get('price'),
                listing.get('commission_est'),
                listing.get('status', ''),
                listing.get('published'),
                listing.get('property_type', ''),
                listing.get('segment', ''),
                listing.get('price_bucket', ''),
                listing.get('broker_role', ''),
                listing.get('role', ''),
                listing.get('is_sold', False),
                listing.get('last_seen_at'),
                snapshot_time
            )
            
            # Insert into listings table
            cur.execute("""
                INSERT INTO listings (
                    source, listing_id, title, address, city, district, chain, broker,
                    price, commission_est, status, published, property_type, segment,
                    price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (source, listing_id, snapshot_at) DO NOTHING
            """, values)
            
            # Insert into listings_latest table
            cur.execute("""
                INSERT INTO listings_latest (
                    source, listing_id, title, address, city, district, chain, broker,
                    price, commission_est, status, published, property_type, segment,
                    price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (source, listing_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    address = EXCLUDED.address,
                    city = EXCLUDED.city,
                    district = EXCLUDED.district,
                    chain = EXCLUDED.chain,
                    broker = EXCLUDED.broker,
                    price = EXCLUDED.price,
                    commission_est = EXCLUDED.commission_est,
                    status = EXCLUDED.status,
                    published = EXCLUDED.published,
                    property_type = EXCLUDED.property_type,
                    segment = EXCLUDED.segment,
                    price_bucket = EXCLUDED.price_bucket,
                    broker_role = EXCLUDED.broker_role,
                    role = EXCLUDED.role,
                    is_sold = EXCLUDED.is_sold,
                    last_seen_at = EXCLUDED.last_seen_at,
                    snapshot_at = EXCLUDED.snapshot_at
            """, values)
        
    conn.commit()
    print(f"✅ Successfully imported {len(data)} listings")

def main():
    print("🚀 EMERGENCY DATA IMPORT STARTING...")
    print("=" * 50)
    
    # Load the data
    data = load_sample_data()
    if not data:
        sys.exit(1)
    
    # Get database URL
    try:
        db_url = get_database_url()
        print("✅ Database URL configured")
    except Exception as e:
        print(f"❌ Failed to get database URL: {e}")
        sys.exit(1)
    
    # Connect to database
    try:
        conn = psycopg2.connect(db_url)
        print("✅ Connected to database")
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        print("Make sure your database credentials are correct")
        sys.exit(1)
    
    try:
        # Create tables
        create_tables(conn)
        
        # Import data
        import_data(conn, data)
        
        # Verify import
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM listings")
            listings_count = cur.fetchone()[0]
            
            cur.execute("SELECT COUNT(*) FROM listings_latest")
            latest_count = cur.fetchone()[0]
        
        print("=" * 50)
        print("🎉 IMPORT COMPLETED SUCCESSFULLY!")
        print(f"📊 Total listings: {listings_count}")
        print(f"📊 Latest listings: {latest_count}")
        print("=" * 50)
        
    except Exception as e:
        print(f"❌ Import failed: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    main()