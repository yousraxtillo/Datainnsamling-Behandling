#!/usr/bin/env python3
"""
FINAL IMPORT - Fjerner duplikater og importerer clean
"""
import pandas as pd
import psycopg2
from datetime import datetime

def main():
    print("🎯 FINAL IMPORT - Fjerner duplikater først...")
    
    db_url = "postgresql://meglermonitor_user:ai6FAgyD7AuziP5oPZ96Gf3atEApYqi3@dpg-d40lkmv5r7bs73fg2vig-a.oregon-postgres.render.com/meglermonitor"
    csv_file = "/Users/yousra/TestEiendom/out/raw/2025-10-27_all_listings.csv"
    
    print("📂 Laster og renser data...")
    df = pd.read_csv(csv_file)
    print(f"📊 Original: {len(df)} rader")
    
    # Fjern duplikater basert på listing_id
    df_clean = df.drop_duplicates(subset=['listing_id'], keep='first')
    print(f"✨ Etter duplikat-fjerning: {len(df_clean)} unike rader")
    print(f"🗑️ Fjernet {len(df) - len(df_clean)} duplikater")
    
    # Koble til database
    print("🔗 Kobler til database...")
    conn = psycopg2.connect(db_url)
    
    print("🧹 Renser database...")
    with conn.cursor() as cur:
        cur.execute("DELETE FROM listings")
        cur.execute("DELETE FROM listings_latest")
        conn.commit()
    
    print("📥 Importerer clean data...")
    snapshot_time = datetime.now()
    
    imported = 0
    skipped = 0
    
    with conn.cursor() as cur:
        for i, row in df_clean.iterrows():
            if i % 500 == 0:
                print(f"  📋 Prosesserer {i}/{len(df_clean)}")
            
            try:
                values = (
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
                
                # Insert til listings
                cur.execute("""
                    INSERT INTO listings (
                        source, listing_id, title, address, city, district, chain, broker,
                        price, commission_est, status, published, property_type, segment,
                        price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, values)
                
                # Insert til listings_latest
                cur.execute("""
                    INSERT INTO listings_latest (
                        source, listing_id, title, address, city, district, chain, broker,
                        price, commission_est, status, published, property_type, segment,
                        price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (source, listing_id) DO UPDATE SET
                        title = EXCLUDED.title,
                        price = EXCLUDED.price
                """, values)
                
                imported += 1
                
            except Exception as e:
                skipped += 1
                continue
            
            # Commit hver 500 rader
            if i % 500 == 0:
                conn.commit()
        
        # Final commit
        conn.commit()
    
    # Sjekk resultater
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM listings")
        count = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM listings_latest")
        latest_count = cur.fetchone()[0]
    
    print(f"\n🎉 SUCCESS! {count} listings importert!")
    print(f"📊 Latest: {latest_count}")
    print(f"✅ Imported: {imported}")
    print(f"⚠️ Skipped: {skipped}")
    print("🇳🇴 MeglerMonitor har nå ALLE unike norske eiendomsdata!")
    
    conn.close()

if __name__ == "__main__":
    main()