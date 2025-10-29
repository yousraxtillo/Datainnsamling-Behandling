import pandas as pd
import psycopg2
from sqlalchemy import create_engine, text
import os
from datetime import datetime
import time

def import_csv_to_render():
    print("📊 Starting import of real estate data to Render PostgreSQL...")
    
    # You'll get this URL from Render dashboard after deployment
    DATABASE_URL = input("Enter your Render PostgreSQL URL: ")
    
    # Load your CSV data
    print("📂 Loading CSV data...")
    df = pd.read_csv('out/raw/2025-10-28_all_listings.csv')
    print(f"✅ Loaded {len(df)} listings from CSV")
    
    # Connect to Render database with additional connection parameters
    print("🔗 Connecting to Render PostgreSQL...")
    
    # Ensure SSL mode and connect timeout are set for Render
    if 'sslmode' not in DATABASE_URL:
        separator = '&' if '?' in DATABASE_URL else '?'
        DATABASE_URL = DATABASE_URL + f'{separator}sslmode=require&connect_timeout=30'
    
    # SQLAlchemy connection parameters
    connection_params = {
        'pool_timeout': 30,
        'pool_recycle': -1,
        'pool_pre_ping': True
    }
    
    engine = create_engine(DATABASE_URL, **connection_params)
    
    # Test connection first
    print("🧪 Testing database connection...")
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Test the connection
            with engine.connect() as connection:
                result = connection.execute(text("SELECT 1"))
                print("✅ Database connection successful!")
                break
        except Exception as e:
            print(f"❌ Connection attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                print("⏳ Retrying in 10 seconds...")
                time.sleep(10)
            else:
                print("💥 All connection attempts failed!")
                return False #
    
    # Import data
    print("📤 Importing data to Render database...")
    try:
        # First try to append to existing table
        df.to_sql('listings', engine, if_exists='append', index=False, chunksize=1000)
        print("✅ Data appended to existing table!")
    except Exception as e:
        print(f"❌ Append failed: {e}")
        print("🔄 Trying to drop dependent views and replace table...")
        try:
            # Drop dependent materialized views first
            with engine.connect() as connection:
                connection.execute(text("DROP MATERIALIZED VIEW IF EXISTS broker_commission_stats CASCADE"))
                connection.execute(text("DROP VIEW IF EXISTS latest_listings CASCADE"))
                connection.commit()
            
            # Now try to replace the table
            df.to_sql('listings', engine, if_exists='replace', index=False, chunksize=1000)
            print("✅ Table replaced successfully!")
        except Exception as e2:
            print(f"❌ Replace also failed: {e2}")
            print("🔄 Trying with truncate and insert...")
            try:
                # Alternative: Truncate and insert
                with engine.connect() as connection:
                    connection.execute(text("TRUNCATE TABLE listings"))
                    connection.commit()
                
                df.to_sql('listings', engine, if_exists='append', index=False, chunksize=1000)
                print("✅ Table truncated and data inserted!")
            except Exception as e3:
                print(f"❌ All methods failed: {e3}")
                return False
    
    print("🎉 Import complete!")
    print(f"✅ {len(df)} listings imported to Render PostgreSQL")
    
    # Calculate and display metrics
    total_value = df['price'].sum() if 'price' in df.columns else 0
    unique_agents = df['agent'].nunique() if 'agent' in df.columns else 0
    
    print(f"📊 Total Market Value: {total_value:,.0f} kr")
    print(f"👥 Unique Agents: {unique_agents}")

if __name__ == "__main__":
    import_csv_to_render()