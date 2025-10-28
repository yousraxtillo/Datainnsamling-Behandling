#!/bin/bash

# 🚀 MeglerMonitor Quick Deploy Script
# Dette scriptet hjelper deg med å deploye raskt til forskjellige platforms

set -e

echo "🚀 MeglerMonitor Deployment Helper"
echo "=================================="

echo "Velg deployment platform:"
echo "1) Render.com (Anbefalt - Raskest)"
echo "2) Vercel + Railway"
echo "3) Heroku"
echo "4) Kun commit til GitHub (for manuell deploy)"

read -p "Velg alternativ (1-4): " choice

case $choice in
    1)
        echo "📋 Render.com deployment:"
        echo "1. Gå til: https://render.com"
        echo "2. Klikk 'New' → 'Blueprint'"
        echo "3. Koble til GitHub repo: yousraxtillo/Datainnsamling-Behandling"
        echo "4. Render finner automatisk infra/render.yaml"
        echo "5. Klikk 'Apply' for å deploye"
        echo ""
        echo "📱 Du vil få URLs som:"
        echo "   - API: https://megler-monitor-api.onrender.com"
        echo "   - Web: https://megler-monitor-web.onrender.com"
        ;;
    2)
        echo "📋 Vercel + Railway deployment:"
        echo "For Web (Vercel):"
        echo "1. Gå til: https://vercel.com"
        echo "2. Import GitHub repository"
        echo "3. Root Directory: 'web'"
        echo "4. Environment Variable: NEXT_PUBLIC_API_BASE=https://din-api-url.railway.app"
        echo ""
        echo "For API (Railway):"
        echo "1. Gå til: https://railway.app"
        echo "2. Deploy API fra GitHub"
        echo "3. Legg til PostgreSQL database"
        ;;
    3)
        echo "📋 Heroku deployment:"
        echo "1. Installer Heroku CLI: brew install heroku/brew/heroku"
        echo "2. Kjør heroku login"
        echo "3. Opprett apps: heroku create megler-monitor-api && heroku create megler-monitor-web"
        echo "4. Deploy med Docker containers"
        ;;
    4)
        echo "📋 Committer endringer til GitHub..."
        git add .
        git status
        read -p "Fortsett med commit? (y/n): " confirm
        if [[ $confirm == [yY] ]]; then
            git commit -m "🚀 Production deployment ready - updated render.yaml and added deployment guide"
            git push origin main
            echo "✅ Pushet til GitHub!"
            echo "Nå kan du deploye manuelt fra din valgte platform"
        else
            echo "❌ Commit avbrutt"
        fi
        ;;
    *)
        echo "❌ Ugyldig valg"
        exit 1
        ;;
esac

echo ""
echo "📚 Se DEPLOYMENT_GUIDE.md for detaljerte instruksjoner"
echo "🆘 Trenger du hjelp? Sjekk troubleshooting-seksjonen i guiden"