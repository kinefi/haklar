# Changelog

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenmektedir.
Format [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) standardını temel alır.

## [1.7.0] - 2026-11-28

### Fixed
- **Yayın bir hafta geride kalıyordu:** yayın işi, veri güncellemesinden önceki commit'i yayınlıyordu (bot commit'i `[skip ci]` taşıdığı için yeni veri ancak bir sonraki çalışmada çıkıyordu). Güncelleme, test ve yayın artık tek işte.
- KV betiği tek bir sayfa okunamadığında tüm yayını durduruyordu; artık önceki kayıtları korur, yalnızca çok sayıda hatada başarısız olur.
- Yanlış eşleşmeler: "Leiharbeit" → evden çalışma, "Mobbing" → iş kazası, "Pflegefreistellung" → bakım sektörü, "asgari ücret" → yıllık izin/hastalık, "yarı zamanlı" → emeklilik, "Urlaubsgeld" → yıllık izin vb. Nedenleri: çok sözcüklü terimlerde ön ek eşleşmesi ve en uzun eşleşme kuralının olmaması.
- `node --test tests/` Node 22'de dosya bulamıyordu → `node --test tests/*.test.mjs`.

### Changed
- **Sözlük 30 → 62 kavram, ~3.300 terim.** Geniş kavramlar bölündü (fazla mesai, gece/vardiya, pazar/tatil çalışması, mola, yarı zamanlı, nöbet; ücret ↔ ücret grubu/kademe; yıllık izin ↔ resmi tatil ↔ ücretli mazeret izni ↔ yakın bakımı izni). Yeni: taşeron/kiralık işçilik, mini iş, sigortasız/kayıt dışı çalışma, sahte serbest çalışma, all-in sözleşme, bahşiş, rekabet yasağı/eğitim masrafı, çalışma belgesi, oturum/çalışma izni, mobbing/taciz, hak düşürücü süreler, çıraklık, yemek/konaklama, akord, toplu sözleşme zammı/grev, kısa çalışma/kötü hava, disiplin/sorumluluk, iş mahkemesi, sabbatical, sözleşme kapsamı; sektörler: tarım/ormancılık, güvenlik.
- **KV konu başlıkları kavramlara bağlandı** (`content/topic-concepts.json`, %99,8 kapsam). Başlıkların çevirisi kavram adlarından gelir: Türkçede 380 çevrilmemiş başlık → 6. Eski kısmi çeviri haritası (`catalog-ui.json → topics`) kaldırıldı.
- **"RAG" adı bırakıldı:** `rag-index.json` → `search-index.json`, `build-rag-index.py` → `build-search-index.py`, `rag-retriever.js` → `search-retriever.js`, `window.haklarRAG` → `window.haklarSearch`. Arama yanıt üretmez, yalnızca kaynak bulur.
- Arama indeksi 247 KB → 55 KB (aramada zaten kullanılmayan rehber kartları çıkarıldı); kullanılmayan embedding kodu ve içe aktarmalar silindi.
- Katalog araması yazarken 120 ms bekler; kavram eşleşmeleri önbelleğe alınır.

### Added
- **Önemli rakamlar (pilot: Hotel- und Gastgewerbe, Handelsangestellte, Bau Arbeiter):** en düşük ve örnek asgari ücret, son zam, haftalık süre, 13./14. maaş, fazla mesai zammı, hak düşürücü süre, ihbar süresi, ücretli mazeret izni. Rakamlar 9 dilde biçimlenir; ayrıntı Almanca/İngilizce, her biri kaynak bağlantılı. Gönüllü kontrolü yapılana kadar "henüz kontrol edilmedi" notu gösterilir.
- **Hak düşürücü süre uyarısı:** konularında "Verfall" geçen sözleşmelerde 9 dilde kısa uyarı.
- **Konuya özel bağlantılar:** kaynak konu kimliği verirse (`topicIds`) her konu sözleşmenin ilgili bölümüne bağlanır.
- Sihirbaza tarım/ormancılık ve güvenlik sektörleri.
- Altın sorgu seti (`tests/golden-queries.json`, ~190 sorgu, `expect`/`forbid`), sözlük ve konu haritası testleri, önemli rakamlar testleri (29 test).
- Gönüllü gözden geçirme dosyalarında kavramların ekrandaki adları.

### Notes
- `topicIds` alan adı (`id`) kaynakta doğrulanmadı; ilk CI çalışmasından sonra `collective-agreements.json` içinde `topicIds` görünüyorsa ve bir bağlantı doğru bölümü açıyorsa özellik etkindir.
- Önemli rakamlar 28.11.2026'da WKO ve GPA kaynaklarından derlendi; Handel 2027 zammı henüz belirlenmemişti (müzakereler sürüyor).

## [1.6.0] - 2026-11-23

### Added
- **"Hangi sözleşme benim için geçerli?" sihirbazı** (Toplu sözleşmeler sayfası): sektör, işçi/memur-hizmetli (Arbeiter/Angestellte) ve eyalet seçimine göre liste süzülür ve sıralanır; her kayıtta neden eşleştiği yazılır. Seçimler URL'e yazılır (`?sector=&type=&region=&q=`), paylaşılabilir.
- **Ana sayfa aramasından KV'ye geçiş:** arama sonuçlarında bulunan sözleşmeler için konu başlıkları (★ ile işaretli eşleşen konu) ve katalog sayfasına bağlantı.
- **Sözlük 22 → 30 kavram:** evden çalışma, zamlar/ödenekler, işsizlik, emeklilik, ayrımcılık/eşit muamele, ödenmeyen maaş/zamanaşımı/iflas, eğitim, zanaat sektörü; günlük Türkçe ifadeler; sektör terimleri genişletildi (temizlik, metal/elektro, taşıma/otobüs, hastane/bakım).
- Testler: sektör kapsamı ve yeni kavramlar (14 test).

### Notes
- Konuya özel (derin) bağlantı eklenmedi: kollektivvertrag.at `topic-id` eşlemesi doğrulanamadı. Yerine eşleşen konu ★ ile vurgulanır.
- Sözleşme metinleri hâlâ alınmıyor (ÖGB telif şartı); yalnızca katalog üst verisi kullanılır.
- Veriler (`collective-agreements.json`, `income-tax-current.json`) 22.11.2026 CI çıktısıyla güncel.

## [1.5.0] - 2026-11-22

### Added
- **Kavram sözlüğü (`content/concepts.json`):** 22 kavram, 9 dilde terimler ("annelik" → Mutterschutz, Wochengeld, Karenz). Arama kutusunun altında tıklanabilir Almanca karşılık ipuçları gösterilir.
- Sayfa altına "gönüllü çalışma / yasal sorumluluk yok" uyarısı (`content/shared-ui.json`, 9 dil).
- Node ile çalışan arama testleri (`tests/search.test.mjs`).

- **Sık arananlar:** arama kutusu boşken tıklanabilir öneriler (9 dilde, `shared-ui.json`).
- **Kartlarda "son kontrol" tarihi** (`content/card-meta.json`, `scripts/mark-reviewed.py`); 12 aydan eskiyse uyarı. Vergi kartı tarihi veriden alır.
- **Terim gözden geçirme dosyaları** (`scripts/export-terminology.py` → `docs/terminology-review/`) ve sözlük/öneri/kart-meta doğrulama testleri.

### Changed
- **Arama indeksi 1,2 MB → 240 KB:** toplu sözleşmeler artık `rag-index.json`'a kopyalanmıyor, doğrudan `collective-agreements.json` aranıyor; dosyalar arama kutusuna odaklanınca önceden yükleniyor. İndeks betiği sadeleştirildi (kullanılmayan tam metin tarayıcısı çıkarıldı). CI'a test adımı eklendi.
- **Arama dil filtresi:** `lang` seçeneği daha önce yok sayılıyordu ve her dilin kayıtları dönüyordu; artık yalnızca seçili dil (ve kaynağı Almanca olan KV kayıtları, "DE" rozetiyle) döner. Aynı sözleşme tek kez listelenir, arama 150 ms gecikmeli ve eski isteklere karşı korumalıdır.
- Eşleştirme sıkılaştırıldı: kısa terimler ("it", "13", "ber") artık her yerde eşleşmez.
- Yeniden düzenleme: `common.js` (diller, normalize, JSON önbelleği, dil düğmeleri), `tax-section.js`; `helpLinks` artık `{label, url}` nesneleridir; RAG indeksi sözlüğü `concepts.json`'dan okur.

### Fixed
- Vergi tablosunda başlıklar ve iki bağlantı "undefined" görünüyordu (var olmayan çeviri anahtarları).
- KV konu etiketlerinde "Urlaubsgeld ve Weihnachtsgeld" yanlışlıkla "Yıllık izin" olarak çevriliyordu; Kündigung/Karenz/Abfertigung gibi etiketler eklendi.
- `kv_fulltext` kayıtlarının tamamı aynı yer tutucu metindi (585 kopya); `--fetch-sections` ve tarayıcı kodu kaldırıldı.
- KV sonuç kartlarının stili yoktu.

### Removed
- GLB (Gewerkschaftlicher Linksblock) tüm içeriklerden, altbilgiden ve README'den kaldırıldı.
- Kullanılmayan `assets/pay.js`, `assets/tax-widget.js`, `assets/language.js`.

## [1.4.0] - 2026-11-17

### Added (Eklenenler)
- **Çok Dilli Semantik ve Kavramsal Arama (`assets/semantic.js`):**
  - Harici sunucu veya derleme adımı gerektirmeden tarayıcıda çalışan kavramsal genişletme (*concept expansion*) ve Levenshtein yazım hatası toleranslı arama motoru eklendi.
  - Türkçe, Almanca, İngilizce, Hırvatça, Sırpça, Boşnakça, Romence, Macarca ve Slovence dilleri arasında çapraz terim eşleştirmesi sağlandı (ör. *"kovulma"* → *"Kündigung"*, *"ikramiye"* → *"Sonderzahlungen"*, *"vergi dilimi"* → *"Vergi ve maaş pusulası"*).
- **Ana Sayfa Konu Arama Çubuğu (`index.html`, `assets/app.js`, `assets/styles.css`):**
  - İşçi hakları rehberine anlık kart filtreleme, eşleşme sayacı ve 1–2 sonuç kaldığında kartları otomatik açma özelliği eklendi.
- **Yeni Hak Kartları (9 Dilin Tamamında):**
  - **Bonus, 13. ve 14. Maaş (`sonderzahlungen`):** *Urlaubsgeld* ve *Weihnachtsgeld* hakları, kıstelyevm (*Aliquotierung*) ve *Jahressechstel* vergi avantajı bilgileri eklendi.
  - **Kıdem Tazminatı ve Vorsorgekasse (`vorsorge`):** *Abfertigung Neu* kapsamında işverenin ödediği %1,53 katkı payı, kendi isteğiyle ayrılmada birikimin korunması ve 36 ay çekim şartları eklendi.
  - **İşten Çıkarılma ve Fesih (`termination`):** *Kündigung*, *Entlassung*, anlaşmalı fesih (*einvernehmliche Lösung*) uyarıları, kısa itiraz süreleri ve AMS bildirimi adımları eklendi.
- **Kart İkonları (`content/card-icons.json`):** `sonderzahlungen` (🎁), `vorsorge` (🏦) ve `termination` (🚪) kartları için ortak simgeler eklendi.

### Changed (Değiştirilenler)
- **Vergi Dilimleri Ana Sayfaya Taşındı (`index.html`, `assets/app.js`, `assets/styles.css`):**
  - Ayrı *Maaş ve Vergi* sayfası (`lohn-steuer.html`, `assets/pay.js`) kaldırılarak navigasyon iki ana bölüme (*İş Haklarım* ve *Toplu sözleşmeler*) sadeleştirildi.
  - 2026 gelir vergisi dilimleri tablosu (`content/income-tax-2026.json`, `content/pay-ui.json`) ile BMF Brüt-Net / AK vergi hesaplayıcı bağlantıları doğrudan ana sayfadaki **Vergi ve maaş pusulası (`tax`)** kartının içine gömüldü.
- **Toplu Sözleşme Kataloğu Araması (`collective-agreements.html`, `assets/catalog.js`):** Mevcut alt dize (*substring*) araması semantik puanlama ve sıralama motoruyla güçlendirildi.

### Removed (Kaldırılanlar)
- `lohn-steuer.html` ve `assets/pay.js` dosyaları (içerikleri ana sayfadaki `tax` kartına birleştirildiği için) kaldırıldı.

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
