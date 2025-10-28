from __future__ import annotations

import math
from datetime import datetime
from typing import List, Optional

from .utils import (
    START_2024_TS,
    ListingRow,
    clean_price,
    derive_price_bucket,
    derive_segment,
    detect_broker_role,
    determine_is_sold,
    estimate_commission,
    extract_postal_code,
    infer_district,
    isoformat,
    jitter_sleep,
    map_hjem_type,
    now_utc,
    parse_datetime,
)

HJEM_URL = "https://apigw.hjem.no/search-backend/api/v4/property/search"
PAGE_SIZE = 50

BASE_PAYLOAD = {
    "listing_type": "residential_sale",
    "order": "desc",
    "page": 1,
    "size": PAGE_SIZE,
    "view": "list",
}


def build_payload(page: int, publish_from: Optional[int], publish_to: Optional[int]) -> dict:
    payload = dict(BASE_PAYLOAD, page=page)
    payload["publish_date_min"] = publish_from or START_2024_TS
    payload["publish_date_max"] = publish_to or int(datetime.now().timestamp())
    return payload


def normalize_listing(hit: dict, snapshot_at: datetime, commission_rate: float) -> List[ListingRow]:
    snapshot_iso = isoformat(snapshot_at)
    last_seen = isoformat(now_utc())

    listing_id = str(hit.get("id") or "")
    title = hit.get("title")

    address_info = hit.get("address") or {}
    address = address_info.get("display_name")
    city = address_info.get("postal_place") or address_info.get("city")
    postal_code = address_info.get("postal_code") or extract_postal_code(address, hit.get("title"))
    district = infer_district(city, postal_code)

    agency = hit.get("agency") or {}
    chain = agency.get("name")

    prices = hit.get("prices") or {}
    amount = (
        prices.get("asking_price", {}).get("amount")
        or prices.get("total_price", {}).get("amount")
    )
    price_int = clean_price(amount)
    commission_est = estimate_commission(price_int, commission_rate)
    price_bucket = derive_price_bucket(price_int)

    contacts = [
        contact
        for contact in (hit.get("contacts") or [])
        if contact and contact.get("type") == "agent"
    ]
    if not contacts:
        contacts = [None]

    published_dt = parse_datetime(hit.get("publish_date"))
    property_type = map_hjem_type(hit.get("type"))
    segment = derive_segment(property_type, title)
    status = hit.get("status")
    is_sold = determine_is_sold(status)

    rows: List[ListingRow] = []
    for contact in contacts:
        broker_name = contact.get("name") if contact else None
        broker_title = contact.get("position") if contact else None
        role = detect_broker_role(broker_title)
        rows.append(
            ListingRow(
                source="Hjem.no",
                listing_id=listing_id,
                title=title,
                address=address,
                city=city,
                district=district,
                chain=chain,
                broker=broker_name,
                price=price_int,
                commission_est=commission_est,
                status=status,
                published=isoformat(published_dt) if published_dt else None,
                property_type=property_type,
                segment=segment,
                price_bucket=price_bucket,
                broker_role=role,
                role=role,
                is_sold=is_sold,
                last_seen_at=last_seen,
                snapshot_at=snapshot_iso,
            )
        )
    return rows


def collect(
    session,
    logger,
    min_sleep_ms: int,
    max_sleep_ms: int,
    snapshot_at: datetime,
    commission_rate: float,
    publish_from: Optional[int],
    publish_to: Optional[int],
) -> List[ListingRow]:
    rows: List[ListingRow] = []
    page = 1

    while True:
        payload = build_payload(page, publish_from, publish_to)
        logger.info("Hjem.no page=%s", page)
        response = session.post(
            HJEM_URL,
            headers={"Referer": "https://hjem.no/"},
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        ads = data.get("data") or []
        if not ads:
            logger.info("Hjem.no no data at page=%s", page)
            break

        for ad in ads:
            try:
                rows.extend(normalize_listing(ad, snapshot_at, commission_rate))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to normalize Hjem hit: %s", exc, exc_info=True)

        if len(ads) < payload["size"]:
            break
        page += 1
        jitter_sleep(min_sleep_ms, max_sleep_ms)

    return rows
