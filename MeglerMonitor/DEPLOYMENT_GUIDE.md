# 🚀 MeglerMonitor Deployment Guide

## 1. Render.com Deployment (Anbefalt - Raskest)

### Trinn for deployment:

1. **Gå til [render.com](https://render.com) og logg inn**

2. **Koble til GitHub repository:**
   - Klikk "New" → "Blueprint" 
   - Velg dette GitHub repository: `yousraxtillo/Datainnsamling-Behandling`
   - Render vil automatisk finne `infra/render.yaml`

3. **Konfigurer miljøvariabler:**
   ```
   DATABASE_URL=postgresql://user:password@host:port/database
   CORS_ORIGIN=https://din-app.onrender.com
   USE_SAMPLE=false (eller true for demo-data)
   ```

4. **Deploy:**
   - Klikk "Apply"
   - Render vil automatisk bygge og deploye både API og web
   - Du får URLs som: 
     - API: `https://megler-monitor-api.onrender.com`
     - Web: `https://megler-monitor-web.onrender.com`

**Estimert tid:** 10-15 minutter

---

## 2. Vercel (Kun Web) + Railway/Supabase (Database)

### For Next.js web app:

1. **Gå til [vercel.com](https://vercel.com)**
2. **Import GitHub repository**
3. **Konfigurer:**
   - Root Directory: `web`
   - Build Command: `pnpm build`
   - Install Command: `pnpm install`
   - Environment Variables: 
     ```
     NEXT_PUBLIC_API_BASE=https://din-api-url.railway.app
     ```

### For API:
1. **Gå til [railway.app](https://railway.app)** 
2. **Deploy API fra GitHub**
3. **Legg til PostgreSQL database**

**Estimert tid:** 15-20 minutter

---

## 3. Heroku (Fullstack)

### Deployment steps:

1. **Installer Heroku CLI**
   ```bash
   brew install heroku/brew/heroku
   ```

2. **Login og opprett app:**
   ```bash
   heroku login
   heroku create megler-monitor-api
   heroku create megler-monitor-web
   ```

3. **Legg til PostgreSQL:**
   ```bash
   heroku addons:create heroku-postgresql:essential-0 -a megler-monitor-api
   ```

4. **Deploy:**
   ```bash
   # For API
   cd api
   heroku container:push web -a megler-monitor-api
   heroku container:release web -a megler-monitor-api
   
   # For Web  
   cd ../web
   heroku container:push web -a megler-monitor-web
   heroku container:release web -a megler-monitor-web
   ```

**Estimert tid:** 20-30 minutter

---

## 4. DigitalOcean App Platform

1. **Gå til [cloud.digitalocean.com](https://cloud.digitalocean.com)**
2. **Create App**
3. **Velg GitHub repository**
4. **Konfigurer komponenter:**
   - Web Service (Next.js)
   - API Service (Node.js)
   - Database (PostgreSQL)

**Estimert tid:** 15-25 minutter

---

## 🔧 Hurtig Oppsett for Demo (Med Sample Data)

Hvis du vil deploye raskt for testing uten ekte database:

### 1. Oppdater render.yaml for sample data:

```yaml
services:
  - type: web
    name: megler-monitor-api
    env: docker
    plan: starter
    region: frankfurt
    dockerfilePath: infra/Dockerfile.api
    healthCheckPath: /api/health
    envVars:
      - key: USE_SAMPLE
        value: "true"  # Bruk sample data
      - key: CORS_ORIGIN
        value: "*"
      - key: RATE_LIMIT_MAX
        value: "500"

  - type: web
    name: megler-monitor-web
    env: docker
    plan: starter
    region: frankfurt
    dockerfilePath: infra/Dockerfile.web
    envVars:
      - key: NEXT_PUBLIC_API_BASE
        fromService:
          type: web
          name: megler-monitor-api
          property: host
```

### 2. Push til GitHub og deploy på Render

**Estimert tid:** 5-10 minutter

---

## 📱 Test URLs

Etter deployment vil du få lenker som:

- **Render:** `https://megler-monitor-web.onrender.com`
- **Vercel:** `https://megler-monitor.vercel.app`  
- **Heroku:** `https://megler-monitor-web.herokuapp.com`
- **DigitalOcean:** `https://megler-monitor-xxxxx.ondigitalocean.app`

---

## 🔑 Sikkerhet for Production

Når du går i produksjon senere:

1. **Miljøvariabler:** Aldri commit API-nøkler til Git
2. **CORS:** Sett korrekt domain i `CORS_ORIGIN`
3. **Rate Limiting:** Juster `RATE_LIMIT_MAX` basert på bruk
4. **Database:** Bruk managed database (ikke lokal)
5. **HTTPS:** Sørg for SSL-sertifikater (automatisk på de fleste platforms)

---

## 🆘 Feilsøking

### Vanlige problemer:

1. **API kan ikke nås fra Web:**
   - Sjekk at `NEXT_PUBLIC_API_BASE` peker til riktig API URL
   - Sjekk CORS-innstillinger

2. **Database connection feil:**
   - Sjekk `DATABASE_URL` format
   - Sikre at database er tilgjengelig fra API-serveren

3. **Build feil:**
   - Sjekk at alle miljøvariabler er satt
   - Se build logs på deployment platform

### For hjelp:
- Render: Se "Events" tab i dashboard
- Vercel: Se "Functions" tab for logs  
- Railway: Se "Deployments" for logs
- Heroku: `heroku logs --tail -a app-name`