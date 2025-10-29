#!/usr/bin/env python3
"""
Test Render PostgreSQL connection with different methods
"""
import psycopg2
import socket
import time
from urllib.parse import urlparse

def test_network_connectivity(host, port=5432):
    """Test basic network connectivity to the database host"""
    print(f"🌐 Testing network connectivity to {host}:{port}")
    try:
        # Test socket connection
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        result = sock.connect_ex((host, port))
        sock.close()
        
        if result == 0:
            print("✅ Port is accessible")
            return True
        else:
            print(f"❌ Port is not accessible (error code: {result})")
            return False
    except Exception as e:
        print(f"❌ Network test failed: {e}")
        return False

def test_psycopg2_connection(database_url):
    """Test direct psycopg2 connection"""
    print("🔗 Testing direct psycopg2 connection...")
    try:
        # Parse the URL to get components
        parsed = urlparse(database_url)
        host = parsed.hostname
        port = parsed.port or 5432
        
        # Test network first
        if not test_network_connectivity(host, port):
            print("❌ Network connectivity failed, skipping database connection test")
            return False
            
        # Try connecting with different timeout settings
        conn_params = {
            'host': host,
            'port': port,
            'database': parsed.path[1:] if parsed.path else '',
            'user': parsed.username,
            'password': parsed.password,
            'connect_timeout': 30,
            'sslmode': 'require'
        }
        
        print(f"📊 Connecting to: {host}:{port}")
        conn = psycopg2.connect(**conn_params)
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        print(f"✅ Connected successfully! PostgreSQL version: {version}")
        
        cursor.close()
        conn.close()
        return True
        
    except psycopg2.OperationalError as e:
        print(f"❌ PostgreSQL connection failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def main():
    print("🧪 Render PostgreSQL Connection Diagnostics")
    print("=" * 50)
    
    # Get database URL
    database_url = input("Enter your Render PostgreSQL URL: ")
    
    # Parse URL for testing
    parsed = urlparse(database_url)
    if not parsed.hostname:
        print("❌ Invalid database URL format")
        return
    
    print(f"📍 Host: {parsed.hostname}")
    print(f"📍 Port: {parsed.port or 5432}")
    print(f"📍 Database: {parsed.path[1:] if parsed.path else 'N/A'}")
    print(f"📍 User: {parsed.username}")
    print()
    
    # Run tests
    success = test_psycopg2_connection(database_url)
    
    if not success:
        print("\n💡 Troubleshooting suggestions:")
        print("1. Check if your Render database is fully provisioned and running")
        print("2. Verify the connection string from your Render dashboard")
        print("3. Check if your network/ISP blocks PostgreSQL port 5432")
        print("4. Try connecting from a different network (mobile hotspot)")
        print("5. Contact Render support if the database should be accessible")

if __name__ == "__main__":
    main()