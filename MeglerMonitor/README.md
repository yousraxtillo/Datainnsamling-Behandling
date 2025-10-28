# Megler Monitor

Megler Monitor is a production-ready monorepo that scrapes residential property listings from DNB Eiendom and Hjem.no, stores historical snapshots, serves a Fastify-based REST API with aggregated metrics, and ships a modern Next.js dashboard for market visibility.

## Repository Structure

```
megler-monitor/
  scraper/        # Python 3.11 data collection package
  api/            # Fastify + TypeScript REST API
  web/            # Next.js 14 dashboard (App Router)
  infra/          # Docker, docker-compose, CI, deployment manifests
  sample/         # Sample payloads used when the DB is empty
  out/raw/        # Local scraper snapshots (gitignored)
```

## Quick Start

```bash
# prerequisites: Docker, Python 3.11 (or uv), Node.js 20, pnpm

cp .env.example .env

# launch postgres for local development
docker compose up -d db

# run scrapers (via uv for fast env management)
uv run python -m scraper.run --all

# boot API (Fastify + tsx dev server)
pnpm -C api install
pnpm -C api db:migrate
pnpm -C api db:refresh
pnpm -C api dev

# boot dashboard
pnpm -C web install
pnpm -C web dev
```

> ℹ️ `pnpm -C api db:migrate`/`db:refresh` expect `DATABASE_URL` to be set (e.g. `postgres://postgres:postgres@localhost:5432/megler`). Alternatively run them inside the container: `docker compose -f infra/docker-compose.yml exec api pnpm --dir api db:migrate`.

Then visit `http://localhost:3000` for the dashboard and `http://localhost:8000/api/health` for the API.

## Data Flow

1. Scrapers fetch listing payloads from the public JSON endpoints, normalizing and writing to CSV snapshot files under `out/raw/` **and** appending rows to the Postgres `listings` table. Each listing includes an estimated `commission_est` value (default 1.25 % of price) that feeds commission analytics.
2. The API reads from Postgres, aggregating metrics and providing time-travel queries via snapshot dates. When the database is empty (e.g., fresh install), setting `USE_SAMPLE=true` lets the API serve `sample/all_listings.json` and `sample/metrics.json`.
3. The Next.js dashboard consumes the API using SWR, presenting KPIs, rankings, filters, trend deltas, and commission leaderboards.

## Deployment At A Glance

| Layer | Target | Notes |
| ----- | ------ | ----- |
| API + DB | Render (docker) | `infra/render.yaml`, set `DATABASE_URL` to managed Postgres |
| Dashboard | Vercel (Next.js) | Set `NEXT_PUBLIC_API_BASE` to deployed API URL |
| Scrapers | GitHub Actions nightly | `infra/github/actions/scraper-nightly.yml` can post to prod DB |

See `infra/README.md` for a deeper dive and production hardening tips.

## Key Commands

```bash
# run all scrapers with default date window (=latest)
uv run python -m scraper.run --all

# home.no only with custom publish window
uv run python -m scraper.run --hjem --from 1704067200 --to 1735603200

# api lint + tests
pnpm -C api lint
pnpm -C api test

# refresh broker commission materialized view after large imports
pnpm -C api db:refresh

# web lint + build
pnpm -C web lint
pnpm -C web build

# compose full stack (db + api + web)
docker compose up --build
```

## Commission Analytics

- Scraper populates `commission_est` per listing (configurable via `SCRAPER_COMMISSION_RATE`).
- API exposes `/api/agg/commissions/brokers`, `/api/agg/commissions/chains`, and `/api/agg/commissions/trends` for derived metrics.
- Dashboard highlights top brokers/chains, average commissions, trend deltas, and a bar chart of the top performers.
- After large ingest cycles run `pnpm -C api db:refresh` to refresh the `broker_commission_stats` materialized view.

## Filters & Broker Insights

- API `/api/listings` now accepts `chain`, `district`, `property_type`, `role`, `price_min`, `price_max`, and fuzzy `search` tokens (e.g. `Nordvik Oslo`).
- New endpoints:
  - `/api/broker/:slug` – broker summary, property/district breakdowns, commission trend, and listings.
  - `/api/agg/districts?city=Oslo` – top brokers/chains per district.
- Dashboard filters include property types, price bands, role selectors, and Oslo district drill-downs with compact NOK formatting.

## Legal & Compliance

This project respects robots.txt and official terms as a proof-of-concept. Scrapers throttle requests with randomized jitter and a polite `User-Agent`. See `LEGAL.md` for guidance and obligations.

## Contributing

1. Create a feature branch.
2. Run scrapers + API + dashboard locally.
3. Ensure linting and tests pass.
4. Submit a PR with notes on scraper changes and new endpoints.

## License

See [LICENSE](LICENSE).
