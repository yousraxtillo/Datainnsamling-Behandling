# Scraper Package

Python 3.11 package that collects listings from DNB Eiendom and Hjem.no, normalizes the data, and stores both CSV snapshots and database rows.

## Commands

```bash
# run everything (uses current timestamp as snapshot)
python -m scraper.run --all

# run individual collectors
python -m scraper.run --dnb
python -m scraper.run --hjem --from 1704067200 --to 1735603200
```

The CLI reads environment variables from `.env` if loaded (e.g. via `direnv` or `dotenv`).

## Environment Variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `SCRAPER_DB_URL` | Postgres connection string for writing snapshots | `postgres://postgres:postgres@localhost:5432/megler` |
| `SCRAPER_USER_AGENT` | Outbound HTTP `User-Agent` header | `MeglerMonitor/POC (+contact: you@example.com)` |
| `SCRAPER_MIN_SLEEP_MS` | Lower bound for jitter sleep between requests | `500` |
| `SCRAPER_MAX_SLEEP_MS` | Upper bound for jitter sleep between requests | `1500` |
| `SCRAPER_COMMISSION_RATE` | Estimated commission rate used for derived metrics | `0.0125` |

During normalization the scraper also attempts to infer Oslo districts based on postal codes so the API can expose district-level analytics.

## Output

- Normalized CSV snapshot: `out/raw/<YYYY-MM-DD>_all_listings.csv`
- Per-source CSV: `out/raw/<YYYY-MM-DD>_<source>.csv`
- Rows appended to Postgres `listings` table (`snapshot_at` matches the run timestamp).

## Testing

```bash
uv pip install -e ".[dev]"
pytest
```

Tests are light-weight and focus on normalization utilities; heavier integration tests live in CI and rely on recorded fixtures.
