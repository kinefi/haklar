#!/usr/bin/env python3
"""
Build a static, client-side RAG (Retrieval-Augmented Generation / Semantic Search)
index from Austrian collective agreements (kollektivvertrag.at) and multilingual
worker rights guides.

Designed to work alongside `scripts/update-kv-catalog.py` with zero runtime
backend required (pure static JSON + TF-IDF/BM25 + dense-optional hybrid vectors).

Usage:
  python3 scripts/build_rag_index.py
  python3 scripts/build_rag_index.py --limit 60 --fetch-sections
  python3 scripts/build_rag_index.py --with-embeddings --model paraphrase-multilingual-MiniLM-L12-v2
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
CATALOG_PATH = CONTENT_DIR / "collective-agreements.json"
EMPLOYER_KV_PATH = CONTENT_DIR / "employer-kv.json"
TAX_PATH = CONTENT_DIR / "income-tax-current.json"
PAY_UI_PATH = CONTENT_DIR / "pay-ui.json"
OUTPUT_INDEX_PATH = CONTENT_DIR / "rag-index.json"

BASE_URL = "https://www.kollektivvertrag.at"
USER_AGENT = "HaklarRAGIndexer/1.0 (+https://github.com/haklar; educational worker-rights guide)"

# Multilingual domain synonym & concept expansion table (9 supported languages)
DOMAIN_CONCEPTS: dict[str, list[str]] = {
    "termination": [
        "kundigung", "entlassung", "einvernehmliche losung", "arbeitsende", "kundigungsfrist",
        "isten atilma", "kovulma", "fesih", "istifa", "ihbar suresi", "tazminat",
        "otkaz", "otpustanje", "otkazni rok", "sporazumni raskid",
        "concediere", "demisie", "preaviz",
        "felmondas", "elbocsatas", "felmondasi ido",
        "odpoved", "odpuscanje", "odpovedni rok",
        "dismissal", "termination", "resignation", "notice period"
    ],
    "bonus_13_14": [
        "sonderzahlung", "sonderzahlungen", "urlaubsgeld", "urlaubszuschuss",
        "weihnachtsgeld", "weihnachtsremuneration", "13. gehalt", "14. gehalt", "jahressechstel",
        "ikramiye", "bonus", "prim", "13. maas", "14. maas", "tatil parasi", "noel ikramiyesi",
        "regres", "bozicnica", "13. plata", "14. plata", "13. placa", "14. placa",
        "prima", "al 13-lea salariu", "al 14-lea salariu",
        "jutalom", "13. havi", "14. havi", "udulesi", "karacsonyi",
        "holiday pay", "christmas bonus", "13th salary", "14th salary"
    ],
    "vorsorge_severance": [
        "abfertigung", "abfertigung neu", "vorsorgekasse", "betriebliche vorsorge", "bvk", "1.53",
        "kidem tazminati", "emeklilik fonu", "birikim",
        "otpremnina", "mirovinski fond",
        "compensatie", "vechime",
        "vegkielegites", "nyugdijpenztar",
        "odpravnina", "pokojninski sklad",
        "severance pay", "provident fund"
    ],
    "wages_minimum": [
        "mindestlohn", "mindestgehalt", "grundlohn", "lohnordnung", "gehaltstafel",
        "verwendungsgruppe", "beschaftigungsgruppe", "einstufung", "vordienstzeiten", "zulage",
        "asgari ucret", "taban maas", "ucret skalasi", "kademe", "zam", "ek odeme",
        "minimalac", "osnovna plata", "platni razred", "dodatak",
        "salariu minim", "grila de salarizare", "sporuri",
        "minimalber", "alapber", "bertarifa", "potlek",
        "minimalna placa", "osnovna placa", "dodatek",
        "minimum wage", "base pay", "pay scale", "allowance"
    ],
    "overtime_hours": [
        "arbeitszeit", "normalarbeitszeit", "ueberstunden", "mehrarbeit", "zuschlag", "nachtarbeit",
        "schichtarbeit", "ruhezeit", "pause", "teilzeit", "vollzeit",
        "fazla mesai", "mesai", "calisma saati", "vardiya", "gece calismasi", "mola", "yari zamanli",
        "radno vrijeme", "prekovremeni", "smjena", "nocni rad", "pauza",
        "ore suplimentare", "program de lucru", "tura", "munca de noapte",
        "munkaido", "tulora", "muszak", "ejszakai munka",
        "delovni cas", "nadure", "izmena", "nocno delo",
        "working hours", "overtime", "shift work", "night work", "part-time"
    ],
    "leave_sick": [
        "urlaub", "krankenstand", "entgeltfortzahlung", "pflegefreistellung", "feiertag",
        "yillik izin", "hastalik", "rapor", "bakim izni", "resmi tatil",
        "godisnji odmor", "bolovanje", "bolest", "praznik",
        "concediu anual", "concediu medical", "sarbatoare",
        "szabadsag", "betegseg", "tappenz", "unnepnap",
        "dopust", "bolniska", "praznik",
        "annual leave", "sick leave", "public holiday"
    ],
    "tax_payslip": [
        "lohnzettel", "einkommensteuer", "steuerstufe", "brutto", "netto", "arbeitnehmerveranlagung",
        "pendlerpauschale", "familienbonus", "13539",
        "maas bordrosu", "gelir vergisi", "vergi dilimi", "vergi iadesi", "yol parasi",
        "platna lista", "porez", "porezni razred", "povrat poreza",
        "fluturas de salariu", "impozit", "restituire impozit",
        "berjegyzek", "ado", "adokulcs", "adovisszaterites",
        "placilna lista", "davek", "davcni razred",
        "payslip", "income tax", "tax bracket", "tax refund"
    ],
    "sectors": [
        "gastgewerbe", "hotel", "handel", "bau", "baugewerbe", "metall", "industrie",
        "it", "edv", "transport", "gueterbefoerderung", "pflege", "sozialwirtschaft", "reinigung",
        "otel", "restoran", "ticaret", "magaza", "insaat", "metal", "sanayi", "bilisim", "nakliye", "sofor", "bakim", "temizlik",
        "ugostiteljstvo", "trgovina", "gradevina", "industrija", "prijevoz", "njega", "ciscenje",
        "turism", "comert", "constructii", "transport", "ingrijire", "curatenie",
        "vendeglatas", "kereskedelem", "epitoipar", "femipar", "fuvarozas", "apolas", "takaritas",
        "gostinstvo", "trgovina", "gradbenistvo", "prevoz", "nega", "ciscenje",
        "hospitality", "retail", "construction", "manufacturing", "logistics", "care", "cleaning"
    ]
}

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
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("ß", "ss").replace("ı", "i").lower()
    return re.sub(r"\s+", " ", text).strip()


def tokenize(text: str) -> list[str]:
    norm = normalize_text(text)
    raw_tokens = re.findall(r"[a-z0-9]{2,}", norm)
    return [t for t in raw_tokens if t not in STOPWORDS]


class KVSectionParser(HTMLParser):
    """Extracts structured headings, paragraphs, and table rows from a kollektivvertrag.at page."""

    def __init__(self) -> None:
        super().__init__()
        self.in_main = False
        self.skip_depth = 0
        self.current_tag: str | None = None
        self.current_heading = "Allgemein"
        self.buffer: list[str] = []
        self.sections: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_dict = dict(attrs)
        if tag in {"script", "style", "nav", "header", "footer", "noscript"}:
            self.skip_depth += 1
            return
        if self.skip_depth > 0:
            return
        if tag in {"main", "article"} or "kv-content" in (attr_dict.get("class") or ""):
            self.in_main = True
        if tag in {"h1", "h2", "h3", "h4", "p", "li", "tr"}:
            self._flush()
            self.current_tag = tag

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "nav", "header", "footer", "noscript"} and self.skip_depth > 0:
            self.skip_depth -= 1
            return
        if self.skip_depth > 0:
            return
        if tag == self.current_tag:
            self._flush()
            self.current_tag = None

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0 and self.current_tag:
            cleaned = re.sub(r"\s+", " ", data).strip()
            if cleaned:
                self.buffer.append(cleaned)

    def _flush(self) -> None:
        if not self.buffer:
            return
        text = " ".join(self.buffer).strip()
        self.buffer.clear()
        if len(text) < 4:
            return
        if self.current_tag in {"h1", "h2", "h3", "h4"}:
            self.current_heading = text[:160]
        elif self.in_main or len(text) > 35:
            self.sections.append({
                "heading": self.current_heading,
                "text": text
            })


def fetch_html(url: str, timeout: int = 20) -> str:
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "de-AT,de;q=0.9"})
    with urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def chunk_sections(
    sections: list[dict[str, str]],
    max_chars: int = 750,
    overlap_chars: int = 120
) -> list[dict[str, str]]:
    """Overlapping semantic chunker preserving section headings."""
    chunks: list[dict[str, str]] = []
    cur_heading = ""
    cur_text = ""

    for sec in sections:
        heading = sec["heading"]
        text = sec["text"]
        if heading != cur_heading and cur_text:
            chunks.append({"heading": cur_heading, "text": cur_text.strip()})
            cur_text = ""
        cur_heading = heading

        if len(cur_text) + len(text) + 1 <= max_chars:
            cur_text = f"{cur_text} {text}".strip()
        else:
            if cur_text:
                chunks.append({"heading": cur_heading, "text": cur_text.strip()})
                tail = cur_text[-overlap_chars:].strip()
                cur_text = f"{tail} {text}".strip()
            else:
                # Split oversized single paragraph
                for start in range(0, len(text), max_chars - overlap_chars):
                    part = text[start : start + max_chars].strip()
                    if part:
                        chunks.append({"heading": cur_heading, "text": part})
                cur_text = ""

    if cur_text:
        chunks.append({"heading": cur_heading, "text": cur_text.strip()})
    return chunks


@dataclass
class RAGChunk:
    id: str
    sourceType: str          # "kv_catalog" | "kv_fulltext" | "company_kv" | "guide_card" | "tax_2026"
    lang: str                # "de" | "tr" | "hr" | ... | "multi"
    title: str
    section: str
    text: str
    url: str
    meta: dict[str, Any]
    concepts: list[str]
    tf: dict[str, float]     # Sparse BM25/TF-IDF term weights
    embedding: list[float] | None = None


def detect_concepts(normalized_blob: str) -> list[str]:
    matched = []
    for concept_id, terms in DOMAIN_CONCEPTS.items():
        if any(term in normalized_blob for term in terms):
            matched.append(concept_id)
    return matched


def build_raw_chunks(fetch_sections: bool, limit: int, delay: float) -> list[dict[str, Any]]:
    raw_docs: list[dict[str, Any]] = []

    # 1. Collective agreements from collective-agreements.json (generated by update-kv-catalog.py)
    if CATALOG_PATH.exists():
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        agreements = catalog.get("agreements", [])
        # Prioritize popular agreements first when limiting remote fetches
        ordered = sorted(
            agreements,
            key=lambda a: (a.get("popularOrder") is None, a.get("popularOrder") or 9999, a.get("title", ""))
        )

        fetched_count = 0
        for ag in ordered:
            title = ag.get("title", "")
            url = ag.get("url", "")
            topics = ag.get("topics") or []
            regions = ag.get("regions") or []
            emp_types = ag.get("employmentTypes") or []
            valid_from = ag.get("validFrom") or ""

            summary_parts = [f"Kollektivvertrag: {title}."]
            if valid_from:
                summary_parts.append(f"Gültig ab: {valid_from}.")
            if emp_types:
                summary_parts.append(f"Gilt für: {', '.join(emp_types)}.")
            if regions:
                summary_parts.append(f"Bundesländer: {', '.join(regions)}.")
            if topics:
                summary_parts.append(f"Enthaltene Themen & Regelungen: {', '.join(topics)}.")

            raw_docs.append({
                "sourceType": "kv_catalog",
                "lang": "de",
                "title": title,
                "section": "Übersicht & Themen",
                "text": " ".join(summary_parts),
                "url": url,
                "meta": {
                    "groupId": ag.get("groupId"),
                    "variantId": ag.get("variantId"),
                    "popularOrder": ag.get("popularOrder"),
                    "validFrom": valid_from,
                    "regions": regions,
                    "employmentTypes": emp_types
                }
            })

            # Optionally fetch actual KV text sections from kollektivvertrag.at
            if fetch_sections and url and (limit is None or fetched_count < limit):
                try:
                    html = fetch_html(url)
                    parser = KVSectionParser()
                    parser.feed(html)
                    parser._flush()
                    chunks = chunk_sections(parser.sections)
                    for idx, ch in enumerate(chunks[:18]):
                        raw_docs.append({
                            "sourceType": "kv_fulltext",
                            "lang": "de",
                            "title": title,
                            "section": ch["heading"],
                            "text": ch["text"],
                            "url": url,
                            "meta": {
                                "groupId": ag.get("groupId"),
                                "chunkIndex": idx
                            }
                        })
                    fetched_count += 1
                    total_to_fetch = len(ordered) if limit is None else limit
                    print(f"[{fetched_count}/{total_to_fetch}] Indexed {len(chunks[:18])} sections from: {title}")
                    if delay > 0:
                        time.sleep(delay)
                except (HTTPError, URLError, TimeoutError) as exc:
                    print(f"[WARN] Could not fetch {url}: {exc}")

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

    # 3. Multilingual worker rights guide cards (content/<lang>.json)
    for lang_file in sorted(CONTENT_DIR.glob("*.json")):
        if lang_file.stem not in {"tr", "de", "en", "hr", "sr", "bs", "ro", "hu", "sl"}:
            continue
        lang = lang_file.stem
        doc = json.loads(lang_file.read_text(encoding="utf-8"))
        for card in doc.get("cards", []):
            card_text = " ".join([
                card.get("title", ""),
                card.get("teaser", ""),
                card.get("intro", ""),
                *card.get("bullets", [])
            ])
            first_link = (card.get("links") or [{}])[0].get("url", f"index.html#{card.get('id')}")
            raw_docs.append({
                "sourceType": "guide_card",
                "lang": lang,
                "title": card.get("title", ""),
                "section": card.get("teaser", ""),
                "text": card_text,
                "url": first_link,
                "meta": {"cardId": card.get("id")}
            })

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


def compute_bm25_and_vectors(
    raw_docs: list[dict[str, Any]],
    with_embeddings: bool = False,
    model_name: str = "paraphrase-multilingual-MiniLM-L12-v2"
) -> dict[str, Any]:
    """
    Computes BM25 / TF-IDF sparse representations + concept tags for all chunks,
    and optionally adds dense multilingual sentence-transformer embeddings.
    """
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

    dense_vectors: list[list[float]] | None = None
    if with_embeddings:
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
            print(f"Encoding {len(raw_docs)} chunks with {model_name}...")
            st_model = SentenceTransformer(model_name)
            texts = [f"{d['title']} | {d['section']} | {d['text']}" for d in raw_docs]
            emb = st_model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
            dense_vectors = [[round(float(x), 5) for x in row] for row in emb]
        except ImportError:
            print("[WARN] sentence-transformers not installed. Falling back to sparse BM25 + concept vectors.")
            print("       Install via: pip install sentence-transformers")

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
        norm_blob = normalize_text(f"{d['title']} {d['section']} {d['text']}")
        concepts = detect_concepts(norm_blob)

        chunk_id = hashlib.sha1(
            f"{d['sourceType']}:{d['lang']}:{d['title']}:{d['section']}:{idx}".encode("utf-8")
        ).hexdigest()[:14]

        chunk_obj = RAGChunk(
            id=chunk_id,
            sourceType=d["sourceType"],
            lang=d["lang"],
            title=d["title"],
            section=d["section"],
            text=d["text"],
            url=d["url"],
            meta=d["meta"],
            concepts=concepts,
            tf=top_terms,
            embedding=dense_vectors[idx] if dense_vectors else None
        )
        chunks.append(asdict(chunk_obj))

    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "totalChunks": len(chunks),
            "vocabSize": len(idf),
            "hasDenseEmbeddings": dense_vectors is not None,
            "embeddingModel": model_name if dense_vectors is not None else None
        },
        "concepts": DOMAIN_CONCEPTS,
        "idf": idf,
        "chunks": chunks
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build client-side RAG search index from KV catalog & guides.")
    parser.add_argument(
        "--fetch-sections",
        action="store_true",
        help="Fetch live HTML sections from kollektivvertrag.at URLs listed in collective-agreements.json"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max number of KV pages to crawl when --fetch-sections is enabled (default: 40)"
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.35,
        help="Polite delay in seconds between HTTP requests (default: 0.35)"
    )
    parser.add_argument(
        "--with-embeddings",
        action="store_true",
        help="Also compute dense multilingual embeddings using sentence-transformers"
    )
    parser.add_argument(
        "--model",
        default="paraphrase-multilingual-MiniLM-L12-v2",
        help="SentenceTransformer model name when --with-embeddings is used"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_INDEX_PATH,
        help=f"Output JSON index path (default: {OUTPUT_INDEX_PATH})"
    )
    args = parser.parse_args()

    raw_docs = build_raw_chunks(
        fetch_sections=args.fetch_sections,
        limit=args.limit,
        delay=args.delay
    )
    index_payload = compute_bm25_and_vectors(
        raw_docs,
        with_embeddings=args.with_embeddings,
        model_name=args.model
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(index_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = args.output.stat().st_size / 1024
    print(f"Wrote {args.output} ({index_payload['stats']['totalChunks']} chunks, {size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
