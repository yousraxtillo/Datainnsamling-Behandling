from __future__ import annotations

import argparse
import sys
from datetime import datetime

from . import scrape_dnb, scrape_hjem
from .utils import (
    COMMISSION_RATE_DEFAULT,
    ListingRow,
    build_session,
    connect_db,
    getenv,
    getenv_float,
    getenv_int,
    get_logger,
    insert_rows,
    isoformat,
    now_utc,
    snapshot_filename,
    write_csv,
)

DEFAULT_OUT_DIR = "out/raw"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Megler Monitor scraper runner.")
    parser.add_argument("--all", action="store_true", help="Run all scrapers.")
    parser.add_argument("--dnb", action="store_true", help="Run DNB scraper.")
    parser.add_argument("--hjem", action="store_true", help="Run Hjem.no scraper.")
    parser.add_argument("--from", dest="publish_from", type=int, help="UNIX timestamp lower bound for Hjem publish_date.")
    parser.add_argument("--to", dest="publish_to", type=int, help="UNIX timestamp upper bound for Hjem publish_date.")
    parser.add_argument("--out", dest="out_dir", default=DEFAULT_OUT_DIR, help="Output directory root for CSV snapshots.")
    parser.add_argument("--db-url", dest="db_url", help="Override Postgres connection string.")
    return parser.parse_args()


def should_run(args: argparse.Namespace, flag: str) -> bool:
    if args.all:
        return True
    return getattr(args, flag)


def run() -> int:
    args = parse_args()
    logger = get_logger("scraper")

    user_agent = getenv("SCRAPER_USER_AGENT", "MeglerMonitor/POC (+contact: you@example.com)")
    min_sleep_ms = getenv_int("SCRAPER_MIN_SLEEP_MS", 500)
    max_sleep_ms = getenv_int("SCRAPER_MAX_SLEEP_MS", 1500)
    commission_rate = getenv_float("SCRAPER_COMMISSION_RATE", COMMISSION_RATE_DEFAULT)

    session = build_session(user_agent)
    snapshot_at = now_utc()
    snapshot_iso = isoformat(snapshot_at)
    logger.info("Starting scraper run snapshot_at=%s", snapshot_iso)

    results: list[ListingRow] = []

    if should_run(args, "dnb"):
        try:
            dnb_rows = scrape_dnb.collect(session, logger, min_sleep_ms, max_sleep_ms, snapshot_at, commission_rate)
            results.extend(dnb_rows)
            write_csv(dnb_rows, snapshot_filename(args.out_dir, "dnb_listings", snapshot_at))
            logger.info("DNB rows=%s", len(dnb_rows))
        except Exception as exc:  # noqa: BLE001
            logger.exception("DNB scraper failed: %s", exc)

    if should_run(args, "hjem"):
        try:
            hjem_rows = scrape_hjem.collect(
                session,
                logger,
                min_sleep_ms,
                max_sleep_ms,
                snapshot_at,
                commission_rate,
                args.publish_from,
                args.publish_to,
            )
            results.extend(hjem_rows)
            write_csv(hjem_rows, snapshot_filename(args.out_dir, "hjem_listings", snapshot_at))
            logger.info("Hjem rows=%s", len(hjem_rows))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Hjem scraper failed: %s", exc)

    if results:
        write_csv(results, snapshot_filename(args.out_dir, "all_listings", snapshot_at))
        logger.info("Total rows=%s", len(results))

    db_url = args.db_url or getenv("SCRAPER_DB_URL", "")
    if db_url and results:
        try:
            with connect_db(db_url) as conn:
                inserted = insert_rows(conn, results)
                logger.info("Inserted rows=%s", inserted)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to insert into DB: %s", exc)

    logger.info("Scraper run complete snapshot_at=%s", snapshot_iso)
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
