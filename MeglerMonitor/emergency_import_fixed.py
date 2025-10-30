#!/usr/bin/env python3
"""
EMERGENCY DATA IMPORT SCRIPT - FIXED VERSION
Re-imports all Norwegian property data to Render database
"""
import json
import psycopg2
import os
from datetime import datetime
import sys

def get_database_url():
    """Get database URL from user input"""
    print("Please paste your DATABASE_URL:")
    db_url = input().strip()
    if not db_url.startswith('postgresql://'):
        print("❌ Invalid database URL format")
        sys.exit(1)
    return db_url

def load_sample_data():
    """Load the Norwegian property data"""
    sample_file = "/Users/yousra/MeglerMonitor/sample/all_listings_impressive.json"
    
    if not os.path.exists(sample_file):
        print(f"ERROR: Sample file not found: {sample_file}")
        return None
        
    with open(sample_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"✅ Loaded {len(data)} listings from sample file")
    return data

def create_tables(conn):
    """Create all necessary tables with proper constraints"""
    with conn.cursor() as cur:
        # Drop existing tables to start fresh
        cur.execute("DROP TABLE IF EXISTS listings_latest CASCADE")
        cur.execute("DROP TABLE IF EXISTS listings CASCADE")
        
        # Create main listings table
        cur.execute("""
            CREATE TABLE listings (
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
                is_sold BOOLEAN DEFAULT FALSE,
                last_seen_at TIMESTAMPTZ,
                snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(source, listing_id, snapshot_at)
            )
        """)
        
        # Create listings_latest table
        cur.execute("""
            CREATE TABLE listings_latest (
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
                is_sold BOOLEAN DEFAULT FALSE,
                last_seen_at TIMESTAMPTZ,
                snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (source, listing_id)
            )
        """)
        
        # Create indexes
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_latest_city ON listings_latest (city)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_latest_broker ON listings_latest (broker)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_snapshot ON listings (snapshot_at)")
        
    conn.commit()
    print("✅ Tables created successfully")

def import_data(conn, data):
    """Import the listings data"""
    snapshot_time = datetime.now()
    
    with conn.cursor() as cur:
        print(f"🔄 Importing {len(data)} listings...")
        
        for i, listing in enumerate(data):
            if i % 10 == 0:
                print(f"  Processed {i}/{len(data)} listings...")
                
            # Prepare the data with safe defaults
            values = (
                listing.get('source', 'Hjem.no'),
                listing.get('listing_id', f'AUTO_{i}'),
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
            try:
                cur.execute("""
                    INSERT INTO listings (
                        source, listing_id, title, address, city, district, chain, broker,
                        price, commission_est, status, published, property_type, segment,
                        price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (source, listing_id, snapshot_at) DO NOTHING
                """, values)
            except Exception as e:
                print(f"Warning: Could not insert listing {i}: {e}")
                continue
            
            # Insert/update listings_latest table
            try:
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
            except Exception as e:
                print(f"Warning: Could not insert/update latest listing {i}: {e}")
                continue
        
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
            
            # Show some sample data
            cur.execute("SELECT title, city, price FROM listings_latest LIMIT 3")
            samples = cur.fetchall()
        
        print("=" * 50)
        print("🎉 IMPORT COMPLETED SUCCESSFULLY!")
        print(f"📊 Total listings: {listings_count}")
        print(f"📊 Latest listings: {latest_count}")
        print("📋 Sample data:")
        for title, city, price in samples:
            price_str = f"{price:,} NOK" if price else "Price on request"
            print(f"   • {title[:50]}... in {city} - {price_str}")
        print("=" * 50)
        
    except Exception as e:
        print(f"❌ Import failed: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    main()