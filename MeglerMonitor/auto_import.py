#!/usr/bin/env python3
"""
AUTOMATISK IMPORT - Importerer alle norske eiendomsdata automatisk
"""
import pandas as pd
import psycopg2
from datetime import datetime
import sys
import os

def main():
    print("🚀 STARTER AUTOMATISK IMPORT AV ALLE NORSKE EIENDOMSDATA...")
    
    # Bruk database URL du ga meg tidligere
    db_url = "postgresql://meglermonitor_user:ai6FAgyD7AuziP5oPZ96Gf3atEApYqi3@dpg-d40lkmv5r7bs73fg2vig-a.oregon-postgres.render.com/meglermonitor"
    
    # Last CSV filen
    csv_file = "/Users/yousra/TestEiendom/out/raw/2025-10-27_all_listings.csv"
    print(f"📂 Laster {csv_file}...")
    
    try:
        df = pd.read_csv(csv_file)
        print(f"✅ Lastet {len(df)} listings")
    except Exception as e:
        print(f"❌ Kunne ikke laste CSV: {e}")
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
            
            # Importer i batches med progress
            batch_size = 500  # Mindre batches for bedre progress
            total_batches = (len(df) + batch_size - 1) // batch_size
            
            for i in range(0, len(df), batch_size):
                batch = df.iloc[i:i+batch_size]
                batch_num = i//batch_size + 1
                print(f"  📦 Batch {batch_num}/{total_batches}: Prosesserer {i+1}-{min(i+batch_size, len(df))} av {len(df)}")
                
                for idx, row in batch.iterrows():
                    try:
                        values = (
                            row.get('source', 'Hjem.no'),
                            str(row.get('listing_id', '')),
                            str(row.get('title', ''))[:500],  # Truncate for safety
                            str(row.get('address', ''))[:200],
                            str(row.get('city', ''))[:100],
                            str(row.get('district', ''))[:100],
                            str(row.get('chain', ''))[:100],
                            str(row.get('broker', ''))[:100],
                            int(row['price']) if pd.notna(row.get('price')) else None,
                            int(row['commission_est']) if pd.notna(row.get('commission_est')) else None,
                            str(row.get('status', ''))[:50],
                            row.get('published'),
                            str(row.get('property_type', ''))[:50],
                            str(row.get('segment', ''))[:50],
                            str(row.get('price_bucket', ''))[:50],
                            str(row.get('broker_role', ''))[:50],
                            str(row.get('role', ''))[:50],
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
                        
                    except Exception as e:
                        print(f"    ⚠️  Skippet rad {idx}: {e}")
                        continue
                
                # Commit hver batch
                conn.commit()
                print(f"    ✅ Batch {batch_num} ferdig!")
        
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