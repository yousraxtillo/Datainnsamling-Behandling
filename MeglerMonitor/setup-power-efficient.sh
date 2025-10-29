#!/bin/bash

# Optimalisert strømsparing for MeglerMonitor
# Holder systemet våken men sparer maksimalt på strøm

echo "🔋 Setter opp strømoptimalisert 24/7 drift..."

# Slå AV skjerm raskt (sparer mest strøm)
sudo pmset -c displaysleep 2

# Hold systemet våken (men lar andre ting spare strøm)
sudo pmset -c sleep 0

# Optimalisere andre komponenter for strømsparing
sudo pmset -c disksleep 10          # Disk kan sove etter 10 min
sudo pmset -c gpuswitch 2           # Automatisk GPU bytte
sudo pmset -c powernap 0            # Slå av Power Nap
sudo pmset -c tcpkeepalive 0        # Reduser nettverkstrafikk

echo "✅ Strømoptimalisert oppsett fullført:"
echo "   💻 System: Alltid våken (minimal strøm)"
echo "   🖥️  Skjerm: Av etter 2 min (sparer 20-50W)"
echo "   💽 Disk: Sover etter 10 min"
echo "   🌐 Nettverk: Redusert aktivitet"
echo ""
echo "💡 Estimert forbruk: 10-20W (som en LED pære)"
echo "📊 MeglerMonitor vil kjøre 24/7 for ~15W"