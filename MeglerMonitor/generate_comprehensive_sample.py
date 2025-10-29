#!/usr/bin/env python3
"""
Generate comprehensive sample data from the actual database.
This will create sample files that include all the impressive real data.
"""

import json
import os
import psycopg2
from datetime import datetime

# Database connection
DB_URL = "postgresql://meglermonitor_user:ai6fAgyD7AuziP5oPZ9b6f3atEApYqI3adpg-d40lkmvBr7bs73fqz1g-a@dpg-ct15sqrtq21c73ab8l70-a.oregon-postgres.render.com/meglermonitor"

def fetch_all_data():
    """Fetch all data from the database to create comprehensive samples."""
    
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    print("🔄 Fetching all listings...")
    # Get all listings
    cur.execute("""
        SELECT 
            id, source, listing_id, url, title, address, city, district, 
            price, price_per_sqm, sqm, bedrooms, bathrooms, 
            property_type, ownership_type, energy_label, year_built, 
            days_on_market, broker, broker_phone, broker_email, chain, 
            listing_date, updated_date, sold_date, 
            ST_X(location) as longitude, ST_Y(location) as latitude,
            segment, price_bucket, role
        FROM listings 
        ORDER BY listing_date DESC
    """)
    
    listings_data = []
    for row in cur.fetchall():
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
    
    print(f"📊 Fetched {len(listings_data)} listings")
    
    # Get metrics
    print("🔄 Calculating metrics...")
    cur.execute("""
        SELECT 
            COUNT(*) as total_listings,
            COUNT(DISTINCT broker) as active_agents,
            SUM(CASE WHEN price IS NOT NULL THEN price ELSE 0 END) as total_value,
            AVG(CASE WHEN price IS NOT NULL THEN price ELSE NULL END) as avg_price
        FROM listings 
        WHERE listing_date >= NOW() - INTERVAL '12 months'
    """)
    
    metrics_row = cur.fetchone()
    metrics = {
        "as_of": datetime.now().isoformat() + "Z",
        "total_listings": metrics_row[0],
        "active_agents": metrics_row[1],
        "total_value": int(metrics_row[2]) if metrics_row[2] else 0,
        "avg_price": int(metrics_row[3]) if metrics_row[3] else 0
    }
    
    print(f"💰 Total value: {metrics['total_value']:,} kr")
    print(f"👥 Active agents: {metrics['active_agents']:,}")
    
    # Get broker aggregations
    print("🔄 Fetching broker data...")
    cur.execute("""
        SELECT 
            broker, chain, 
            COUNT(*) as listings,
            SUM(CASE WHEN price IS NOT NULL THEN price ELSE 0 END) as total_value,
            AVG(CASE WHEN price IS NOT NULL THEN price ELSE NULL END) as avg_price,
            COUNT(DISTINCT city) as cities_covered
        FROM listings 
        WHERE broker IS NOT NULL
        GROUP BY broker, chain
        ORDER BY total_value DESC
        LIMIT 100
    """)
    
    brokers = []
    for row in cur.fetchall():
        broker = {
            "broker": row[0],
            "chain": row[1],
            "listings": row[2],
            "total_value": int(row[3]) if row[3] else 0,
            "avg_price": int(row[4]) if row[4] else 0,
            "cities_covered": row[5]
        }
        brokers.append(broker)
    
    print(f"🏆 Top broker: {brokers[0]['broker']} with {brokers[0]['total_value']:,} kr")
    
    cur.close()
    conn.close()
    
    return {
        "listings": listings_data,
        "metrics": metrics,
        "brokers": brokers
    }

def save_sample_files(data):
    """Save the comprehensive sample data to files."""
    
    # Ensure sample directory exists
    os.makedirs("sample", exist_ok=True)
    
    # Save comprehensive listings (all data)
    print("💾 Saving comprehensive_listings.json...")
    with open("sample/comprehensive_listings.json", "w", encoding="utf-8") as f:
        json.dump(data["listings"], f, indent=2, ensure_ascii=False)
    
    # Save updated metrics
    print("💾 Saving updated metrics.json...")
    with open("sample/metrics.json", "w", encoding="utf-8") as f:
        json.dump(data["metrics"], f, indent=2)
    
    # Save broker data
    print("💾 Saving brokers.json...")
    with open("sample/brokers.json", "w", encoding="utf-8") as f:
        json.dump(data["brokers"], f, indent=2, ensure_ascii=False)
    
    # Create a summary file
    summary = {
        "generated_at": datetime.now().isoformat() + "Z",
        "total_listings": len(data["listings"]),
        "total_value": data["metrics"]["total_value"],
        "active_agents": data["metrics"]["active_agents"],
        "top_broker": data["brokers"][0]["broker"] if data["brokers"] else None,
        "top_broker_value": data["brokers"][0]["total_value"] if data["brokers"] else 0,
        "files_created": [
            "comprehensive_listings.json",
            "metrics.json", 
            "brokers.json",
            "sample_summary.json"
        ]
    }
    
    print("💾 Saving sample_summary.json...")
    with open("sample/sample_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    
    return summary

def main():
    """Main function to generate comprehensive sample data."""
    print("🚀 Generating comprehensive sample data from database...")
    print(f"📡 Connecting to database...")
    
    try:
        # Fetch all data
        data = fetch_all_data()
        
        # Save sample files
        summary = save_sample_files(data)
        
        print("\n✅ Sample data generation complete!")
        print(f"📈 Generated {summary['total_listings']:,} listings")
        print(f"💰 Total value: {summary['total_value']:,} kr")
        print(f"👥 Active agents: {summary['active_agents']:,}")
        print(f"🏆 Top broker: {summary['top_broker']} ({summary['top_broker_value']:,} kr)")
        print("\nFiles created in sample/ directory:")
        for file in summary['files_created']:
            print(f"  ✓ {file}")
        
        return summary
        
    except Exception as e:
        print(f"❌ Error generating sample data: {e}")
        return None

if __name__ == "__main__":
    main()