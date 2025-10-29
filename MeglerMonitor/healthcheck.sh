#!/bin/bash

# Cron setup script for MeglerMonitor
# Kjører hver time for å sikre at services er oppe

cd /Users/yousra/MeglerMonitor

# Sjekk om services kjører
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "$(date): Web service ned, starter på nytt..." >> /Users/yousra/MeglerMonitor/cron.log
    docker compose -f infra/docker-compose.yml up -d web
fi

if ! curl -s http://localhost:8000/api/metrics > /dev/null; then
    echo "$(date): API service ned, starter på nytt..." >> /Users/yousra/MeglerMonitor/cron.log
    docker compose -f infra/docker-compose.yml up -d api
fi

echo "$(date): Helsesjekk fullført" >> /Users/yousra/MeglerMonitor/cron.log