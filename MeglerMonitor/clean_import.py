#!/usr/bin/env python3
"""
CLEAN IMPORT - Tømmer database først og importerer deretter
"""
import pandas as pd
import psycopg2
from datetime import datetime

def main():
    print("🧹 RENSER KOMPLETT OG IMPORTERER FRESH...")
    
    db_url = "postgresql://meglermonitor_user:ai6FAgyD7AuziP5oPZ96Gf3atEApYqi3@dpg-d40lkmv5r7bs73fg2vig-a.oregon-postgres.render.com/meglermonitor"
    csv_file = "/Users/yousra/TestEiendom/out/raw/2025-10-27_all_listings.csv"
    
    # Koble til database
    print("🔗 Kobler til database...")
    conn = psycopg2.connect(db_url)
    
    print("🗑️ TOTAL RENSING av databasen...")
    with conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS listings CASCADE")
        cur.execute("DROP TABLE IF EXISTS listings_latest CASCADE")
        
        # Gjenopprett tabeller
        cur.execute("""
            CREATE TABLE listings (
                id SERIAL PRIMARY KEY,
                source TEXT NOT NULL,
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
        
        cur.execute("""
            CREATE TABLE listings_latest (
                source TEXT NOT NULL,
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
        
        conn.commit()
    
    print("📂 Laster CSV data...")
    df = pd.read_csv(csv_file)
    print(f"✅ {len(df)} listings lastet")
    
    print("📥 Importerer clean data...")
    snapshot_time = datetime.now()
    
    with conn.cursor() as cur:
        batch_size = 1000
        for i in range(0, len(df), batch_size):
            batch = df.iloc[i:i+batch_size]
            batch_num = i//batch_size + 1
            total_batches = (len(df) + batch_size - 1) // batch_size
            print(f"  📦 Batch {batch_num}/{total_batches}")
            
            batch_data = []
            for _, row in batch.iterrows():
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
                    None,
                    str(row.get('property_type', ''))[:50] if pd.notna(row.get('property_type')) else '',
                    str(row.get('segment', ''))[:50] if pd.notna(row.get('segment')) else '',
                    str(row.get('price_bucket', ''))[:50] if pd.notna(row.get('price_bucket')) else '',
                    str(row.get('broker_role', ''))[:50] if pd.notna(row.get('broker_role')) else '',
                    str(row.get('role', ''))[:50] if pd.notna(row.get('role')) else '',
                    bool(row.get('is_sold', False)),
                    None,
                    snapshot_time
                )
                batch_data.append(row_data)
            
            # Insert batch
            cur.executemany("""
                INSERT INTO listings (
                    source, listing_id, title, address, city, district, chain, broker,
                    price, commission_est, status, published, property_type, segment,
                    price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, batch_data)
            
            cur.executemany("""
                INSERT INTO listings_latest (
                    source, listing_id, title, address, city, district, chain, broker,
                    price, commission_est, status, published, property_type, segment,
                    price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (source, listing_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    price = EXCLUDED.price
            """, batch_data)
            
            conn.commit()
    
    # Final sjekk
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM listings")
        count = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM listings_latest")
        latest_count = cur.fetchone()[0]
    
    print(f"\n🎉 SUKSESS! {count} listings importert!")
    print(f"📊 Latest: {latest_count}")
    print("🇳🇴 MeglerMonitor har nå ALLE norske eiendomsdata!")
    
    conn.close()

if __name__ == "__main__":
    main()