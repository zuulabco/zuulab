# PHASE 27 — ZUULAB DAILY SHIPPING & BULK LABEL OPERATIONS

## 1. Genel Bakış ve Operasyonel Amaç

ZUULAB atölye ve e-ticaret modelinde, işletme sahibi gün içerisinde hazırlanan ve paketlenen doğrudan mağaza ve pazaryeri siparişlerini hızlı, hatasız ve minimum tıklamayla sevk etmek zorundadır.

Phase 27, mevcut shipping altyapısını (`ShippingService`, `ShippingShipment`, `ShippingLabel`, `PrintAgentService`, `LabelRenderer`, `BarcodeService`) yeniden yazmadan, operasyonel hız ve güvenilirliği maksimize eden bir **Toplu Kargo & Etiket Operasyon Merkezi** sunar.

---

## 2. Günlük Kargo İş Akışı (Daily Workflow)

ZUULAB atölyesinin günlük operasyonu şu adımlardan oluşur:

```text
Siparişler Alınır (Doğrudan & Pazaryeri)
      ↓
Üretim & Paketleme Tamamlanır (Kargoya Hazır)
      ↓
/admin/shipping Operasyon Ekranına Girilir
      ↓
Kargoya Hazır Siparişler Checkbox ile Seçilir ("4 sipariş seçildi")
      ↓
"Seçilen Etiketleri Oluştur" Butonuna Basılır
      ↓
Tek Multi-Page Vector PDF (100×100 mm) Üretilir ve Otomatik İndirilir
      ↓
Xprinter XP-470B Termal Yazıcıdan Basılır
      ↓
Kargo Kuryesine Teslim Edilirken "Kargoya Ver" ile Toplu Onaylanır
      ↓
Fiziksel Stok Düşümü Authoritative Olarak Commit Edilir (SHIPPED)
```

---

## 3. Bulk Label Generation (Toplu Etiket Üretimi)

### 3.1. Mimari & Servis Akışı
- **Servis**: `BulkShippingService.bulkGenerateLabels`
- **Endpoint**: `POST /api/admin/shipping/bulk-labels` (ve geriye dönük uyumlu `POST /api/admin/shipping/bulk-label`)
- **İşlem Sınırı**: Tek seferde maksimum 50 adet gönderi (`MAX_BULK_LIMIT = 50`) işlenir. Bu sınır bellek şişmesini ve zaman aşımını engeller.

### 3.2. Idempotency & Güvenlik İlkeleri
1. **Çift Etiket Koruması**: Aynı shipment için tekrar etiket oluşturulduğunda yeni bir shipment oluşturulmaz, veritabanında mükerrer etiket kaydı açılmaz, mevcut en güncel etiket döner.
2. **Stok Değişmezliği Kuralı**:
   $$\text{Label Generated} \neq \text{Shipment Dispatched}$$
   Etiket oluşturma işlemi fiziksel stok rezervasyonunu kesinlikle düşürmez. Stok yalnızca `SHIPPED` durum geçişinde commit edilir.
3. **Store İzolasyonu**: Kullanıcının mağaza yetkisi dışında kalan veya farklı mağazalara ait gönderiler tek bir toplu işlemde birleştirilemez (`Mağaza İzolasyonu Hatası`).

---

## 4. 100×100 mm Fiziksel Etiket & PDF Formatı

### 4.1. Xprinter XP-470B Standartları
ZUULAB atölyesinde standart termal etiket boyutu **100 mm × 100 mm**'dir.
- 72 DPI PDF Point karşılığı:
  $$100 \times \frac{72}{25.4} = 283.46\text{ pt}$$
- `LabelRenderer.combinePdfLabels` ile üretilen çok sayfalı PDF belgelerinde her sayfa bağımsız bir nesne (`/MediaBox [0 0 283.46 283.46]`) olarak oluşturulur.
- Çıktı kesinlikle A4'e ölçeklenmez veya küçültülmez:
  - Sayfa 1 $\rightarrow$ 100×100 mm
  - Sayfa 2 $\rightarrow$ 100×100 mm
  - Sayfa 3 $\rightarrow$ 100×100 mm

### 4.2. Etiket İçeriği ve Yerleşimi
- **Üst Başlık**: Taşıyıcı Kargo Firması (SURAT, PTT, YURTICI, MOCK) ve Satış Kanalı (ZUULAB DOĞRUDAN / PAZARYERİ: {OrderNo}).
- **Barkod**: Yüksek kontrastlı saf vektörel Code 128 (Subset B) barkod çizgileri.
- **Takip Numarası**: Barkod altında insan tarafından okunabilir takip numarası.
- **Alıcı Bilgileri**: Ad Soyad, Telefon, Adres Satırı, İlçe / İl.
- **Paket & Sipariş Bilgileri**: Sipariş Numarası, Paket Adedi, Ağırlık (kg).
- **Gönderici Bilgisi**: ZUULAB E-COMMERCE.

### 4.3. Xprinter XP-470B Sürücü Ayarları
Tarayıcı veya PDF okuyucudan baskı gönderilirken:
- **Kağıt Boyutu**: 100 mm × 100 mm (veya 4" × 4")
- **Ölçek**: %100 / Gerçek Boyut (Actual Size)
- **Kenar Boşlukları**: Yok (None)

---

## 5. Kısmi Hata Yönetimi (Partial Failure Handling)

Toplu işlem sırasında 10 siparişten 8'i başarılı, 2'si hatalı ise (örneğin eksik adres veya iptal edilmiş sipariş):
- Başarılı olan 8 gönderi için etiketler eksiksiz üretilir ve 8 sayfalık birleşik PDF oluşturulur.
- Başarısız 2 gönderi operasyon raporunda açıkça listelenir:
  - Sipariş Numarası
  - Hata Nedeni (örn. "İptal edilmiş gönderi için etiket oluşturulamaz")
  - "Tekrar Dene" aksiyon butonu.
- Başarısız gönderiler başarılı gönderilerin PDF'ini veya operasyonunu bloke etmez.

---

## 6. Toplu "Kargoya Ver" (Bulk Mark as Shipped)

- **Endpoint**: `POST /api/admin/shipping/bulk-ship`
- **İşlem**:
  1. Gönderinin durum geçişini doğrular (`LABEL_READY` veya `SHIPMENT_CREATED` $\rightarrow$ `SHIPPED`).
  2. `ShippingService.updateShipmentStatus(id, 'SHIPPED')` çağrılır.
  3. Siparişte rezerve edilmiş ürünler için `commitInventoryReservation(...)` tetiklenerek **fiziksel stok autoritative olarak düşürülür**.
  4. Doğrudan mağaza siparişlerinde sipariş durumu `SHIPPED` durumuna güncellenir.
  5. Mükerrer sevk talepleri `idempotent: true` olarak karşılanır ve stok ikinci kez düşürülmez.

---

## 7. Gerçek Zamanlı Günlük İstatistikler (Today's Shipments)

Dashboard ve kargo operasyon ekranındaki veriler veritabanı ve in-memory state üzerinden gerçek zamanlı hesaplanır:
- **Kargoya Hazır**: Paketleme aşamasında veya sevkiyat kaydı açılmış gönderiler.
- **Etiket Hazır**: 100×100 mm etiketi başarıyla oluşturulmuş gönderiler.
- **Etiket Bekliyor**: Kargo kaydı açılmış ancak henüz barkod/etiket basılmamış gönderiler.
- **Kargoya Verildi**: Gün içinde kuryeye teslim edilmiş gönderiler.

---

## 8. Yetkilendirme & RBAC

| İşlem | Gerekli Rol / İzin | Müşteri (CUSTOMER) |
| :--- | :--- | :--- |
| Kargo ve İstatistik Listeleme | `SHIPPING_VIEW` | 403 Forbidden |
| Toplu Etiket Oluşturma | `SHIPPING_LABEL` | 403 Forbidden |
| Toplu Kargoya Verme (Sevk) | `SHIPPING_MANAGE` | 403 Forbidden |
| Yazıcıya Gönderme (Print Agent) | `WAREHOUSE_PRINT` | 403 Forbidden |

---

## 9. Donanım & Print Agent Entegrasyonu

ZUULAB yerel ağında çalışan `PrintAgentService` üzerinden:
- Seçilen etiketler doğrudan depodaki ağ yazıcısına (`WarehousePrinter`) `requestPrintJob` ile iletilebilir.
- Fiziksel yazıcı çevrimdışı olsa dahi tarayıcı üzerinden 100×100 mm tekil veya toplu PDF anında indirilebilir ve yazdırılabilir.

---

## 10. Bilinen Kısıtlar (Known Limitations)

1. **İşlem Limiti**: Tek seferde en fazla 50 sipariş toplu işlenebilir. Daha büyük partiler 50'şerli gruplar halinde işlenmelidir.
2. **Yazıcı Sürücüsü Ölçekleme**: Web tarayıcıları işletim sistemi yazdırma diyaloğundaki ölçek ayarını (%100) zorunlu kılamaz. Kullanıcı yazdırma penceresinde "Gerçek Boyut" seçmelidir.
3. **Cross-Carrier PDF**: Farklı kargo firmalarına ait etiketler aynı PDF içinde birleştirilebilir; ancak fiziksel teslimatta kuryeler kargo bazında ayrım beklediğinden, taşıyıcı filtresi kullanılarak kargo bazında toplu basılması önerilir.
