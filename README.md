[![GitHub Pages](https://img.shields.io/badge/Live_Demo-GitHub_Pages-2ea44f?style=for-the-badge&logo=github)](https://kinefi.github.io/haklar)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge)](LICENSE)

# Avusturya İşçi Hakları Rehberi

Avusturya'da çalışanlar için sade ve çok dilli bir hak rehberi. Türkçe, Hırvatça, Sırpça (Latin alfabesi), Boşnakça, Almanca ve İngilizce içerir. Konu kartlarını açarak kısa özetleri ve ilgili kaynakları görebilirsiniz.

## Özellikler

- Mobil uyumlu, büyük ve anlaşılır konu kartları
- A–Z grup kayıtlarını mevcut sözleşme varyantlarına genişleten ayrı, aranabilir toplu sözleşme sayfası
- Maaş/vergi sayfası: KV ücret baremini bulma yönergesi ve RIS §33'e dayalı 2026 gelir vergisi dilimleri
- Toplu sözleşme verisini kollektivvertrag.at A–Z dizininden yenileyen betik
- Çalışma saatleri, fazla mesai, izin, hastalık ve iş kıyafeti gibi konularda kısa bilgiler
- Arbeiterkammer (AK), ÖGB, GLB ve resmi Avusturya mevzuat sistemi RIS bağlantıları
- Dil içeriklerinin ve ortak kart simgelerinin `content/` altındaki JSON dosyalarında saklanması
- Harici JavaScript paketi, derleme adımı veya kullanıcı verisi toplanması olmadan çalışma

## İçeriği düzenleme

Bir dildeki metni değiştirmek için `content/tr.json`, `content/hr.json`, `content/sr.json`, `content/bs.json`, `content/de.json` veya `content/en.json` dosyasını düzenleyin. Kartların başlıkları, açıklamaları, kaynak bağlantıları ve destek kuruluşlarının adları bu dosyalarda bulunur.
Maaş/vergi sayfasının çevirileri `content/pay-ui.json`, yıllık vergi dilimleri `content/income-tax-2026.json` içindedir. Vergi oranları yıl ve yürürlük tarihine göre kontrol edilmelidir.

## Toplu sözleşme kataloğunu yenileme

`scripts/update-kv-catalog.py`, resmi Kollektivvertrag.at A–Z dizinini ve sözleşme sayfalarındaki konu başlıklarını alarak `content/collective-agreements.json` dosyasını yeniler. Python standart kütüphanesini kullanır:

```bash
python3 scripts/update-kv-catalog.py
```

Güncelleme kaynağı kodda ve oluşturulan JSON dosyasında belirtilir. Kaynaktan alınamayan sözleşmeler betik çıktısında bildirilir.

## Önizleme

JSON içeriklerini yerel sunucudan yüklemek için proje klasöründe şu komutu çalıştırın:

```bash
python3 -m http.server 8000
```

Tarayıcıda <http://localhost:8000> adresini açın. Sunucuyu durdurmak için terminalde `Ctrl+C` tuşlarına basın.

## Yayınlama

Site [GitHub Pages](https://kinefi.github.io/haklar) üzerinden yayınlanır. Depoda **Settings → Pages** bölümünde `main` dalını ve `/ (root)` klasörünü seçin. Ana rehber `index.html`, toplu sözleşme kataloğu `collective-agreements.html`, maaş/vergi sayfası `lohn-steuer.html` sayfasındadır.

## Bilgilendirme

Bu sayfa genel bilgi verir; hukuki danışmanlık değildir. Katalogdaki başlıklar ve konu etiketleri, her sözleşmenin tüm haklarını özetlemez. Güncel ücretler ve özel koşullar için sözleşmenin tam metnini açın. Sözleşmeler ve kurallar değişebilir; güncel durum için işyeri temsilcinize, sendikanıza veya ilgili kaynağa danışın. RIS resmi mevzuatı yayımlar; mevzuatın Almanca olduğunu ve RIS'in hukuki danışmanlık vermediğini unutmayın.

## Açık kaynak

Bu proje Apache License 2.0 altında lisanslanmıştır.
