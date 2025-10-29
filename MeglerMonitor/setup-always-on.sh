#!/bin/bash

# Sett Mac til å ikke gå i dvale når den er plugget inn
# Dette holder Mac-en våken så Docker kan kjøre 24/7

echo "⚡ Konfigurerer Mac for 24/7 drift..."

# Forhindre automatisk dvale når plugget inn
sudo pmset -c sleep 0
sudo pmset -c displaysleep 10
sudo pmset -c disksleep 0

# Forhindre at systemet går i dvale ved lukket skjerm (laptop)
sudo pmset -c lidwake 1

echo "✅ Mac vil nå holde seg våken når plugget inn"
echo "   - System sover aldri når på strøm"  
echo "   - Skjerm slukker etter 10 min (sparer strøm)"
echo "   - Disk sover aldri"
echo "   - Våkner når du åpner laptopen"

echo ""
echo "For å reversere senere:"
echo "sudo pmset -c sleep 1"