#!/usr/bin/env python3
"""Kartların "son kontrol" tarihini işaretler (content/card-meta.json).

Kullanım:
  python3 scripts/mark-reviewed.py family care          # belirtilen kartlar, bugünün tarihi
  python3 scripts/mark-reviewed.py --all                # tüm kartlar
  python3 scripts/mark-reviewed.py family --date 2026-11-22

Yalnızca kart içeriğini gerçekten kaynaktan kontrol ettikten sonra çalıştırın.
"""
import argparse
import json
from datetime import date
from pathlib import Path

CONTENT = Path(__file__).resolve().parent.parent / "content"
META_PATH = CONTENT / "card-meta.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("cards", nargs="*", help="kart kimlikleri (content/tr.json -> cards[].id)")
    parser.add_argument("--all", action="store_true", help="tüm kartları işaretle")
    parser.add_argument("--date", default=date.today().isoformat(), help="YYYY-AA-GG (varsayılan: bugün)")
    args = parser.parse_args()

    date.fromisoformat(args.date)  # biçimi doğrula
    known = [c["id"] for c in json.loads((CONTENT / "tr.json").read_text(encoding="utf-8"))["cards"]]
    targets = known if args.all else args.cards
    unknown = [c for c in targets if c not in known]
    if unknown or not targets:
        raise SystemExit(f"Kart seçin; bilinenler: {', '.join(known)}" + (f"\nBilinmeyen: {', '.join(unknown)}" if unknown else ""))

    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    for card_id in targets:
        meta["reviewed"][card_id] = args.date
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(targets)} kart {args.date} olarak işaretlendi.")


if __name__ == "__main__":
    main()
