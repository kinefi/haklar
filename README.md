[![GitHub Pages](https://img.shields.io/badge/Live_Demo-GitHub_Pages-2ea44f?style=for-the-badge&logo=github)](https://kinefi.github.io/haklar)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge)](LICENSE)

# Avusturya İşçi Hakları Rehberi

Avusturya'da çalışanlar için sade ve çok dilli bir hak rehberi. Türkçe, Hırvatça, Sırpça (Latin alfabesi), Boşnakça, Romence, Macarca, Slovence, Almanca ve İngilizce içerir. İlk dil tarayıcı ayarına göre seçilir; kullanıcı tercihi sonraki sayfalarda korunur. Konu kartlarını açarak kısa özetleri ve ilgili kaynakları görebilirsiniz.

## Özellikler

- Mobil uyumlu, büyük ve anlaşılır konu kartları
- A–Z grup kayıtlarını mevcut sözleşme varyantlarına genişleten ayrı, aranabilir toplu sözleşme sayfası
- Büyük şirketlerin ilgili KV başlıkları altında kaynak bağlantılı örnekleri
- Toplu sözleşmelerde "Hangi sözleşme benim için geçerli?" sihirbazı (sektör, işçi türü, eyalet); 
- Toplu sözleşmelerde bölüm kısayolları; tam liste yalnızca arama yapılınca gösterilir
- Maaş/vergi sayfası: KV ücret baremini bulma yönergesi ve RIS §33'e dayalı 2026 gelir vergisi dilimleri
- Toplu sözleşme verisini kollektivvertrag.at A–Z dizininden yenileyen betik
- Çalışma saatleri, fazla mesai, izin, hastalık ve iş kıyafeti gibi konularda kısa bilgiler
- Arbeiterkammer (AK), ÖGB ve resmi Avusturya mevzuat sistemi RIS bağlantıları
- Dil içeriklerinin ve ortak kart simgelerinin `content/` altındaki JSON dosyalarında saklanması
- Diller arası kavram sözlüğü (62 kavram): "annelik" aratınca Mutterschutz, Wochengeld ve Karenz bulunur; Almanca karşılıklar arama kutusunun altında ipucu olarak gösterilir
- KV konu başlıkları kavramlara bağlanır ve 9 dilde gösterilir (Almanca asıl başlık ipucu olarak); hak düşürücü süresi olan sözleşmelerde uyarı
- Seçili sözleşmelerde kaynaklı "önemli rakamlar" (asgari ücret, son zam, fazla mesai zammı, hak düşürücü süre, ücretli mazeret izni…)
- Arama yalnızca seçili dildeki kayıtları döndürür (toplu sözleşmeler kaynağı gereği Almanca olduğundan her dilde görünür)
- Harici JavaScript paketi, derleme adımı veya kullanıcı verisi toplanması olmadan çalışma

## İçeriği düzenleme

Bir dildeki metni değiştirmek için `content/tr.json`, `content/hr.json`, `content/sr.json`, `content/bs.json`, `content/de.json` veya `content/en.json` dosyasını düzenleyin. Kartların başlıkları, açıklamaları, kaynak bağlantıları ve destek kuruluşlarının adları bu dosyalarda bulunur.
Maaş/vergi sayfasının çevirileri `content/pay-ui.json`, yıllık vergi dilimleri `content/income-tax-current.json` içindedir. Vergi oranları yıl ve yürürlük tarihine göre kontrol edilmelidir.
Şirket/KV örnekleri ve kaynak bağlantıları `content/employer-kv.json` dosyasındadır. Şirket adı KV'yi tek başına belirlemez; özel kapsam ve tarih notlarını okuyun.

## Kavram sözlüğü ve arama

Diller arası eşleştirme tek bir dosyadadır: `content/concepts.json`. Her kavramın (ör. `maternity`):

- `terms`: aramada eşleşen ifadeler, dil başına (`sh` = Hırvatça, Sırpça ve Boşnakça ortak),
- `labels`: 9 arayüz dilindeki kısa adı (KV konu başlıklarının çevirisi buradan üretilir),
- `display`: Almanca resmi karşılıklar (arama ipucu), `related`: ilişkili kavramlar.

Yeni bir terim eklemek için ilgili dilin listesine yazmanız yeterlidir. Eşleşme kuralları: 5+ harfli terimler sözcük başında eşleşir (Türkçe ekler, Almanca bileşik sözcükler), kısa terimler tam sözcük olarak; **en uzun eşleşme kazanır** ("Pflegefreistellung" bakım sektörünü, "godišnji odmor" molayı tetiklemez). Tarayıcı (`assets/semantic.js`) ve betikler aynı dosyayı okur.

**KV konu başlıkları:** `scripts/build-topic-map.mjs` katalogdaki ~1.500 konu başlığını kavramlara bağlar ve `content/topic-concepts.json` yazar (eşlenemeyenleri listeler). Otomatik eşleme yanlışsa `content/topic-overrides.json` içine elle düzeltme yazın.

**Önemli rakamlar:** `content/kv-facts.json` (rakamlar + kaynak URL'si) ve `content/kv-facts-ui.json` (9 dilde metinler). Sözleşme metni kopyalanmaz; yalnızca rakamlar ve kendi cümlelerimiz. Bir gönüllü kaynağı kontrol edince ilgili kayıtta `"reviewed": true` yapın; o zamana kadar sayfada "henüz kontrol edilmedi" notu görünür.

Sözlüğü veya içeriği değiştirdikten sonra:

```bash
node scripts/build-topic-map.mjs          # KV konu haritası
python3 scripts/build-search-index.py     # şirket notları + vergi indeksi
node --test tests/*.test.mjs              # altın sorgular dahil tüm testler
```

`tests/golden-queries.json` gerçek kullanıcı sorgularından oluşan bir settir: her sorgu için bulunması gereken (`expect`) ve bulunmaması gereken (`forbid`) kavramlar yazılır. Sözlükte yapılan her değişiklik bu sete karşı denenir; gönüllülerden gelen "şunu aradım, bulamadım" bildirimleri buraya yeni satır olarak eklenir.

İki sayfada ortak metinler (gönüllü uyarısı, arama başlıkları, "sık arananlar" önerileri) `content/shared-ui.json` içindedir. Toplu sözleşmeler `search-index.json` içinde değil, doğrudan `content/collective-agreements.json` üzerinden aranır; rehber kartları da ayrıca puanlandığından indeks küçüktür (~55 KB). Arama yapay zekâ yanıtı üretmez; yalnızca ilgili kaynakları bulur.

### Terimleri gönüllülerle gözden geçirme

`python3 scripts/export-terminology.py` her dil için `docs/terminology-review/<dil>.md` dosyası üretir (Hırvatça, Sırpça ve Boşnakça tek dosyada). Dosyayı o dili konuşan bir gönüllüye verin; düzeltmeler `content/concepts.json`'a işlenir ve testler çalıştırılır.

### Kartların son kontrol tarihi

Kartın altında "Son kontrol: tarih" satırı gösterilir (12 aydan eskiyse uyarı rengiyle). Vergi kartı tarihi vergi verisinden otomatik alır. Diğer kartlar için içeriği kaynaktan kontrol ettikten sonra şunu çalıştırın:

```bash
python3 scripts/mark-reviewed.py family care     # belirli kartlar
python3 scripts/mark-reviewed.py --all           # hepsi
```

## Toplu sözleşme kataloğunu yenileme

`scripts/update-kv-catalog.py`, resmi Kollektivvertrag.at A–Z dizinini ve sözleşme sayfalarındaki konu başlıklarını alarak `content/collective-agreements.json` dosyasını yeniler. Python standart kütüphanesini kullanır:

```bash
python3 scripts/update-kv-catalog.py
```

Güncelleme kaynağı kodda ve oluşturulan JSON dosyasında belirtilir. A–Z dizininde kalmış ancak artık kaynakta bulunmayan gruplar `unavailableListings` içinde kaydedilir ve sayfada uyarı gösterilir. Okunamayan sayfalar `failures` alanında tutulur; o sözleşmelerin önceki kayıtları korunur ve sayfada uyarı gösterilir. Hata sayısı 10'u veya listenin %5'ini aşarsa betik başarısız olur (kaynak sayfa yapısı değişmiş olabilir).

Kaynak, konu başlıklarıyla birlikte konu kimliği veriyorsa betik bunları `topicIds` olarak kaydeder; sayfada her konu sözleşmenin ilgili bölümüne (`topic-id`) bağlanır. Kimlik yoksa konular sözleşmenin başına bağlanır.

GitHub Actions (`.github/workflows/update-and-deploy.yaml`) her pazartesi ve her `main` gönderiminde verileri yeniler, testleri çalıştırır ve **aynı işte** yeni verilerle yayınlar.

## Önizleme

JSON içeriklerini yerel sunucudan yüklemek için proje klasöründe şu komutu çalıştırın:

```bash
python3 -m http.server 8000
```

Tarayıcıda <http://localhost:8000> adresini açın. Sunucuyu durdurmak için terminalde `Ctrl+C` tuşlarına basın.

## Yayınlama

Site [GitHub Pages](https://kinefi.github.io/haklar) üzerinden yayınlanır. Depoda **Settings → Pages** bölümünde `main` dalını ve `/ (root)` klasörünü seçin. Ana rehber `index.html`, toplu sözleşme kataloğu `collective-agreements.html` sayfasındadır; maaş/vergi bilgisi ana rehberdeki "Vergi" kartının içindedir.

## Bilgilendirme

Bu uygulama tamamen gönüllü olarak, çeşitli kaynaklardan derlenen bilgilerle hazırlanmıştır ve yasal sorumluluk üstlenmez. Bu sayfa genel bilgi verir; hukuki danışmanlık değildir. Katalogdaki başlıklar ve konu etiketleri, her sözleşmenin tüm haklarını özetlemez. Güncel ücretler ve özel koşullar için sözleşmenin tam metnini açın. Sözleşmeler ve kurallar değişebilir; güncel durum için işyeri temsilcinize, sendikanıza veya ilgili kaynağa danışın. RIS resmi mevzuatı yayımlar; mevzuatın Almanca olduğunu ve RIS'in hukuki danışmanlık vermediğini unutmayın.

## Açık kaynak

Bu proje Apache License 2.0 altında lisanslanmıştır.
