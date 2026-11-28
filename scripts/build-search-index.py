#!/usr/bin/env python3
"""
Build the small static search index (company notes, tax text) used by the browser.

- Guide cards are NOT indexed: the home page scores them directly from content/<lang>.json.
- Collective agreements are NOT indexed: the browser searches content/collective-agreements.json
  directly, using content/topic-concepts.json (scripts/build-topic-map.mjs) for topic labels.
- Concept tags come from content/concepts.json (same matching rules as assets/semantic.js).

Usage:
  python3 scripts/build-search-index.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
EMPLOYER_KV_PATH = CONTENT_DIR / "employer-kv.json"
TAX_PATH = CONTENT_DIR / "income-tax-current.json"
PAY_UI_PATH = CONTENT_DIR / "pay-ui.json"
OUTPUT_INDEX_PATH = CONTENT_DIR / "search-index.json"

CONCEPTS_PATH = CONTENT_DIR / "concepts.json"
GERMAN_DIGRAPHS = {"ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue"}
FOLD_MAP = {"ß": "ss", "ı": "i", "đ": "dj", "ł": "l", "ø": "o", "æ": "ae", "œ": "oe"}

STOPWORDS = {
    "der", "die", "das", "und", "oder", "fur", "fuer", "mit", "von", "zu", "im", "in", "am", "an",
    "auf", "aus", "bei", "nach", "vor", "uber", "ueber", "unter", "durch", "als", "auch", "nicht",
    "sich", "dem", "den", "des", "ein", "eine", "einer", "einem", "einen", "ist", "sind", "wird",
    "werden", "kann", "konnen", "koennen", "muss", "mussen", "muessen", "dass", "ab", "bis", "pro",
    "the", "and", "for", "with", "from", "into", "are", "was", "were", "can", "may", "will", "not",
    "ve", "ile", "icin", "gibi", "daha", "olan", "olarak", "veya", "ya", "da", "de", "bu", "bir",
    "ili", "ali", "za", "od", "do", "na", "sa", "po", "koji", "koja", "koje", "su", "je", "se"
}


def normalize_text(text: str) -> str:
    """Mirrors `normalize()` in assets/common.js (diacritics stripped, lowercase, folded letters)."""
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return "".join(FOLD_MAP.get(ch, ch) for ch in text).strip()


def words(text: str) -> str:
    """Mirrors `words()` in assets/common.js: 'Annelik, izni!' -> 'annelik izni'."""
    return re.sub(r"[^a-z0-9]+", " ", normalize_text(text)).strip()


def term_variants(raw: str) -> set[str]:
    variants = {words(raw)}
    if re.search("[äöüÄÖÜ]", raw):
        variants.add(words("".join(GERMAN_DIGRAPHS.get(ch, ch) for ch in raw)))
    variants.discard("")
    return variants


def contains_term(padded_words: str, term: str) -> bool:
    """Mirrors `containsTerm()` in assets/semantic.js (5+ letter terms match at word start)."""
    return (" " + term) in padded_words if len(term) >= 5 else (" " + term + " ") in padded_words


@dataclass
class ConceptIndex:
    terms: dict[str, set[str]]          # concept id -> normalized terms
    owners: dict[str, set[str]]         # term -> concept ids
    containers: dict[str, list[tuple[str, int]]]  # term -> (longer term of another concept containing it, offset)


def load_concepts(path: Path = CONCEPTS_PATH) -> ConceptIndex:
    """concepts.json -> ConceptIndex (single source of truth shared with the browser)."""
    data = json.loads(path.read_text(encoding="utf-8"))
    terms: dict[str, set[str]] = {}
    owners: dict[str, set[str]] = {}
    for concept_id, definition in data["concepts"].items():
        concept_terms: set[str] = set()
        for term_list in definition.get("terms", {}).values():
            for raw in term_list:
                concept_terms |= term_variants(raw)
        terms[concept_id] = concept_terms
        for term in concept_terms:
            owners.setdefault(term, set()).add(concept_id)
    containers: dict[str, list[tuple[str, int]]] = {}
    for other in sorted(owners):
        for offset in range(len(other)):
            if offset > 0 and other[offset - 1] != " ":
                continue
            for end in range(offset + 2, len(other) + 1):
                if offset == 0 and end == len(other):
                    continue
                term = other[offset:end]
                if term not in owners:
                    continue
                if len(term) < 5 and end < len(other) and other[end] != " ":
                    continue
                if owners[other] - owners[term]:
                    containers.setdefault(term, []).append((other, offset))
    return ConceptIndex(terms, owners, containers)


def term_matches(padded: str, term: str, concept_id: str, index: ConceptIndex) -> bool:
    """Mirrors `termPosition()` in assets/semantic.js: longest match wins ("pflege" vs "pflegefreistellung")."""
    needle = " " + term if len(term) >= 5 else " " + term + " "
    start = padded.find(needle)
    while start >= 0:
        dominated = any(concept_id not in index.owners[other] and start - offset >= 0
                        and padded.startswith(" " + other, start - offset)
                        for other, offset in index.containers.get(term, ()))
        if not dominated:
            return True
        start = padded.find(needle, start + 1)
    return False


def tokenize(text: str) -> list[str]:
    norm = normalize_text(text)
    raw_tokens = re.findall(r"[a-z0-9]{2,}", norm)
    return [t for t in raw_tokens if t not in STOPWORDS]


@dataclass
class IndexChunk:
    id: str
    sourceType: str          # "company_kv" | "tax_2026"
    lang: str                # "de" | "tr" | "hr" | ... | "multi"
    title: str
    section: str
    text: str
    url: str
    meta: dict[str, Any]
    concepts: list[str]
    tf: dict[str, float]     # Sparse BM25/TF-IDF term weights


def detect_concepts(text: str, index: ConceptIndex) -> list[str]:
    padded = f" {words(text)} "
    return [cid for cid, terms in index.terms.items() if any(term_matches(padded, t, cid, index) for t in terms)]


def build_raw_chunks() -> list[dict[str, Any]]:
    raw_docs: list[dict[str, Any]] = []

    # Toplu sözleşmeler (collective-agreements.json) bu indekse girmez: tarayıcı doğrudan o dosyadan arar
    # (assets/search-retriever.js -> rankAgreements). Böylece veri iki kez yüklenmez/saklanmaz.

    # 2. Company / Employer KV mappings (content/employer-kv.json)
    if EMPLOYER_KV_PATH.exists():
        emp_data = json.loads(EMPLOYER_KV_PATH.read_text(encoding="utf-8"))
        for entry in emp_data.get("entries", []):
            notes = entry.get("notes") or {}
            source = (entry.get("sources") or [{}])[0]
            for lang, note_text in notes.items():
                raw_docs.append({
                    "sourceType": "company_kv",
                    "lang": lang,
                    "title": f"{entry.get('name')} · {entry.get('agreement')}",
                    "section": "Unternehmensbeispiel / KV-Zuordnung",
                    "text": f"{entry.get('name')} ({entry.get('agreement')}): {note_text}",
                    "url": source.get("url", ""),
                    "meta": {"companyId": entry.get("id"), "groupId": entry.get("groupId")}
                })

    # Rehber kartları indekse girmez: ana sayfa onları content/<dil>.json'dan doğrudan puanlar.

    # 4. 2026 Income Tax Brackets (content/income-tax-current.json + pay-ui.json)
    if TAX_PATH.exists() and PAY_UI_PATH.exists():
        tax_data = json.loads(TAX_PATH.read_text(encoding="utf-8"))
        pay_ui = json.loads(PAY_UI_PATH.read_text(encoding="utf-8"))
        brackets = tax_data.get("brackets", [])
        for lang, ui in pay_ui.items():
            lines = [ui.get("taxTitle", ""), ui.get("taxIntro", "")]
            for b in brackets:
                if b["lower"] == 0:
                    band = ui["firstBand"].replace("{amount}", f"€ {b['upper']:,}")
                elif b["upper"] is None:
                    band = ui["overBand"].replace("{lower}", f"€ {b['lower']:,}")
                else:
                    band = ui["rangeBand"].replace("{lower}", f"€ {b['lower']:,}").replace("{upper}", f"€ {b['upper']:,}")
                lines.append(f"{band}: {b['rate']}%")
            lines.append(ui.get("taxNote", ""))
            raw_docs.append({
                "sourceType": "tax_2026",
                "lang": lang,
                "title": ui.get("taxTitle", "Einkommensteuer 2026"),
                "section": "RIS EStG § 33 (2026)",
                "text": " ".join(lines),
                "url": "index.html#tax",
                "meta": {"taxYear": tax_data.get("taxYear", 2026)}
            })

    return raw_docs


def compute_bm25(raw_docs: list[dict[str, Any]], concepts: ConceptIndex) -> dict[str, Any]:
    """Computes BM25 sparse term weights + concept tags for all chunks."""
    tokenized_docs: list[list[str]] = []
    df_counter: Counter[str] = Counter()

    for d in raw_docs:
        combined = f"{d['title']} {d['title']} {d['section']} {d['text']}"
        tokens = tokenize(combined)
        tokenized_docs.append(tokens)
        for tok in set(tokens):
            df_counter[tok] += 1

    num_docs = max(len(raw_docs), 1)
    avgdl = sum(len(t) for t in tokenized_docs) / num_docs
    k1 = 1.5
    b = 0.75

    # Keep informative vocabulary terms (document frequency >= 1 and <= 85% of corpus)
    max_df = max(2, int(num_docs * 0.85))
    idf: dict[str, float] = {}
    for term, df in df_counter.items():
        if df <= max_df:
            idf[term] = round(math.log(1.0 + (num_docs - df + 0.5) / (df + 0.5)), 4)

    chunks: list[dict[str, Any]] = []
    for idx, (d, tokens) in enumerate(zip(raw_docs, tokenized_docs)):
        tf_counts = Counter(tokens)
        dl = max(len(tokens), 1)
        sparse_weights: dict[str, float] = {}
        for term, freq in tf_counts.items():
            if term not in idf:
                continue
            bm25_tf = (freq * (k1 + 1.0)) / (freq + k1 * (1.0 - b + b * (dl / max(avgdl, 1.0))))
            sparse_weights[term] = round(bm25_tf * idf[term], 4)

        # Keep top 45 weighted terms per chunk to keep JSON compact for browser loading
        top_terms = dict(sorted(sparse_weights.items(), key=lambda kv: kv[1], reverse=True)[:45])
        chunk_concepts = detect_concepts(f"{d['title']} {d['section']} {d['text']}", concepts)

        chunk_id = hashlib.sha1(
            f"{d['sourceType']}:{d['lang']}:{d['title']}:{d['section']}:{idx}".encode("utf-8")
        ).hexdigest()[:14]

        chunk_obj = IndexChunk(
            id=chunk_id,
            sourceType=d["sourceType"],
            lang=d["lang"],
            title=d["title"],
            section=d["section"],
            text=d["text"],
            url=d["url"],
            meta=d["meta"],
            concepts=chunk_concepts,
            tf=top_terms
        )
        chunks.append(asdict(chunk_obj))

    return {
        "version": 3,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "totalChunks": len(chunks),
            "vocabSize": len(idf)
        },
        "chunks": chunks
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the client-side search index (company notes, tax text).")
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_INDEX_PATH,
        help=f"Output JSON index path (default: {OUTPUT_INDEX_PATH})"
    )
    args = parser.parse_args()

    index_payload = compute_bm25(build_raw_chunks(), load_concepts())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(index_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = args.output.stat().st_size / 1024
    print(f"Wrote {args.output} ({index_payload['stats']['totalChunks']} chunks, {size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
