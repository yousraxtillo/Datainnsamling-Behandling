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
    """
    Get the database URL from render.yaml configuration
    """
    # The database URL pattern for Render PostgreSQL
    # Format: postgresql://user:pass@host:port/dbname
    
    # From your render.yaml, the database name is "megler-monitor-db"
    # User is "megler_user", database name is "megler_monitor"
    
    print("🔍 Attempting to connect to Render database...")
    print("⚠️  If this fails, you need to get the DATABASE_URL from Render dashboard")
    
    # We'll try to construct the URL from known values or use environment variable
    database_url = os.environ.get('DATABASE_URL')
    
    if not database_url:
        # If not found in environment, we need to get it from user
        print("\n❌ DATABASE_URL not found in environment variables")
        print("📋 Please get the DATABASE_URL from your Render dashboard:")
        print("   1. Go to https://dashboard.render.com")
        print("   2. Click on 'megler-monitor-db'")
        print("   3. Copy the 'External Database URL'")
        print("   4. Paste it below")
        database_url = input("\n🔗 Enter DATABASE_URL: ").strip()
    
    return database_url

def import_csv_to_render():
    print("🚀 EMERGENCY RE-IMPORT: Starting real estate data import to Render PostgreSQL...")
    
    # Check if CSV file exists
    csv_path = 'out/raw/2025-10-28_all_listings.csv'
    if not os.path.exists(csv_path):
        print(f"❌ CSV file not found: {csv_path}")
        print("🔍 Looking for alternative CSV files...")
        
        # Check for other CSV files
        if os.path.exists('out/raw/'):
            import glob
            csv_files = glob.glob('out/raw/*.csv')
            if csv_files:
                csv_path = csv_files[0]  # Use the first one found
                print(f"✅ Found alternative CSV: {csv_path}")
            else:
                print("❌ No CSV files found in out/raw/")
                return False
        else:
            print("❌ out/raw/ directory not found")
            return False
    
    # Get database URL
    database_url = get_render_database_url()
    if not database_url:
        print("❌ No database URL provided")
        return False
    
    # Load CSV data
    print(f"📂 Loading CSV data from {csv_path}...")
    try:
        df = pd.read_csv(csv_path)
        print(f"✅ Loaded {len(df)} listings from CSV")
        
        # Show sample data
        print(f"📊 Data preview:")
        print(f"   - Columns: {list(df.columns)}")
        if len(df) > 0:
            print(f"   - Sample price: {df['price'].iloc[0] if 'price' in df.columns else 'N/A'}")
            print(f"   - Sample agent: {df['agent'].iloc[0] if 'agent' in df.columns else 'N/A'}")
    
    except Exception as e:
        print(f"❌ Failed to load CSV: {e}")
        return False
    
    # Connect to Render database
    print("🔗 Connecting to Render PostgreSQL...")
    
    # Ensure SSL mode for Render
    if 'sslmode' not in database_url:
        separator = '&' if '?' in database_url else '?'
        database_url = database_url + f'{separator}sslmode=require&connect_timeout=60'
    
    # Connection parameters for Render
    connection_params = {
        'pool_timeout': 60,
        'pool_recycle': -1,
        'pool_pre_ping': True,
        'pool_size': 1,
        'max_overflow': 0
    }
    
    try:
        engine = create_engine(database_url, **connection_params)
        
        # Test connection
        print("🧪 Testing database connection...")
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            print("✅ Database connection successful!")
            
            # Check if tables exist
            check_tables = connection.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('listings', 'listings_latest')
            """)).fetchall()
            
            existing_tables = [row[0] for row in check_tables]
            print(f"📋 Existing tables: {existing_tables}")
        
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print("🔧 Troubleshooting tips:")
        print("   - Check if DATABASE_URL is correct")
        print("   - Verify the database is running in Render dashboard")
        print("   - Make sure your IP is whitelisted (if applicable)")
        return False
    
    # Import data with multiple strategies
    print("📤 Starting data import...")
    success = False
    
    # Strategy 1: Direct append to listings table
    try:
        print("🔄 Strategy 1: Appending to listings table...")
        df.to_sql('listings', engine, if_exists='append', index=False, chunksize=1000)
        print("✅ Data successfully appended to listings table!")
        success = True
    except Exception as e:
        print(f"❌ Append failed: {e}")
        
        # Strategy 2: Replace listings table
        try:
            print("🔄 Strategy 2: Replacing listings table...")
            df.to_sql('listings', engine, if_exists='replace', index=False, chunksize=1000)
            print("✅ Data successfully replaced listings table!")
            success = True
        except Exception as e2:
            print(f"❌ Replace failed: {e2}")
            
            # Strategy 3: Drop and recreate
            try:
                print("🔄 Strategy 3: Drop and recreate table...")
                with engine.connect() as connection:
                    connection.execute(text("DROP TABLE IF EXISTS listings CASCADE"))
                    connection.commit()
                
                df.to_sql('listings', engine, if_exists='replace', index=False, chunksize=1000)
                print("✅ Table dropped and recreated successfully!")
                success = True
            except Exception as e3:
                print(f"❌ All strategies failed: {e3}")
    
    if not success:
        print("💥 IMPORT FAILED - All strategies exhausted")
        return False
    
    # Now populate listings_latest table
    try:
        print("🔄 Populating listings_latest table...")
        with engine.connect() as connection:
            # Clear existing data
            connection.execute(text("DELETE FROM listings_latest"))
            
            # Copy data from listings to listings_latest
            insert_sql = """
            INSERT INTO listings_latest (
                source, listing_id, title, address, city, district, chain, broker,
                price, commission_est, status, published, property_type, segment,
                price_bucket, broker_role, role, is_sold, last_seen_at, snapshot_at
            )
            SELECT 
                COALESCE(source, 'Unknown') as source,
                COALESCE(listing_id, id::text, ROW_NUMBER() OVER ()::text) as listing_id,
                title, address, city, district, chain, 
                COALESCE(broker, agent) as broker,
                price, commission_est, status, 
                published::timestamptz,
                property_type, segment, price_bucket, broker_role, role,
                is_sold, last_seen_at::timestamptz,
                COALESCE(snapshot_at::timestamptz, NOW()) as snapshot_at
            FROM listings
            """
            
            connection.execute(text(insert_sql))
            connection.commit()
            print("✅ listings_latest table populated successfully!")
    
    except Exception as e:
        print(f"⚠️  Failed to populate listings_latest: {e}")
        print("   The data is in listings table but listings_latest might be empty")
    
    # Verify import
    try:
        with engine.connect() as connection:
            count_result = connection.execute(text("SELECT COUNT(*) FROM listings")).fetchone()
            listings_count = count_result[0]
            
            latest_count_result = connection.execute(text("SELECT COUNT(*) FROM listings_latest")).fetchone()
            latest_count = latest_count_result[0]
            
            print(f"\n🎉 IMPORT COMPLETE!")
            print(f"✅ Total listings in main table: {listings_count:,}")
            print(f"✅ Total listings in latest table: {latest_count:,}")
            
            if 'price' in df.columns:
                total_value = df['price'].sum()
                print(f"💰 Total Market Value: {total_value:,.0f} kr")
            
            if 'agent' in df.columns:
                unique_agents = df['agent'].nunique()
                print(f"👥 Unique Agents: {unique_agents:,}")
        
        return True
            
    except Exception as e:
        print(f"❌ Failed to verify import: {e}")
        return False

if __name__ == "__main__":
    success = import_csv_to_render()
    if success:
        print("\n🚀 SUCCESS! Data has been imported to Render.")
        print("🔄 The API should now return real data instead of empty arrays.")
        print("⏳ Wait 2-3 minutes for the service to restart, then test:")
        print("   curl 'https://meglermonitor-api.onrender.com/api/listings?limit=1'")
    else:
        print("\n💥 IMPORT FAILED! Please check the errors above.")