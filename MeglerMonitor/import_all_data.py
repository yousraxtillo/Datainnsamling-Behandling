#!/usr/bin/env python3
"""
IMPORT ALL 17,056 NORWEGIAN PROPERTY LISTINGS
"""
import pandas as pd
import psycopg2
from datetime import datetime
import sys

def import_all_data():
    print("🚀 IMPORTING ALL 17,056 NORWEGIAN LISTINGS...")
    print("=" * 50)
    
    # Database URL från Render dashboard
    print("Enter your DATABASE_URL from Render dashboard:")
    db_url = input("DATABASE_URL: ").strip()
    
    if not db_url.startswith('postgresql://'):
        print("❌ Invalid database URL")
        return
    
    # Läs CSV-filen
    csv_file = "/Users/yousra/TestEiendom/out/all_listings.csv"
    print(f"📂 Loading {csv_file}...")
    
    df = pd.read_csv(csv_file)
    print(f"✅ Loaded {len(df)} listings from CSV")
    
    # Koppla till database
    try:
        conn = psycopg2.connect(db_url)
        print("✅ Connected to database")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return
    
    try:
        with conn.cursor() as cur:
            # Rensa gamla data
            cur.execute("DELETE FROM listings")
            cur.execute("DELETE FROM listings_latest")
            print("✅ Cleared old data")
            
            snapshot_time = datetime.now()
            imported_count = 0
            
            for idx, row in df.iterrows():
                if idx % 1000 == 0:
                    print(f"  Processed {idx}/{len(df)}...")
                
                # Förbered data
                values = (
                    str(row.get('source', 'Hjem.no')),
                    str(row.get('listing_id', f'L{idx}')),
                    str(row.get('title', ''))[:500],  # Begränsa längd
                    str(row.get('address', ''))[:200],
                    str(row.get('city', ''))[:100],
                    str(row.get('district', ''))[:100],
                    str(row.get('chain', ''))[:100],
                    str(row.get('broker', ''))[:100],
                    int(row['price']) if pd.notna(row.get('price')) else None,
                    int(row['commission_est']) if pd.notna(row.get('commission_est')) else None,
                    str(row.get('status', '')),
                    row.get('published') if pd.notna(row.get('published')) else None,
                    str(row.get('property_type', '')),
                    str(row.get('segment', '')),
                    str(row.get('price_bucket', '')),
                    str(row.get('broker_role', '')),
                    str(row.get('role', '')),
                    bool(row.get('is_sold', False)),
                    row.get('last_seen_at') if pd.notna(row.get('last_seen_at')) else None,
                    snapshot_time
                )
                
                # Sätt in i listings-tabellen med duplikathantering
                cur.execute("""
                    INSERT INTO listings (
                        source, listing_id, title, address, city, district, chain, broker,
                        price, commission_est, status, published, property_type, segment,
                        price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (source, listing_id, snapshot_at) DO NOTHING
                """, values)
                
                # Sätt in i listings_latest-tabellen
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
                
                imported_count += 1
            
            conn.commit()
            
            # Verifiera import
            cur.execute("SELECT COUNT(*) FROM listings")
            total_listings = cur.fetchone()[0]
            
            cur.execute("SELECT COUNT(*) FROM listings_latest")
            latest_listings = cur.fetchone()[0]
            
            print("=" * 50)
            print("🎉 IMPORT COMPLETED SUCCESSFULLY!")
            print(f"📊 Total listings: {total_listings}")
            print(f"📊 Latest listings: {latest_listings}")
            print(f"💰 Complete Norwegian property database imported!")
            print("=" * 50)
            
    except Exception as e:
        print(f"❌ Import failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    import_all_data()