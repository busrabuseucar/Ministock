# İşletim ve sürüm doğrulama — Ziyaretçiye özel stok demosu

Son inceleme: **16 Ekim 2026**. Bu belge kurulum, veri akışı, sürüm kapıları, geri dönüş ve doğrulama kapsamını birlikte kaydeder. Bir yayın adresinin açılması, tüm üretim koşullarının tamamlandığı anlamına gelmez.

## Sürüm kanıtı

- Denetlenen uygulama commit’i: `cc5bc2b9b823d4a9210c18914ee5525f1239a389`.
- [Bu commit için başarılı CI kaydı](https://github.com/busrabuseucar/Ministock/actions/runs/38904978030).
- Doğrulanan otomatik kapsam: 22 API + 1 paket + 2 derlenmiş Worker + 2 tarayıcı testi.
- Testlerin gerçek servis, veri veya donanım yerine taklit kullandığı noktalar aşağıda açıkça ayrılmıştır.

## Kurulum ve çalışma

Depo kökünde, README’deki çalışma zamanı sürümüyle:

```sh
npm run install:ci
npm run check
npm test
npm run source
npm run test:source
npm run build
npm run test:build
```

Veri akışı: Tarayıcı oturum çerezi → Worker API → çalışma alanına ayrılmış D1 stok/hareket kayıtları.

Yapılandırma: Sites hosting manifestinde d1=DB korunmalı. Migration dosyalarını yeniden yazma; yeni migration ekle.

## Yayın ve geri dönüş

1. Temiz checkout ve kilitli bağımlılıklarla yukarıdaki kontrolleri çalıştır. İlgili CI başarısını commit SHA ile eşleştir.
2. Yayın paketine yalnızca çalışma zamanı dosyalarını koy. Secret, ham kullanıcı verisi, yerel veritabanı ve kişisel hazırlık notları pakete girmemeli.
3. Hedef proje, kaynak commit, ortam ve yayın sürümünü kaydet. Önceki çalışan sürüm kimliğini geri dönüş için koru.
4. Yayından sonra ana kullanıcı akışını, hata durumunu ve varsa kalıcılığı doğrula. Sunucu hatası/yanlış sonuçta yeni yazmaları durdur; önceki doğrulanmış yayını geri al.
5. Şema değiştiyse yalnızca kodu geri almak yeterli değildir. Yedekten ayrı ortamda doğrulama yapmadan canlı veri üzerine yazma.

## Veri saklama ve kurtarma

CSV dışa aktarımı stok anlık görüntüsüdür; tam veritabanı geri yüklemesi değildir. Gerçek müşteri kullanımından önce D1 yedek/geri yükleme tatbikatı ve sahiplik kurtarma gerekir. Çerez kaybı erişim kaybıdır.

## Gerçek servis, model ve cihaz doğrulaması

16 Ekim canlı D1 testinde yeni sentetik alanda 8 ürün/181 stok okundu; ESP32 24→23 çıkışı kaydedildi ve sayfa yenilendiğinde 23 kaldı. Kurumsal çok kullanıcılı envanter ürünü olarak onaylanmadı.

## Yayın sonrası gözlem

Önce küçük ve sentetik girdilerle temel akışı kontrol et. Beklenmeyen hata, boş ekran, yanlış hesap, yetkisiz erişim veya veri kaybında tarih, uygulama commit’i, ortam ve yeniden üretme adımlarını kaydet; kişisel veri ve secret ekleme. Statik araçlarda tarayıcı konsolu/ağ hatalarını; backend bulunan projelerde durum kodu, gecikme ve hata oranını incele. Bu belgede sürekli izleme veya otomatik geri dönüş kurulmuş olduğu iddia edilmez.

## Kabul kaydı

Her yeni sürümün kaydı; test komutu/sonucu, kaynak SHA, yayın sürümü, gerçek servis/model sürümü, cihaz/işletim sistemi, veri kümesi özeti ve geri dönüş denemesini içermeli. Erişim veya fiziksel donanım yoksa ilgili satır **çalıştırılmadı** olarak tutulur; otomatik test başarısı yerine geçirilmez.
