#!/usr/bin/env python3
"""
RASK CSV IMPORT - Importerer alle norske eiendomsdata
"""
import pandas as pd
import psycopg2
from datetime import datetime
import sys

def main():
    print("🚀 STARTER IMPORT AV ALLE NORSKE EIENDOMSDATA...")
    
    # Last CSV filen
    csv_file = "/Users/yousra/TestEiendom/out/raw/2025-10-27_all_listings.csv"
    print(f"📂 Laster {csv_file}...")
    
    try:
        df = pd.read_csv(csv_file)
        print(f"✅ Lastet {len(df)} listings")
    except Exception as e:
        print(f"❌ Kunne ikke laste CSV: {e}")
        return
    
    # Be om database URL
    print("\n🔑 Trenger database URL fra Render dashboard:")
    db_url = input("Skriv inn DATABASE_URL: ").strip()
    
    if not db_url:
        print("❌ Trenger database URL!")
        return
    
    # Koble til database
    try:
        conn = psycopg2.connect(db_url)
        print("✅ Koblet til database")
    except Exception as e:
        print(f"❌ Kunne ikke koble til database: {e}")
        return
    
    # Slett gamle data og importer nye
    try:
        with conn.cursor() as cur:
            print("🗑️  Sletter gamle data...")
            cur.execute("DELETE FROM listings")
            cur.execute("DELETE FROM listings_latest")
            
            print("📥 Importerer nye data...")
            snapshot_time = datetime.now()
            
            # Importer i batches
            batch_size = 1000
            for i in range(0, len(df), batch_size):
                batch = df.iloc[i:i+batch_size]
                print(f"  📦 Batch {i//batch_size + 1}: {i+1}-{min(i+batch_size, len(df))}")
                
                for _, row in batch.iterrows():
                    values = (
                        row.get('source', 'Hjem.no'),
                        str(row.get('listing_id', '')),
                        str(row.get('title', '')),
                        str(row.get('address', '')),
                        str(row.get('city', '')),
                        str(row.get('district', '')),
                        str(row.get('chain', '')),
                        str(row.get('broker', '')),
                        int(row['price']) if pd.notna(row.get('price')) else None,
                        int(row['commission_est']) if pd.notna(row.get('commission_est')) else None,
                        str(row.get('status', '')),
                        row.get('published'),
                        str(row.get('property_type', '')),
                        str(row.get('segment', '')),
                        str(row.get('price_bucket', '')),
                        str(row.get('broker_role', '')),
                        str(row.get('role', '')),
                        bool(row.get('is_sold', False)),
                        row.get('last_seen_at'),
                        snapshot_time
                    )
                    
                    # Insert til listings tabell (ignoreer duplikater)
                    cur.execute("""
                        INSERT INTO listings (
                            source, listing_id, title, address, city, district, chain, broker,
                            price, commission_est, status, published, property_type, segment,
                            price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (source, listing_id, snapshot_at) DO NOTHING
                    """, values)
                    
                    # Insert til listings_latest tabell  
                    cur.execute("""
                        INSERT INTO listings_latest (
                            source, listing_id, title, address, city, district, chain, broker,
                            price, commission_est, status, published, property_type, segment,
                            price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (source, listing_id) DO UPDATE SET
                            title = EXCLUDED.title,
                            price = EXCLUDED.price,
                            snapshot_at = EXCLUDED.snapshot_at
                    """, values)
                
                conn.commit()
        
        # Sjekk resultater
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM listings")
            count = cur.fetchone()[0]
            
            cur.execute("SELECT COUNT(*) FROM listings_latest")  
            latest_count = cur.fetchone()[0]
        
        print(f"\n🎉 SUCCESS! Importerte {count} listings")
        print(f"📊 Listings latest: {latest_count}")
        print("🇳🇴 Alle norske eiendomsdata er nå importert!")
        
    except Exception as e:
        print(f"❌ Import feilet: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    main()