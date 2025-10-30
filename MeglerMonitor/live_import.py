#!/usr/bin/env python3
"""
LIVE PROGRESS IMPORT - Viser live progress du kan følge med på
"""
import pandas as pd
import psycopg2
from datetime import datetime
import time

def main():
    print("🔴 LIVE IMPORT STARTER - Du kan følge med på progessen!")
    print("=" * 60)
    
    db_url = "postgresql://meglermonitor_user:ai6FAgyD7AuziP5oPZ96Gf3atEApYqi3@dpg-d40lkmv5r7bs73fg2vig-a.oregon-postgres.render.com/meglermonitor"
    csv_file = "/Users/yousra/TestEiendom/out/raw/2025-10-27_all_listings.csv"
    
    print("📂 [STEP 1] Laster CSV data...")
    start_time = time.time()
    df = pd.read_csv(csv_file)
    load_time = time.time() - start_time
    print(f"✅ Lastet {len(df)} rader på {load_time:.2f} sekunder")
    
    print("\n🧹 [STEP 2] Fjerner duplikater...")
    df_clean = df.drop_duplicates(subset=['listing_id'], keep='first')
    print(f"✅ Fjernet {len(df) - len(df_clean)} duplikater")
    print(f"📊 Unike rader klar: {len(df_clean)}")
    
    print("\n🔗 [STEP 3] Kobler til database...")
    try:
        conn = psycopg2.connect(db_url)
        print("✅ Database tilkoblet!")
    except Exception as e:
        print(f"❌ Database feil: {e}")
        return
    
    print("\n🗑️ [STEP 4] Renser database...")
    with conn.cursor() as cur:
        cur.execute("DELETE FROM listings")
        cur.execute("DELETE FROM listings_latest")
        conn.commit()
    print("✅ Database renset!")
    
    print(f"\n📥 [STEP 5] LIVE IMPORT - {len(df_clean)} rader:")
    print("=" * 60)
    
    snapshot_time = datetime.now()
    imported_count = 0
    error_count = 0
    
    with conn.cursor() as cur:
        for i, row in df_clean.iterrows():
            # Vis progress hver 100. rad
            if i % 100 == 0 or i < 50:
                progress = (i / len(df_clean)) * 100
                print(f"🔄 [{progress:6.1f}%] Rad {i:4d}/{len(df_clean)} | ✅ {imported_count} | ❌ {error_count}")
            
            try:
                values = (
                    str(row.get('source', 'Hjem.no')),
                    str(row.get('listing_id', '')),
                    str(row.get('title', ''))[:200] if pd.notna(row.get('title')) else '',
                    str(row.get('address', ''))[:200] if pd.notna(row.get('address')) else '',
                    str(row.get('city', ''))[:100] if pd.notna(row.get('city')) else '',
                    str(row.get('district', ''))[:100] if pd.notna(row.get('district')) else '',
                    str(row.get('chain', ''))[:100] if pd.notna(row.get('chain')) else '',
                    str(row.get('broker', ''))[:100] if pd.notna(row.get('broker')) else '',
                    int(row['price']) if pd.notna(row.get('price')) and row.get('price') != '' else None,
                    int(row['commission_est']) if pd.notna(row.get('commission_est')) and row.get('commission_est') != '' else None,
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
                        price = EXCLUDED.price,
                        snapshot_at = EXCLUDED.snapshot_at
                """, values)
                
                imported_count += 1
                
            except Exception as e:
                error_count += 1
                if error_count < 5:  # Vis de første feilene
                    print(f"⚠️ Feil rad {i}: {str(e)[:100]}")
            
            # Commit hver 500 rader for å ikke miste alt ved feil
            if i % 500 == 0 and i > 0:
                conn.commit()
                print(f"💾 Commit på rad {i}")
        
        # Final commit
        conn.commit()
    
    print("\n" + "=" * 60)
    print("🎯 IMPORT FERDIG!")
    
    # Sjekk final resultater
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM listings")
        final_count = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM listings_latest")
        latest_count = cur.fetchone()[0]
    
    total_time = time.time() - start_time
    
    print(f"🎉 SUCCESS STATISTIKK:")
    print(f"   📊 Total importert: {final_count}")
    print(f"   📊 Latest tabell: {latest_count}")
    print(f"   ✅ Suksessfulle: {imported_count}")
    print(f"   ❌ Feil: {error_count}")
    print(f"   ⏱️ Total tid: {total_time:.1f} sekunder")
    print(f"🇳🇴 MeglerMonitor har nå ALLE norske eiendomsdata!")
    print("=" * 60)
    
    conn.close()

if __name__ == "__main__":
    main()