## Infrastructure & Operations

This folder contains container definitions, database migrations, GitHub Actions workflows, and deployment manifests for Megler Monitor.

### Docker Compose (local)

`docker compose` spins up the full stack with hot reload for the API and web app. Default commands:

```bash
# Start Postgres, API, and Web in watch mode
docker compose -f infra/docker-compose.yml up

# Run scrapers inside the dedicated container when needed
docker compose -f infra/docker-compose.yml run --rm scraper python -m scraper.run --all
```

### Containers

- `Dockerfile.api` – Node 20 Alpine image that compiles the Fastify server (`pnpm -C api build`) and runs `dist/index.js`.
- `Dockerfile.web` – Next.js 14 build (standalone output). Provide `NEXT_PUBLIC_API_BASE` at runtime.
- `Dockerfile.scraper` – Python 3.11 slim image that installs the scraper package in editable mode.

### Database migrations

`infra/migrations/001_init.sql` provisions the `listings` table with required indexes. Apply locally with:

```bash
pnpm -C api db:migrate
```

The script reads all `.sql` files in lexical order, so add new migrations as `002_*.sql`, `003_*.sql`, etc.

### Continuous Integration

`infra/github/workflows` holds reusable GitHub Actions:

- `ci.yml` – Lints & typechecks API and web, builds Next.js output.
- `scraper-nightly.yml` – Nightly cron that builds the scraper container and executes `python -m scraper.run --all`. Provide `PROD_DATABASE_URL` secret for production.

### Deployment (Render + Vercel)

- `render.yaml` defines a Render web service for the API. It builds `infra/Dockerfile.api` and wires the managed Postgres connection string. Copy the generated `DATABASE_URL` into the Render dashboard.
- Deploy the web dashboard to Vercel (`npm` adapter). Set `NEXT_PUBLIC_API_BASE` to the Render API URL.
- Scraper can run via GitHub Actions or Render Cron job, pointing to the same database.

### Environment expectations

| Variable | Target | Notes |
| -------- | ------ | ----- |
| `DATABASE_URL` | API container | Points at Postgres (compose uses `db` service) |
| `NEXT_PUBLIC_API_BASE` | Web container | Base URL for API (compose uses `http://api:8000`) |
| `SCRAPER_DB_URL` | Scraper | Direct connection string for append-only inserts |

Adjust `.env` to match your environment before running containers or workflows.
