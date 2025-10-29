#!/usr/bin/env python3
"""
Generate comprehensive sample data using the existing scraper infrastructure
"""

import json
import os
import sys
from datetime import datetime

# Add the scraper directory to the path
sys.path.append('scraper/src')

try:
    from scraper.database import Database
except ImportError:
    print("❌ Could not import scraper database module")
    print("Make sure you're in the MeglerMonitor directory and scraper is properly installed")
    sys.exit(1)

def fetch_sample_data():
    """Fetch comprehensive sample data from the database."""
    
    # Use the same database URL as the scraper
    db_url = "postgresql://meglermonitor_user:ai6fAgyD7AuziP5oPZ9b6f3atEApYqI3adpg-d40lkmvBr7bs73fqz1g-a@dpg-ct15sqrtq21c73ab8l70-a.oregon-postgres.render.com/meglermonitor"
    
    print("📡 Connecting to database via scraper...")
    db = Database(db_url)
    
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
        WHERE listing_date >= NOW() - INTERVAL '30 days'
        ORDER BY listing_date DESC, price DESC NULLS LAST
        LIMIT 1000
    """
    
    results = db.execute_query(query)
    
    listings_data = []
    for row in results:
        listing = {
            "id": row[0],
            "source": row[1],
            "listing_id": row[2],
            "url": row[3],
            "title": row[4],
            "address": row[5],
            "city": row[6],
            "district": row[7],
            "price": row[8],
            "price_per_sqm": row[9],
            "sqm": row[10],
            "bedrooms": row[11],
            "bathrooms": row[12],
            "property_type": row[13],
            "ownership_type": row[14],
            "energy_label": row[15],
            "year_built": row[16],
            "days_on_market": row[17],
            "broker": row[18],
            "broker_phone": row[19],
            "broker_email": row[20],
            "chain": row[21],
            "listing_date": row[22].isoformat() if row[22] else None,
            "updated_date": row[23].isoformat() if row[23] else None,
            "sold_date": row[24].isoformat() if row[24] else None,
            "longitude": float(row[25]) if row[25] else None,
            "latitude": float(row[26]) if row[26] else None,
            "segment": row[27],
            "price_bucket": row[28],
            "role": row[29]
        }
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
        WHERE listing_date >= NOW() - INTERVAL '12 months'
    """
    
    metrics_result = db.execute_query(metrics_query)
    metrics_row = metrics_result[0] if metrics_result else [0, 0, 0, 0]
    
    metrics = {
        "as_of": datetime.now().isoformat() + "Z",
        "total_listings": metrics_row[0],
        "active_agents": metrics_row[1], 
        "total_value": int(metrics_row[2]) if metrics_row[2] else 0,
        "avg_price": int(metrics_row[3]) if metrics_row[3] else 0
    }
    
    print(f"💰 Total value: {metrics['total_value']:,} kr")
    print(f"👥 Active agents: {metrics['active_agents']:,}")
    
    db.close()
    
    return {
        "listings": listings_data,
        "metrics": metrics
    }

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
    print("🚀 Generating comprehensive sample data...")
    
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
        
        # Show formatted value
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
        print(f"❌ Error: {e}")
        return None

if __name__ == "__main__":
    main()