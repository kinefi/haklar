#!/usr/bin/env python3
"""
Fetches current Austrian income tax brackets (EStG § 33 Abs. 1) from the
official RIS Open Government Data API (data.bka.gv.at) and writes
`content/income-tax-current.json`.

Usage:
  python3 scripts/update-tax-brackets.py
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "content" / "income-tax-current.json"

RIS_OGD_BASE_URL = "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht"
RIS_PUBLIC_URL = (
    "https://www.ris.bka.gv.at/GeltendeFassung.wxe"
    "?Abfrage=Bundesnormen&Gesetzesnummer=10004570"
)
USER_AGENT = "Mozilla/5.0 (compatible; HaklarTaxUpdater/1.5.0)"

STATUTORY_2026_BRACKETS = [
    {"lower": 0, "upper": 13539, "rate": 0},
    {"lower": 13539, "upper": 21992, "rate": 20},
    {"lower": 21992, "upper": 36458, "rate": 30},
    {"lower": 36458, "upper": 70365, "rate": 40},
    {"lower": 70365, "upper": 104859, "rate": 48},
    {"lower": 104859, "upper": 1000000, "rate": 50},
    {"lower": 1000000, "upper": None, "rate": 55},
]


def fetch_text(url: str, timeout: int = 20) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/html, application/xml;q=0.9, */*;q=0.8",
            "Accept-Language": "de-AT,de;q=0.9",
        },
    )
    with urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def parse_euro(raw: str) -> int:
    if "million" in raw.lower():
        return 1000000
    return int(re.sub(r"[^\d]", "", raw))


def clean_markup(markup: str) -> str:
    cleaned = re.sub(
        r"<span[^>]*class=[\"'][^\"']*sr-only[^\"']*[\"'][^>]*>.*?</span>",
        " ",
        markup,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(r"<script[^>]*>.*?</script>", " ", cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<style[^>]*>.*?</style>", " ", cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = unescape(cleaned).replace("\xa0", " ").replace("\u202f", " ")
    cleaned = re.sub(r"\(Anm\.\s*\d+\)", " ", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip()


def extract_brackets_from_text(text: str) -> list[dict]:
    body_match = re.search(r"Die Einkommensteuer beträgt jährlich", text, flags=re.IGNORECASE)
    if not body_match:
        return []

    tail = text[body_match.start() :]
    end_match = re.search(r"\(1a\)|\(2\)\s+Von dem", tail)
    section = tail[: end_match.start()] if end_match else tail[:5000]

    num_pat = r"(\d{1,3}(?:[\s\.]\d{3})+|\d+|eine\s+Million)"
    brackets: list[dict] = []

    # 1. Zero-tax threshold: "für die ersten 13 539 Euro ... 0%"
    first_m = re.search(
        rf"für die ersten\s+{num_pat}\s*Euro\b[^%]*?0\s*%",
        section,
        flags=re.IGNORECASE,
    )
    if first_m:
        brackets.append({"lower": 0, "upper": parse_euro(first_m.group(1)), "rate": 0})

    # 2. Progressive bounded bands: "über X [Euro] bis Y Euro ... Z%"
    for m in re.finditer(
        rf"über\s+{num_pat}(?:\s*Euro)?\s+bis\s+{num_pat}\s*Euro\b[^%]*?(\d+(?:,\d+)?)\s*%",
        section,
        flags=re.IGNORECASE,
    ):
        rate = float(m.group(3).replace(",", "."))
        brackets.append({
            "lower": parse_euro(m.group(1)),
            "upper": parse_euro(m.group(2)),
            "rate": int(rate) if rate.is_integer() else rate,
        })

    # 3. Top open-ended marginal band ("über eine Million Euro ... 55%" or "über 1 000 000 Euro ... 55%")
    top_m = re.search(
        r"(?:über|mehr als)\s+(?:eine\s+Million|einer\s+Million|1[\s\.]?000[\s\.]?000)\s*Euro\b[^%]{0,120}?(\d+(?:,\d+)?)\s*%",
        section,
        flags=re.IGNORECASE,
    )
    if top_m:
        rate = float(top_m.group(1).replace(",", "."))
        brackets.append({
            "lower": 1000000,
            "upper": None,
            "rate": int(rate) if rate.is_integer() else rate,
        })

    seen = set()
    unique_brackets = []
    for b in sorted(brackets, key=lambda x: x["lower"]):
        key = (b["lower"], b["upper"], b["rate"])
        if key not in seen:
            seen.add(key)
            unique_brackets.append(b)

    return unique_brackets


def fetch_from_ris_ogd(today_iso: str) -> tuple[list[dict], str]:
    params = urlencode({
        "Applikation": "BrKons",
        "Gesetzesnummer": "10004570",
        "Abschnitt.Von": "33",
        "Abschnitt.Bis": "33",
        "Abschnitt.Typ": "Paragraph",
        "FassungVom": today_iso,
    })
    api_url = f"{RIS_OGD_BASE_URL}?{params}"
    raw_json = fetch_text(api_url)

    urls = re.findall(r"https?://ogd\.ris\.bka\.gv\.at/[^\s\"'<>]+\.html", raw_json, flags=re.IGNORECASE)
    doc_urls = sorted(set(urls), reverse=True)

    for doc_url in doc_urls[:6]:
        secure_url = doc_url.replace("http://", "https://", 1)
        doc_markup = fetch_text(secure_url)
        cleaned = clean_markup(doc_markup)
        brackets = extract_brackets_from_text(cleaned)
        if len(brackets) >= 7:
            return brackets, secure_url

    return [], RIS_PUBLIC_URL


def main() -> None:
    now = datetime.now(timezone.utc)
    today_iso = now.strftime("%Y-%m-%d")

    brackets: list[dict] = []
    used_source = {
        "name": "RIS — EStG 1988 § 33 Abs. 1",
        "url": RIS_PUBLIC_URL,
    }
    source_mode = "statutory-fallback"

    try:
        parsed, doc_url = fetch_from_ris_ogd(today_iso)
        if len(parsed) >= 7:
            brackets = parsed
            used_source = {"name": "RIS OGD — EStG 1988 § 33 Abs. 1", "url": doc_url}
            source_mode = "live-ris-ogd"
    except Exception as exc:
        print(f"[WARN] RIS OGD fetch failed: {exc}")

    if len(brackets) < 7:
        print("[WARN] Live source did not return >= 7 brackets; using statutory 2026 fallback.")
        brackets = STATUTORY_2026_BRACKETS

    payload = {
        "version": "1.5.0",
        "taxYear": now.year,
        "updatedAt": now.isoformat(),
        "mode": source_mode,
        "source": used_source,
        "brackets": brackets,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} ({len(brackets)} brackets, mode={source_mode})")


if __name__ == "__main__":
    main()
