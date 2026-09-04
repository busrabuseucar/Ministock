# MiniStock: bitmiş demo → öğrenilmiş proje

## 15 dakikalık deney

1. ELE-001 kodlu ESP32 kartını bul: stok **24**, düşük stok sınırı **10**.
2. Çıkışa **14** yaz. Açıklama: “İlk prototip için ayrıldı”. Yeni stok **10**, durum **Düşük stok** olmalı.
3. Bu kez **11** adet çıkarmayı dene. Sunucu reddetmeli; stok **10** kalmalı ve geçmişe yeni hareket eklenmemeli.
4. **5** adet giriş yap. Yeni stok **15**, durum **Yeterli** olmalı.
5. Sayfayı yenile. Stok **15**, yaptığın iki başarılı hareket geçmişte görünmeli.
6. Aynı ürün koduyla yeni ürün ekle. Tekrarlanan kod reddedilmeli.
7. Düşük stok filtresini seçip CSV indir. Dosyada yalnız görünür ürünler bulunmalı.

## Kodda izle

- Form → `components/inventory.tsx` → `api()`.
- HTTP isteği → `worker/index.ts` → `lib/ministock/api.ts`.
- Doğrulama → `lib/ministock/domain.ts`.
- Stok kararı → `lib/ministock/store.ts` içindeki tek koşullu INSERT.
- Kalıcı kayıt → `db/schema.ts` ve `drizzle/*.sql`.
- Sonuç → API yeniden okuma → arayüz.

## Kendi yapacağın küçük değişiklik

Düşük stok sınırında eşitliği incele. Mevcut sözleşme **stok ≤ sınır**. Önce `stockStatus` testindeki 5/5 örneğini neden “low” saydığını anlat. Sonra ayrı bir dalda sözleşmeyi **stok < sınır** yap: yalnız etiketi değiştirmek yetmez; filtre, özet kartı, README ve testi de aynı sözleşmeye taşı. Değişikliği commit et, testleri çalıştır ve farkı açıklayan kısa bir not yaz. Ana sürüme dönmek için bu deneme dalından çık.

## Mülakatta açıklayabilmen gerekenler

- Stoku JavaScript'te okuyup sonra ayrı bir istekte düşürmek neden yarış durumuna yol açabilir?
- Bir SQL yazımı stok kontrolünü ve hareket eklemeyi nasıl birlikte yapıyor?
- Aynı requestId ile iki deneme neden tek hareket oluşturuyor? Aynı miktarla iki gerçek işlem bundan nasıl ayrılıyor?
- Ürün ve açılış hareketinden biri başarısızsa neden ikisi de geri alınmalı?
- HttpOnly çerez ne sağlar? Neden kullanıcı hesabı veya giriş sistemi sayılmaz?
- İkinci tarayıcı neden ilk tarayıcının ürünlerini göremiyor?
- API testi ile görsel tarayıcı testi arasındaki fark ne?

AI desteğini saklama. Kendi yazdığın/değiştirdiğin bölümleri ve doğrulayabildiğin davranışları somut anlat.
