#!/usr/bin/env python3
"""
Generate comprehensive sample data with connection retry logic
"""

import json
import os
import time
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

def connect_with_retry(db_url, max_retries=3, delay=2):
    """Connect to database with retry logic."""
    for attempt in range(max_retries):
        try:
            print(f"🔄 Connection attempt {attempt + 1}/{max_retries}...")
            conn = psycopg2.connect(
                db_url,
                cursor_factory=RealDictCursor,
                connect_timeout=30,
                application_name="sample_generator"
            )
            print("✅ Database connected successfully")
            return conn
        except Exception as e:
            print(f"❌ Connection attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                print(f"⏳ Waiting {delay} seconds before retry...")
                time.sleep(delay)
                delay *= 2  # Exponential backoff
            else:
                raise

def fetch_sample_data():
    """Fetch comprehensive sample data from the database."""
    
    db_url = "postgresql://meglermonitor_user:ai6fAgyD7AuziP5oPZ9b6f3atEApYqI3adpg-d40lkmvBr7bs73fqz1g-a@dpg-ct15sqrtq21c73ab8l70-a.oregon-postgres.render.com/meglermonitor"
    
    print("📡 Connecting to database...")
    conn = connect_with_retry(db_url)
    
    try:
        cursor = conn.cursor()
        
        print("🔄 Fetching sample listings (recent 1000)...")
        # Get a representative sample of recent listings
        query = """
            SELECT 
                id, source, listing_id, url, title, address, city, district, 
                price, price_per_sqm, sqm, bedrooms, bathrooms, 
                property_type, ownership_type, energy_label, year_built, 
                days_on_market, broker, broker_phone, broker_email, chain, 
                listing_date, updated_date, sold_date, 
                ST_X(location) as longitude, ST_Y(location) as latitude,
                segment, price_bucket, role
            FROM listings 
            ORDER BY listing_date DESC, price DESC NULLS LAST
            LIMIT 1000
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        listings_data = []
        for row in results:
            listing = dict(row)
            # Convert datetime objects to strings
            if listing.get('listing_date'):
                listing['listing_date'] = listing['listing_date'].isoformat()
            if listing.get('updated_date'):
                listing['updated_date'] = listing['updated_date'].isoformat()
            if listing.get('sold_date'):
                listing['sold_date'] = listing['sold_date'].isoformat()
            
            # Convert decimals to float for JSON serialization
            if listing.get('longitude'):
                listing['longitude'] = float(listing['longitude'])
            if listing.get('latitude'):
                listing['latitude'] = float(listing['latitude'])
            if listing.get('price_per_sqm'):
                listing['price_per_sqm'] = float(listing['price_per_sqm'])
            
            listings_data.append(listing)
        
        print(f"📊 Fetched {len(listings_data)} sample listings")
        
        # Get current metrics from the database
        print("🔄 Calculating current metrics...")
        metrics_query = """
            SELECT 
                COUNT(*) as total_listings,
                COUNT(DISTINCT broker) as active_agents,
                SUM(CASE WHEN price IS NOT NULL THEN price ELSE 0 END) as total_value,
                AVG(CASE WHEN price IS NOT NULL THEN price ELSE NULL END) as avg_price
            FROM listings 
        """
        
        cursor.execute(metrics_query)
        metrics_row = cursor.fetchone()
        
        metrics = {
            "as_of": datetime.now().isoformat() + "Z",
            "total_listings": int(metrics_row['total_listings']) if metrics_row['total_listings'] else 0,
            "active_agents": int(metrics_row['active_agents']) if metrics_row['active_agents'] else 0,
            "total_value": int(metrics_row['total_value']) if metrics_row['total_value'] else 0,
            "avg_price": int(metrics_row['avg_price']) if metrics_row['avg_price'] else 0
        }
        
        print(f"💰 Total value: {metrics['total_value']:,} kr")
        print(f"👥 Active agents: {metrics['active_agents']:,}")
        
        return {
            "listings": listings_data,
            "metrics": metrics
        }
        
    finally:
        cursor.close()
        conn.close()

def save_sample_files(data):
    """Save the sample data to files."""
    
    # Ensure sample directory exists
    os.makedirs("sample", exist_ok=True)
    
    # Save comprehensive listings
    print("💾 Saving all_listings_comprehensive.json...")
    with open("sample/all_listings_comprehensive.json", "w", encoding="utf-8") as f:
        json.dump(data["listings"], f, indent=2, ensure_ascii=False)
    
    # Update metrics.json with current real data
    print("💾 Updating metrics.json with real data...")
    with open("sample/metrics.json", "w", encoding="utf-8") as f:
        json.dump(data["metrics"], f, indent=2)
    
    # Create a summary
    summary = {
        "generated_at": datetime.now().isoformat() + "Z",
        "sample_listings": len(data["listings"]),
        "total_value_in_db": data["metrics"]["total_value"],
        "active_agents_in_db": data["metrics"]["active_agents"],
        "description": "Comprehensive sample with real data from production database",
        "files_updated": [
            "all_listings_comprehensive.json", 
            "metrics.json"
        ]
    }
    
    print("💾 Saving generation_summary.json...")
    with open("sample/generation_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    
    return summary

def main():
    """Main function."""
    print("🚀 Generating comprehensive sample data with retry logic...")
    
    try:
        # Fetch data
        data = fetch_sample_data()
        
        # Save files
        summary = save_sample_files(data)
        
        print("\n✅ Sample data generation complete!")
        print(f"📊 Sample includes {summary['sample_listings']:,} recent listings")
        print(f"💰 Real total value: {summary['total_value_in_db']:,} kr")
        print(f"👥 Real active agents: {summary['active_agents_in_db']:,}")
        print("\nFiles created/updated:")
        for file in summary['files_updated']:
            print(f"  ✓ sample/{file}")
        
        # Show formatted value for dashboard
        total_val = summary['total_value_in_db']
        if total_val >= 1_000_000_000:
            formatted = f"{total_val / 1_000_000_000:.1f}B"
        elif total_val >= 1_000_000:
            formatted = f"{total_val / 1_000_000:.1f}M"
        else:
            formatted = f"{total_val:,}"
        
        print(f"\n🎯 For Render deployment: Total omsetning will show as '{formatted} kr'")
        
        return summary
        
    except Exception as e:
        print(f"❌ Error generating sample data: {e}")
        return None

if __name__ == "__main__":
    main()