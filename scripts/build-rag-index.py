#!/usr/bin/env python3
"""
Build the small static search index (guide cards, company notes, tax text) used by the
browser. Collective agreements are NOT indexed here: the browser searches
content/collective-agreements.json directly. Concept tags come from content/concepts.json.

Usage:
  python3 scripts/build-rag-index.py
  python3 scripts/build-rag-index.py --with-embeddings --model paraphrase-multilingual-MiniLM-L12-v2
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


def load_concepts(path: Path = CONCEPTS_PATH) -> dict[str, set[str]]:
    """concepts.json -> {concept_id: {normalized terms}} (single source of truth shared with the browser)."""
    data = json.loads(path.read_text(encoding="utf-8"))
    concepts: dict[str, set[str]] = {}
    for concept_id, definition in data["concepts"].items():
        terms: set[str] = set()
        for term_list in definition.get("terms", {}).values():
            for raw in term_list:
                terms |= term_variants(raw)
        concepts[concept_id] = terms
    return concepts


def tokenize(text: str) -> list[str]:
    norm = normalize_text(text)
    raw_tokens = re.findall(r"[a-z0-9]{2,}", norm)
    return [t for t in raw_tokens if t not in STOPWORDS]


@dataclass
class RAGChunk:
    id: str
    sourceType: str          # "company_kv" | "guide_card" | "tax_2026"
    lang: str                # "de" | "tr" | "hr" | ... | "multi"
    title: str
    section: str
    text: str
    url: str
    meta: dict[str, Any]
    concepts: list[str]
    tf: dict[str, float]     # Sparse BM25/TF-IDF term weights
    embedding: list[float] | None = None


def detect_concepts(text: str, concepts: dict[str, set[str]]) -> list[str]:
    padded = f" {words(text)} "
    return [cid for cid, terms in concepts.items() if any(contains_term(padded, t) for t in terms)]


def build_raw_chunks() -> list[dict[str, Any]]:
    raw_docs: list[dict[str, Any]] = []

    # Toplu sözleşmeler (collective-agreements.json) bu indekse girmez: tarayıcı doğrudan o dosyadan arar
    # (assets/rag-retriever.js -> rankAgreements). Böylece veri iki kez yüklenmez/saklanmaz.

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
    concepts: dict[str, set[str]],
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
        chunk_concepts = detect_concepts(f"{d['title']} {d['section']} {d['text']}", concepts)

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
            concepts=chunk_concepts,
            tf=top_terms,
            embedding=dense_vectors[idx] if dense_vectors else None
        )
        chunk_dict = asdict(chunk_obj)
        if chunk_dict["embedding"] is None:
            del chunk_dict["embedding"]  # keep the JSON small when no dense vectors were requested
        chunks.append(chunk_dict)

    return {
        "version": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "totalChunks": len(chunks),
            "vocabSize": len(idf),
            "hasDenseEmbeddings": dense_vectors is not None,
            "embeddingModel": model_name if dense_vectors is not None else None
        },
        "chunks": chunks
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build client-side RAG search index from KV catalog & guides.")
    # Eski workflow dosyaları bu seçeneği hâlâ geçebilir; artık hiçbir şey yapmaz.
    parser.add_argument("--fetch-sections", "--limit", "--delay", dest="deprecated", nargs="?", const=True,
                        help=argparse.SUPPRESS)
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
    if args.deprecated:
        print("[bilgi] --fetch-sections/--limit/--delay artık kullanılmıyor, yok sayıldı.")

    raw_docs = build_raw_chunks()
    index_payload = compute_bm25_and_vectors(
        raw_docs,
        load_concepts(),
        with_embeddings=args.with_embeddings,
        model_name=args.model
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(index_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = args.output.stat().st_size / 1024
    print(f"Wrote {args.output} ({index_payload['stats']['totalChunks']} chunks, {size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
