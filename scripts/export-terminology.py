#!/usr/bin/env python3
"""Gönüllü gözden geçirme için kavram sözlüğünü dil başına bir Markdown dosyasına döker.

Çıktı: docs/terminology-review/<dil>.md  (tr, sh=hr/sr/bs, ro, hu, sl, en, de)
Her dosyada o dilin terimleri, Almanca karşılıkları ve o dile ait arayüz metinleri
(content/shared-ui.json) bulunur. Gözden geçiren, hatalı/eksik terimleri işaretleyip
issue veya pull request olarak geri gönderir; düzeltmeler content/concepts.json'a yazılır.

Kullanım:  python3 scripts/export-terminology.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT = ROOT / "docs" / "terminology-review"

LANGUAGE_FILES = {
    "tr": ("Türkçe", ["tr"]),
    "sh": ("Hırvatça / Sırpça / Boşnakça", ["hr", "sr", "bs"]),
    "ro": ("Română", ["ro"]),
    "hu": ("Magyar", ["hu"]),
    "sl": ("Slovenščina", ["sl"]),
    "en": ("English", ["en"]),
    "de": ("Deutsch", ["de"]),
}
UI_KEYS = ["volunteerNote", "ragTitle", "viewSource", "conceptHint", "suggestionsLabel", "lastChecked", "staleNote"]


def main() -> None:
    concepts = json.loads((CONTENT / "concepts.json").read_text(encoding="utf-8"))["concepts"]
    shared = json.loads((CONTENT / "shared-ui.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)

    for key, (title, ui_langs) in LANGUAGE_FILES.items():
        lines = [
            f"# Terim gözden geçirme: {title}",
            "",
            "Teşekkürler! Lütfen aşağıdaki terimlerin **günlük konuşmada işçilerin gerçekten kullandığı** sözcükler olup olmadığına bakın.",
            "",
            "- Yanlış çeviri veya yanlış anlama yaratabilecek terimleri işaretleyin.",
            "- Eksik gündelik kelimeleri, argo/halk ağzı söyleyişleri ve yaygın yazım hatalarını ekleyin (aksan olmadan yazılanlar dahil).",
            "- Çok genel kelimeler (ör. \"çocuk\", \"hasta\") tek başına her yerde eşleşir; gerekirse daha özgül ifade önerin.",
            "- Geri bildirim: issue açın veya `content/concepts.json` içinde ilgili dil listesini düzenleyen bir pull request gönderin.",
            "",
            "## Kavramlar",
            "",
        ]
        for concept_id, definition in concepts.items():
            terms = definition["terms"].get(key, [])
            german = ", ".join(definition.get("display", []))
            lines.append(f"### `{concept_id}` · Almanca: {german}")
            lines.append("")
            lines.extend(f"- [ ] {term}" for term in terms) if terms else lines.append("- _(terim yok)_")
            related = ", ".join(f"`{r}`" for r in definition.get("related", []))
            if related:
                lines.append("")
                lines.append(f"İlişkili kavramlar: {related}")
            lines.append("")

        lines += ["## Arayüz metinleri (içerik çevirisi kontrolü)", ""]
        for ui_lang in ui_langs:
            lines.append(f"### {ui_lang}")
            lines.append("")
            for ui_key in UI_KEYS:
                value = shared[ui_lang].get(ui_key)
                lines.append(f"- **{ui_key}:** {value}")
            lines.append(f"- **suggestions:** {', '.join(shared[ui_lang]['suggestions'])}")
            lines.append("")
        (OUT / f"{key}.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
        print(f"Yazıldı: docs/terminology-review/{key}.md")


if __name__ == "__main__":
    main()
