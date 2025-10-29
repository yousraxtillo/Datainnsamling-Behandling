#!/bin/bash

# MeglerMonitor Startup Script
# Dette scriptet starter alle tjenester og holder dem i gang

set -e

echo "🚀 Starter MeglerMonitor services..."

# Gå til riktig mappe
cd "$(dirname "$0")"

# Stopp eksisterende containers
echo "⏹️  Stopper eksisterende containers..."
docker compose -f infra/docker-compose.yml down

# Start alle services
echo "🔄 Starter alle services..."
docker compose -f infra/docker-compose.yml up -d

# Vent på at services starter
echo "⏳ Venter på at services starter..."
sleep 30

# Sjekk status
echo "📊 Sjekker service status..."
echo "API Status:"
curl -s http://localhost:8000/api/metrics | jq -r '"Total value: \(.total_value), Active agents: \(.active_agents)"' || echo "❌ API ikke tilgjengelig"

echo ""
echo "Web Status:"
curl -s http://localhost:3000 > /dev/null && echo "✅ Web tilgjengelig på http://localhost:3000" || echo "❌ Web ikke tilgjengelig"

echo ""
echo "🎉 MeglerMonitor er klar!"
echo "   📱 Dashboard: http://localhost:3000"
echo "   🔧 API: http://localhost:8000"
echo ""
echo "Tjenestene vil kjøre i bakgrunnen og restarte automatisk."
echo "For å stoppe: docker compose -f infra/docker-compose.yml down"