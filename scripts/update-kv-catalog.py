#!/usr/bin/env python3
"""Refresh the static collective-agreement index from the public A–Z catalogue."""

import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse
from urllib.request import Request, urlopen
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SITEMAP_URL = "https://www.kollektivvertrag.at/sitemap"
BASE_URL = "https://www.kollektivvertrag.at"
OUTPUT = ROOT / "content" / "collective-agreements.json"
USER_AGENT = "HaklarPublicRightsGuide/1.0"
POPULAR_GROUPS = {
    "hotel-gastgewerbe": 1,
    "handelsangestellte": 2,
    "handelsarbeiter": 3,
    "bauindustrie-baugewerbe": 4,
    "gueterbefoerderungsgewerbe": 5,
    "sozialwirtschaft-oesterreich-swoe": 6,
    "mobile-pflege-betreuungsdienste": 7,
}


class SitemapParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.href = None
        self.label = []
        self.entries = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href = dict(attrs).get("href")
            self.label = []

    def handle_data(self, data):
        if self.href:
            self.label.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.href:
            url = urljoin(BASE_URL, self.href)
            if url.startswith(f"{BASE_URL}/kv?"):
                name = re.sub(r"\s+", " ", "".join(self.label)).strip()
                if name:
                    self.entries.append({"title": name, "url": url})
            self.href = None


class AgreementParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.group_data = None

    def handle_starttag(self, tag, attrs):
        if tag == "ex-kv-dashboard":
            self.group_data = dict(attrs).get("data-variant-group-json")


def fetch(url):
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def load_entry(entry):
    time.sleep(0.15)
    page = fetch(entry["url"])
    parser = AgreementParser()
    parser.feed(page)
    if not parser.group_data:
        raise ValueError(f"No agreement metadata found for {entry['title']}")

    group = json.loads(parser.group_data)
    query = parse_qs(urlparse(entry["url"]).query)
    group_id = query.get("variant-group-id", [""])[0]
    requested_variant = query.get("variant-id", [""])[0]
    variants = group.get("variants", {}).get("items") or []
    if not variants and group.get("variant"):
        variants = [group["variant"]]
    if not variants:
        raise ValueError(f"No agreement variants found for {entry['title']}")

    variant_ids = {variant.get("id") for variant in variants}
    popular_variant_id = requested_variant
    if group_id in POPULAR_GROUPS and popular_variant_id not in variant_ids:
        broadest_variant = max(
            variants,
            key=lambda item: len((item.get("facetMapping") or {}).get("provinces", [])),
        )
        popular_variant_id = broadest_variant.get("id")

    records = []
    for variant in variants:
        variant_id = variant.get("id")
        if not variant_id:
            continue
        validity = (variant.get("properties") or {}).get("validity") or {}
        parsed_url = urlparse(entry["url"])
        variant_query = parse_qs(parsed_url.query)
        variant_query["variant-id"] = [variant_id]
        variant_url = urlunparse(parsed_url._replace(query=urlencode(variant_query, doseq=True)))
        records.append({
            "title": variant.get("name") or group.get("title") or entry["title"],
            "url": variant_url,
            "groupId": group_id,
            "variantId": variant_id,
            "validFrom": validity.get("validFrom"),
            "lastContentUpdate": validity.get("lastContentUpdate"),
            "employmentTypes": (variant.get("facetMapping") or {}).get("employmentTypes", []),
            "regions": (variant.get("facetMapping") or {}).get("provinces", []),
            "unions": (variant.get("properties") or {}).get("unions", []),
            "topics": [
                topic["title"]
                for topic in variant.get("topics", [])
                if topic.get("title")
            ],
            "popularOrder": (
                POPULAR_GROUPS.get(group_id)
                if variant_id == popular_variant_id
                else None
            ),
        })
    if not records:
        raise ValueError(f"No named agreement variants found for {entry['title']}")
    return records


def main():
    parser = SitemapParser()
    parser.feed(fetch(SITEMAP_URL))
    entries = list({entry["url"]: entry for entry in parser.entries}.values())
    if not entries:
        raise RuntimeError("The official A–Z catalogue returned no agreement entries.")

    results = []
    failures = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        tasks = {executor.submit(load_entry, entry): entry for entry in entries}
        for task in as_completed(tasks):
            entry = tasks[task]
            try:
                results.extend(task.result())
            except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
                failures.append({"title": entry["title"], "url": entry["url"], "error": str(error)})
                print(f"Could not read {entry['title']}: {error}", file=sys.stderr)

    results.sort(key=lambda item: (item["popularOrder"] is None, item["popularOrder"] or 999, item["title"].casefold()))
    document = {
        "source": SITEMAP_URL,
        "retrievedAt": datetime.now(timezone.utc).date().isoformat(),
        "listingCount": len(entries),
        "entryCount": len(results),
        "agreements": results,
        "failures": failures,
    }
    OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(results)} agreement variants from {len(entries)} catalogue listings to {OUTPUT.relative_to(ROOT)}.")
    if failures:
        raise RuntimeError(f"{len(failures)} agreement records could not be refreshed.")


if __name__ == "__main__":
    main()
