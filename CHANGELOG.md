# Changelog

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenmektedir.
Format [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) standardını temel alır.

## [1.4.0] - 2026-11-17

### Added (Eklenenler)
- **Çok Dilli Semantik ve Kavramsal Arama (`assets/semantic.js`):**
  - Harici sunucu veya derleme adımı gerektirmeden tarayıcıda çalışan kavramsal genişletme (*concept expansion*) ve Levenshtein yazım hatası toleranslı arama motoru eklendi.
  - Türkçe, Almanca, İngilizce, Hırvatça, Sırpça, Boşnakça, Romence, Macarca ve Slovence dilleri arasında çapraz terim eşleştirmesi sağlandı (ör. *"kovulma"* → *"Kündigung"*, *"ikramiye"* → *"Sonderzahlungen"*, *"garson"* → *"Hotel- und Gastgewerbe"*).
- **Ana Sayfa Konu Arama Çubuğu (`index.html`, `assets/app.js`, `assets/styles.css`):**
  - İşçi hakları rehberine anlık kart filtreleme, eşleşme sayacı ve 1–2 sonuç kaldığında kartları otomatik açma özelliği eklendi.
- **Yeni Hak Kartları (9 Dilin Tamamında):**
  - **Bonus, 13. ve 14. Maaş (`sonderzahlungen`):** *Urlaubsgeld* ve *Weihnachtsgeld* hakları, kıstelyevm (*Aliquotierung*) ve *Jahressechstel* vergi avantajı bilgileri eklendi.
  - **Kıdem Tazminatı ve Vorsorgekasse (`vorsorge`):** *Abfertigung Neu* kapsamında işverenin ödediği %1,53 katkı payı, kendi isteğiyle ayrılmada birikimin korunması ve 36 ay çekim şartları eklendi.
  - **İşten Çıkarılma ve Fesih (`termination`):** *Kündigung*, *Entlassung*, anlaşmalı fesih (*einvernehmliche Lösung*) uyarıları, kısa itiraz süreleri ve AMS bildirimi adımları eklendi.
- **Kart İkonları (`content/card-icons.json`):** `sonderzahlungen` (🎁), `vorsorge` (🏦) ve `termination` (🚪) kartları için ortak simgeler eklendi.

### Changed (Değiştirilenler)
- **Toplu Sözleşme Kataloğu Araması (`collective-agreements.html`, `assets/catalog.js`):** Mevcut alt dize (*substring*) araması semantik puanlama ve sıralama motoruyla güçlendirildi; çevrilmiş konu etiketleri ve sektör eş anlamlıları arama kapsamına dahil edildi.

---

## [1.3.0] - 2026-11-13

### Added (Eklenenler)
- **Şirket / KV Örnekleri (`content/employer-kv.json`, `collective-agreements.html`, `assets/catalog.js`):**
  - Büyük şirketlerin (ams OSRAM, AVL, MAGNA Powertrain, ANDRITZ AG) ilgili toplu sözleşme başlıkları altında kaynak bağlantılı örnekleri ve kapsam notları eklendi (`Add company examples`).
  - Toplu sözleşmeler sayfasına bölüm kısayolları (*Sık arananlar*, *KV ara*) eklendi.

---

## [1.2.0] - 2026-11-13

### Added (Eklenenler)
- **Ek Dil Desteği (`content/ro.json`, `content/hu.json`, `content/sl.json`, `assets/app.js`, `assets/catalog.js`, `assets/pay.js`):**
  - Mevcut dillere ek olarak Romence (`RO`), Macarca (`HU`) ve Slovence (`SL`) dil dosyaları ve arayüz çevirileri eklenerek toplam dil desteği 9'a çıkarıldı (`Add additional languages` · `05ff236`).

---

## [1.1.0] - 2026-11-13

### Added (Eklenenler)
- **Maaş ve Vergi Sayfası (`lohn-steuer.html`, `assets/pay.js`, `content/pay-ui.json`, `content/income-tax-2026.json`):**
  - RIS Einkommensteuergesetz §33 tabanlı 2026 gelir vergisi dilimleri tablosu, KV ücret baremi yönergeleri ve BMF/AK hesaplayıcı bağlantıları eklendi (`Add tax and salary page` · `2be206a`).

---

## [1.0.0] - 2026-11-13

### Added (Eklenenler)
- **Çok Dilli İşçi Hakları Rehberi ve KV Kataloğu (`index.html`, `collective-agreements.html`, `assets/app.js`, `assets/catalog.js`, `assets/language.js`, `assets/styles.css`, `scripts/update-kv-catalog.py`):**
  - Türkçe, Hırvatça, Sırpça, Boşnakça, Almanca ve İngilizce dillerinde temel çalışma hakları kartları ve ortak kart ikonları (`content/card-icons.json`) oluşturuldu (`Add multilingual workers right guide and KV catalog` · `8a06991`).
  - `kollektivvertrag.at` A–Z dizininden toplu sözleşme varyantlarını çeken Python güncelleme betiği ve aranabilir katalog sayfası eklendi.
  - Proje deposu, Apache 2.0 lisansı ve temel yapı başlatıldı (`Initial commit` · `e81168a`).
