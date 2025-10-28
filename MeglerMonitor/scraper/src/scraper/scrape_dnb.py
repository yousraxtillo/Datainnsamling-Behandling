from __future__ import annotations

import math
from datetime import datetime
from typing import List

from .utils import (
    ListingRow,
    clean_price,
    derive_price_bucket,
    derive_segment,
    detect_broker_role,
    determine_is_sold,
    estimate_commission,
    extract_dnb_location_fields,
    extract_dnb_published,
    extract_postal_code,
    infer_district,
    isoformat,
    jitter_sleep,
    map_dnb_status,
    map_dnb_type,
    now_utc,
    parse_datetime,
)

DNB_URL = "https://dnbeiendom.no/api/v1/cognitivesearch/properties"
HEADERS = {"Referer": "https://dnbeiendom.no/"}
BASE_PAYLOAD = {
    "facets": [],
    "filter": "(status eq 2 and projectRelation eq 3 or (projectRelation eq 1 and status ne 99)) and status ne 3 and status ne null and not (projectRelation eq 1 and status eq 99) and not (projectRelation eq 2 and status eq 99)",
    "orderBy": ["forSaleDate desc", "created desc"],
    "select": [
        "id",
        "size",
        "area",
        "units",
        "areas",
        "noOfBedRooms",
        "propertyBaseType",
        "propertyTypeId",
        "ownership",
        "heading",
        "showings",
        "assignmentNum",
        "forSaleDate",
        "created",
        "status",
        "locations",
        "media",
        "price",
        "brokers",
    ],
    "skip": 0,
    "top": 24,
}


def normalize_listing(doc: dict, snapshot_at: datetime, commission_rate: float) -> List[ListingRow]:
    snapshot_iso = isoformat(snapshot_at)
    last_seen = isoformat(now_utc())

    listing_id = str(doc.get("id") or "")
    title = doc.get("heading")

    loc_values, city = extract_dnb_location_fields(doc.get("locations"))
    address = ", ".join(loc_values) if loc_values else None
    postal_code = extract_postal_code(*(loc_values or []))
    district = infer_district(city, postal_code)

    price_obj = doc.get("price") or {}
    price = price_obj.get("salePrice") or price_obj.get("askingPrice") or price_obj.get("totalPrice")
    price_int = clean_price(price)
    commission_est = estimate_commission(price_int, commission_rate)
    price_bucket = derive_price_bucket(price_int)
    property_type = map_dnb_type(doc.get("propertyTypeId"))
    segment = derive_segment(property_type, title)

    brokers = {}
    for broker in doc.get("brokers") or []:
        if not broker:
            continue
        name = broker.get("name") or broker.get("fullName")
        if not name:
            continue
        brokers.setdefault(name, broker.get("title") or broker.get("role"))

    if not brokers:
        brokers = {None: None}

    published_raw = extract_dnb_published(doc, snapshot_iso)
    published_dt = parse_datetime(published_raw)
    published = isoformat(published_dt) if published_dt else published_raw
    status = map_dnb_status(doc.get("status"))
    is_sold = determine_is_sold(status)

    rows: List[ListingRow] = []
    for name, title_text in brokers.items():
        role = detect_broker_role(title_text)
        rows.append(
            ListingRow(
                source="DNB",
                listing_id=listing_id,
                title=title,
                address=address,
                city=city,
                district=district,
                chain="DNB Eiendom",
                broker=name,
                price=price_int,
                commission_est=commission_est,
                status=status,
                published=published,
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
) -> List[ListingRow]:
    rows: List[ListingRow] = []
    top = BASE_PAYLOAD["top"]
    skip = 0
    total = None

    while True:
        payload = dict(BASE_PAYLOAD, skip=skip, top=top)
        logger.info("DNB skip=%s top=%s", skip, top)
        response = session.post(DNB_URL, headers=HEADERS, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()

        documents = data.get("documents") or []
        if not documents:
            logger.info("DNB no more results at skip=%s", skip)
            break

        for doc in documents:
            try:
                rows.extend(normalize_listing(doc, snapshot_at, commission_rate))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to normalize DNB hit: %s", exc, exc_info=True)

        skip += top
        total = data.get("totalCount") or total
        if total and skip >= total:
            break
        if len(documents) < top:
            break

        jitter_sleep(min_sleep_ms, max_sleep_ms)

    return rows
