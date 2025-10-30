#!/usr/bin/env python3
"""
SUPER RASK IMPORT - Bruker batch insert for maksimal hastighet
"""
import pandas as pd
import psycopg2
from datetime import datetime
import sys

def main():
    print("🚀 SUPER RASK IMPORT STARTER...")
    
    # Database URL
    db_url = "postgresql://meglermonitor_user:ai6FAgyD7AuziP5oPZ96Gf3atEApYqi3@dpg-d40lkmv5r7bs73fg2vig-a.oregon-postgres.render.com/meglermonitor"
    
    # Last CSV
    csv_file = "/Users/yousra/TestEiendom/out/raw/2025-10-27_all_listings.csv"
    
    print(f"📂 Laster data...")
    df = pd.read_csv(csv_file)
    print(f"✅ {len(df)} listings lastet")
    
    # Koble til database
    print("🔗 Kobler til database...")
    conn = psycopg2.connect(db_url)
    
    print("🗑️ Renser gamle data...")
    with conn.cursor() as cur:
        cur.execute("DELETE FROM listings")
        cur.execute("DELETE FROM listings_latest")
        conn.commit()
    
    print("📥 Importerer med bulk insert...")
    
    # Prepare data for bulk insert
    snapshot_time = datetime.now()
    rows_data = []
    
    for i, row in df.iterrows():
        if i % 1000 == 0:
            print(f"  📋 Forbereder rad {i}/{len(df)}")
            
        row_data = (
            row.get('source', 'Hjem.no'),
            str(row.get('listing_id', '')),
            str(row.get('title', ''))[:200] if pd.notna(row.get('title')) else '',
            str(row.get('address', ''))[:200] if pd.notna(row.get('address')) else '',
            str(row.get('city', ''))[:100] if pd.notna(row.get('city')) else '',
            str(row.get('district', ''))[:100] if pd.notna(row.get('district')) else '',
            str(row.get('chain', ''))[:100] if pd.notna(row.get('chain')) else '',
            str(row.get('broker', ''))[:100] if pd.notna(row.get('broker')) else '',
            int(row['price']) if pd.notna(row.get('price')) else None,
            int(row['commission_est']) if pd.notna(row.get('commission_est')) else None,
            str(row.get('status', ''))[:50] if pd.notna(row.get('status')) else '',
            None,  # published
            str(row.get('property_type', ''))[:50] if pd.notna(row.get('property_type')) else '',
            str(row.get('segment', ''))[:50] if pd.notna(row.get('segment')) else '',
            str(row.get('price_bucket', ''))[:50] if pd.notna(row.get('price_bucket')) else '',
            str(row.get('broker_role', ''))[:50] if pd.notna(row.get('broker_role')) else '',
            str(row.get('role', ''))[:50] if pd.notna(row.get('role')) else '',
            bool(row.get('is_sold', False)),
            None,  # last_seen_at
            snapshot_time
        )
        rows_data.append(row_data)
    
    print(f"💾 Bulk inserting {len(rows_data)} rader...")
    
    with conn.cursor() as cur:
        # Bulk insert til listings
        cur.executemany("""
            INSERT INTO listings (
                source, listing_id, title, address, city, district, chain, broker,
                price, commission_est, status, published, property_type, segment,
                price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, rows_data)
        
        # Bulk insert til listings_latest
        cur.executemany("""
            INSERT INTO listings_latest (
                source, listing_id, title, address, city, district, chain, broker,
                price, commission_est, status, published, property_type, segment,
                price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source, listing_id) DO UPDATE SET
                title = EXCLUDED.title,
                price = EXCLUDED.price
        """, rows_data)
        
        conn.commit()
    
    # Sjekk resultater
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM listings")
        count = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM listings_latest") 
        latest_count = cur.fetchone()[0]
    
    print(f"\n🎉 FERDIG! {count} listings importert!")
    print(f"📊 Latest: {latest_count}")
    print("🇳🇴 MeglerMonitor har nå alle norske data!")
    
    conn.close()

if __name__ == "__main__":
    main()