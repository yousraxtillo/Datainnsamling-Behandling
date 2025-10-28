from __future__ import annotations

import csv
import json
import logging
import os
import random
import re
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Iterable, Iterator, List, Optional, Sequence

import psycopg
import requests
from dateutil import parser as date_parser
from psycopg import sql
from requests.adapters import HTTPAdapter
from urllib3 import Retry


START_2024_TS = int(datetime(2024, 1, 1, tzinfo=UTC).timestamp())
COMMISSION_RATE_DEFAULT = 0.0125

LISTING_COLUMNS = [
    "source",
    "listing_id",
    "title",
    "address",
    "city",
    "district",
    "chain",
    "broker",
    "price",
    "commission_est",
    "status",
    "published",
    "property_type",
    "segment",
    "price_bucket",
    "broker_role",
    "role",
    "is_sold",
    "last_seen_at",
    "snapshot_at",
]


STATUS_MAP_DNB = {
    1: "unknown",
    2: "available",
    3: "sold",
    4: "reserved",
}

HJEM_TYPE_MAP = {
    "single_dwelling": "Enebolig",
    "apartment": "Leilighet",
    "twin_dwelling": "Tomannsbolig",
    "townhouse": "Rekkehus",
    "plot": "Tomt",
    "farm": "Gårdsbruk",
    "others": "Annet",
}

DNB_PROPERTY_TYPE_MAP = {
    24: "Leilighet",
    1: "Enebolig",
    2: "Tomannsbolig",
    3: "Rekkehus",
    7: "Fritidsbolig",
    8: "Tomt",
    12: "Garasje/Parkering",
    17: "Landbrukseiendom",
}

DNB_STATUS_MAP = {
    0: "unknown",
    1: "coming",
    2: "available",
    3: "sold",
    4: "reserved",
    5: "inactive",
    99: "archived",
}

DOTNET_EPOCH_TICKS = 621355968000000000


@dataclass(slots=True)
class ListingRow:
    source: str
    listing_id: str
    title: str | None
    address: str | None
    city: str | None
    district: str | None
    chain: str | None
    broker: str | None
    price: int | None
    commission_est: int | None
    status: str | None
    published: str | None
    property_type: str | None
    segment: str | None
    price_bucket: str | None
    broker_role: str | None
    role: str | None
    is_sold: bool | None
    last_seen_at: str
    snapshot_at: str

    def to_dict(self) -> dict[str, Optional[str | int | bool]]:
        return asdict(self)


def get_logger(name: str = "scraper") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


def build_session(user_agent: str, retries: int = 3, backoff: float = 0.3) -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=retries,
        backoff_factor=backoff,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(
        {
            "User-Agent": user_agent,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
    )
    return session


def jitter_sleep(min_ms: int, max_ms: int) -> None:
    period = random.uniform(min_ms, max_ms) / 1000
    time.sleep(period)


def now_utc() -> datetime:
    return datetime.now(UTC)


def isoformat(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat()


def parse_price(value: object) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        cleaned = value.replace("\u00a0", "").replace(" ", "").replace(",", "").strip()
        if not cleaned:
            return None
        try:
            return int(Decimal(cleaned))
        except (ValueError, ArithmeticError):
            return None
    return None


def parse_datetime(value: object) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=UTC)
        except (ValueError, OSError):
            return None
    if isinstance(value, str):
        try:
            parsed = date_parser.parse(value)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=UTC)
            return parsed.astimezone(UTC)
        except (ValueError, TypeError):
            return None
    return None


def net_ticks_to_datetime(ticks: int) -> Optional[datetime]:
    # .NET ticks: 100 nanoseconds since 0001-01-01
    if not ticks or ticks <= 0:
        return None
    epoch_start = datetime(1, 1, 1, tzinfo=UTC)
    seconds, remainder = divmod(ticks, 10_000_000)
    microseconds = (remainder // 10)
    return epoch_start + timedelta(seconds=seconds, microseconds=microseconds)


def detect_broker_role(title: Optional[str]) -> Optional[str]:
    if not title:
        return None
    title_lower = title.lower()
    if "fullmektig" in title_lower or "trainee" in title_lower:
        return "Fullmektig"
    if "megler" in title_lower:
        return "Megler"
    if "oppgj" in title_lower:
        return "Oppgjør"
    return "Annet"


OSLO_DISTRICT_RANGES = [
    ((160, 179), "Sentrum"),
    ((200, 249), "Sentrum"),
    ((450, 469), "St. Hanshaugen"),
    ((370, 379), "Vestre Aker"),
    ((460, 499), "St. Hanshaugen"),
    ((550, 579), "Frogner"),
    ((580, 599), "Frogner"),
    ((600, 699), "Gamle Oslo"),
    ((700, 799), "Grünerløkka"),
    ((400, 449), "St. Hanshaugen"),
    ((800, 899), "Sagene"),
    ((900, 999), "Nordstrand"),
]


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def write_csv(rows: Sequence[ListingRow], path: str) -> None:
    ensure_dir(os.path.dirname(path))
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=LISTING_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row.to_dict())


def dump_json(rows: Sequence[ListingRow], path: str) -> None:
    ensure_dir(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as handle:
        json.dump([row.to_dict() for row in rows], handle, ensure_ascii=False, indent=2)


def batched(iterable: Sequence[ListingRow], size: int = 500) -> Iterator[List[ListingRow]]:
    batch: List[ListingRow] = []
    for item in iterable:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def connect_db(db_url: str) -> psycopg.Connection:
    return psycopg.connect(db_url, autocommit=False)


def insert_rows(connection: psycopg.Connection, rows: Sequence[ListingRow]) -> int:
    if not rows:
        return 0
    with connection.cursor() as cur:
        insert_stmt = sql.SQL(
            """
            INSERT INTO listings (
                source,
                listing_id,
                title,
                address,
                city,
                district,
                chain,
                broker,
                price,
                commission_est,
                status,
                published,
                property_type,
                segment,
                price_bucket,
                broker_role,
                role,
                is_sold,
                last_seen_at,
                snapshot_at
            ) VALUES (
                %(source)s,
                %(listing_id)s,
                %(title)s,
                %(address)s,
                %(city)s,
                %(district)s,
                %(chain)s,
                %(broker)s,
                %(price)s,
                %(commission_est)s,
                %(status)s,
                %(published)s,
                %(property_type)s,
                %(segment)s,
                %(price_bucket)s,
                %(broker_role)s,
                %(role)s,
                %(is_sold)s,
                %(last_seen_at)s,
                %(snapshot_at)s
            )
            ON CONFLICT (source, listing_id, broker, snapshot_at) DO NOTHING
            """
        )
        dict_rows = []
        for row in rows:
            payload = row.to_dict()
            enrich_location_fields(payload)
            dict_rows.append(payload)
        cur.executemany(insert_stmt, dict_rows)

        latest_stmt = sql.SQL(
            """
            INSERT INTO listings_latest (
                source,
                listing_id,
                title,
                address,
                city,
                district,
                chain,
                broker,
                price,
                commission_est,
                status,
                published,
                property_type,
                segment,
                price_bucket,
                broker_role,
                role,
                is_sold,
                last_seen_at,
                snapshot_at
            ) VALUES (
                %(source)s,
                %(listing_id)s,
                %(title)s,
                %(address)s,
                %(city)s,
                %(district)s,
                %(chain)s,
                %(broker)s,
                %(price)s,
                %(commission_est)s,
                %(status)s,
                %(published)s,
                %(property_type)s,
                %(segment)s,
                %(price_bucket)s,
                %(broker_role)s,
                %(role)s,
                %(is_sold)s,
                %(last_seen_at)s,
                %(snapshot_at)s
            )
            ON CONFLICT (source, listing_id) DO UPDATE
            SET
                title = EXCLUDED.title,
                address = EXCLUDED.address,
                city = EXCLUDED.city,
                district = EXCLUDED.district,
                chain = EXCLUDED.chain,
                broker = EXCLUDED.broker,
                price = EXCLUDED.price,
                commission_est = EXCLUDED.commission_est,
                status = EXCLUDED.status,
                published = EXCLUDED.published,
                property_type = EXCLUDED.property_type,
                segment = EXCLUDED.segment,
                price_bucket = EXCLUDED.price_bucket,
                broker_role = EXCLUDED.broker_role,
                role = EXCLUDED.role,
                is_sold = EXCLUDED.is_sold,
                last_seen_at = EXCLUDED.last_seen_at,
                snapshot_at = EXCLUDED.snapshot_at
            WHERE listings_latest.snapshot_at <= EXCLUDED.snapshot_at
            """
        )
        cur.executemany(latest_stmt, dict_rows)
    connection.commit()
    return len(rows)


def snapshot_filename(root: str, label: str, snapshot_at: datetime) -> str:
    date_str = snapshot_at.astimezone(UTC).date().isoformat()
    ensure_dir(root)
    return os.path.join(root, f"{date_str}_{label}.csv")


def dnb_status(code: Optional[int]) -> Optional[str]:
    if code is None:
        return None
    return STATUS_MAP_DNB.get(code, "unknown")


def select_dnb_city(locations: Optional[List[dict]]) -> Optional[str]:
    if not locations:
        return None
    for loc in locations:
        name = (loc.get("name") or "").strip()
        if not name:
            continue
        normalized = name.replace(" kommune", "").replace(" fylke", "")
        if normalized.lower() in {"norge", "norway"}:
            continue
        if any(char.isdigit() for char in normalized):
            continue
        return normalized
    return None


def coalesce_datetime(values: Iterable[Optional[datetime]]) -> Optional[datetime]:
    for value in values:
        if value:
            return value
    return None


def getenv_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def getenv(name: str, default: str) -> str:
    return os.getenv(name, default)


def getenv_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


# ---- Domain-specific helpers -------------------------------------------------


def normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text.title() if text.upper() == text else text


def clean_price(value: object) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        cleaned = (
            value.replace("\u00a0", "")
            .replace(" ", "")
            .replace(",", ".")
            .strip()
        )
        if not cleaned:
            return None
        try:
            return int(float(cleaned))
        except (ValueError, ArithmeticError):
            return None
    return None


def estimate_commission(price: Optional[int], rate: float) -> Optional[int]:
    if price is None:
        return None
    if rate <= 0:
        return None
    try:
        return int(round(price * rate))
    except (TypeError, ValueError):
        return None


PRICE_BUCKETS: list[tuple[int, Optional[int], str]] = [
    (0, 5_000_000, "0-5M"),
    (5_000_000, 10_000_000, "5-10M"),
    (10_000_000, 20_000_000, "10-20M"),
    (20_000_000, None, "20M+"),
]

SEGMENT_ALIASES = {
    "leilighet": "Leilighet",
    "enebolig": "Enebolig",
    "rekkehus": "Rekkehus",
    "tomannsbolig": "Rekkehus",
    "småhus": "Rekkehus",
    "townhouse": "Rekkehus",
    "nybygg": "Nybygg",
    "prosjekt": "Nybygg",
    "fritidsbolig": "Fritidsbolig",
    "gårdsbruk": "Gårdsbruk",
    "tomt": "Tomt",
}

SOLD_STATUSES = {"sold", "solgt"}


def derive_price_bucket(price: Optional[int]) -> Optional[str]:
    if price is None or price <= 0:
        return None
    for lower, upper, label in PRICE_BUCKETS:
        if price >= lower and (upper is None or price < upper):
            return label
    return None


def derive_segment(property_type: Optional[str], title: Optional[str]) -> Optional[str]:
    for value in (property_type, title):
        if not value:
            continue
        lowered = value.lower()
        for key, segment in SEGMENT_ALIASES.items():
            if key in lowered:
                return segment
    return property_type or None


def determine_is_sold(status: Optional[str]) -> bool:
    if not status:
        return False
    return status.lower() in SOLD_STATUSES


def map_hjem_type(values: Optional[Iterable]) -> str:
    if not values:
        return "Annet"
    for raw in values:
        if raw is None:
            continue
        mapped = HJEM_TYPE_MAP.get(str(raw).lower())
        if mapped:
            return mapped
    return "Annet"


def map_dnb_type(value: object) -> str:
    try:
        key = int(value)
    except (TypeError, ValueError):
        return "Annet"
    return DNB_PROPERTY_TYPE_MAP.get(key, "Annet")


def map_dnb_status(value: object) -> Optional[str]:
    if value is None:
        return None
    try:
        num = int(value)
        return DNB_STATUS_MAP.get(num, str(value))
    except (TypeError, ValueError):
        return str(value)


def extract_dnb_location_fields(locs: Iterable) -> tuple[list, Optional[str]]:
    values: list[str] = []
    city: Optional[str] = None
    street = None
    postal = None
    municipality = None

    for loc in locs or []:
        if isinstance(loc, dict):
            value = loc.get("value")
            loc_type = (loc.get("type") or "").upper()
        else:
            value = loc
            loc_type = ""
        if not value:
            continue
        value_str = str(value).strip()
        if not value_str:
            continue
        values.append(value_str)
        if loc_type in {"STREET", "ADDRESS"} and not street:
            street = value_str
        elif loc_type in {"ZIPCODE", "POSTALCODE"} and not postal:
            postal = value_str
        elif loc_type in {"CITY", "POSTALPLACE"} and not city:
            city = normalize_text(value_str)
        elif loc_type in {"MUNICIPALITY", "AREA"} and not municipality:
            municipality = value_str

    if not city:
        candidates = []
        if municipality:
            candidates.append(municipality)
        if len(values) >= 3:
            candidates.append(values[2])
        candidates.extend(values)
        for candidate in candidates:
            cand = str(candidate).strip()
            if not cand or cand.lower() == "norge":
                continue
            if cand == street or cand == postal:
                continue
            if cand.replace(" ", "").isdigit():
                continue
            city = normalize_text(cand)
            if city:
                break

    return values, city


def ticks_to_iso8601(ticks: Optional[int | str]) -> Optional[str]:
    try:
        ticks_int = int(ticks)
    except (TypeError, ValueError):
        return None
    if ticks_int <= 0:
        return None
    unix_seconds = (ticks_int - DOTNET_EPOCH_TICKS) / 10_000_000
    if unix_seconds < 0:
        return None
    try:
        return datetime.fromtimestamp(unix_seconds, tz=UTC).isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def first_non_null(values: Iterable[Optional[str]]) -> Optional[str]:
    for value in values:
        if value:
            return value
    return None


def extract_dnb_published(doc: dict, fallback: str) -> str:
    for_sale = doc.get("forSaleDate")
    created = doc.get("created")

    showings = doc.get("showings") or []
    showing_dates = sorted(
        [s.get("start") for s in showings if s and s.get("start")],
        key=lambda x: x,
    )

    media = doc.get("media") or []
    media_dates = sorted(
        filter(None, (ticks_to_iso8601(m.get("lastModified")) for m in media)),
        key=lambda x: x,
    )

    primary = first_non_null(
        [
            for_sale,
            created,
            showing_dates[0] if showing_dates else None,
            media_dates[0] if media_dates else None,
        ]
    )

    return primary or fallback


def extract_postal_code(*values: Optional[str]) -> Optional[str]:
    for value in values:
        if not value:
            continue
        text = str(value)
        digits = "".join(ch for ch in text if ch.isdigit())
        if len(digits) >= 4:
            return digits[:4]
    return None


def infer_district(city: Optional[str], postal_code: Optional[str]) -> Optional[str]:
    if not city or city.lower() != "oslo" or not postal_code or len(postal_code) < 4:
        return None
    try:
        code_int = int(postal_code[:4])
    except ValueError:
        return None
    for (start, end), name in OSLO_DISTRICT_RANGES:
        if start * 10 <= code_int <= end * 10 + 9:
            return name
    return None


CITY_BLACKLIST = {"norge", "norway", "no", "as", "as.", "as,"}


def guess_city_from_text(*values: Optional[str]) -> Optional[str]:
    for value in values:
        if not value:
            continue
        parts = re.split(r"[,|\-/\n]", str(value))
        for part in reversed(parts):
            token = normalize_text(part)
            if not token:
                continue
            lower = token.lower()
            if lower in CITY_BLACKLIST:
                continue
            if any(ch.isdigit() for ch in token):
                continue
            return token
    return None


def enrich_location_fields(data: dict[str, Optional[str | int]]) -> None:
    city = normalize_text(data.get("city"))
    if not city:
        city = guess_city_from_text(data.get("address"), data.get("title"))
    if city:
        data["city"] = city
    postal_code = extract_postal_code(data.get("address"), data.get("title"))
    if not data.get("district"):
        inferred = infer_district(city, postal_code)
        if inferred:
            data["district"] = inferred
