#!/usr/bin/env python3
"""
Update commission_est values based on price
Standard Norwegian broker commission is 2-3% of sale price
"""
import os
import psycopg2
from urllib.parse import urlparse

# Database connection string
DATABASE_URL = "postgresql://meglermonitor_user:ai6FAgyD7AuziP5oPZ96Gf3atEApYqi3@dpg-d40lkmv5r7bs73fg2vig-a.oregon-postgres.render.com/meglermonitor"

def update_commission_estimates():
    """Update commission_est column based on price"""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    try:
        print("🔄 Updating commission estimates based on price...")
        
        # Update commission_est to 2.5% of price (standard Norwegian rate)
        cur.execute("""
            UPDATE listings 
            SET commission_est = CASE 
                WHEN price IS NOT NULL AND price > 0 THEN ROUND(price * 0.025)::INTEGER
                ELSE NULL 
            END
            WHERE commission_est IS NULL;
        """)
        
        updated_rows = cur.rowcount
        print(f"✅ Updated {updated_rows} rows with commission estimates")
        
        # Update listings_latest table as well
        cur.execute("""
            UPDATE listings_latest 
            SET commission_est = CASE 
                WHEN price IS NOT NULL AND price > 0 THEN ROUND(price * 0.025)::INTEGER
                ELSE NULL 
            END
            WHERE commission_est IS NULL;
        """)
        
        updated_rows_latest = cur.rowcount
        print(f"✅ Updated {updated_rows_latest} rows in listings_latest with commission estimates")
        
        # Commit changes
        conn.commit()
        print("✅ Commission estimates updated successfully!")
        
        # Show some examples
        cur.execute("""
            SELECT listing_id, price, commission_est 
            FROM listings 
            WHERE commission_est IS NOT NULL 
            LIMIT 10;
        """)
        
        print("\n📊 Sample updated records:")
        for row in cur.fetchall():
            listing_id, price, commission = row
            print(f"  {listing_id[:8]}... | Price: {price:,} kr | Commission: {commission:,} kr")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    update_commission_estimates()