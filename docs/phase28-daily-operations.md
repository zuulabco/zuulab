# ZUULAB PHASE 28 — DAILY WORKSHOP OPERATIONS & PRODUCTION PLANNING

## 1. Amaç (Purpose)

ZUULAB, tek kişi tarafından işletilen butik bir 3D printing ve e-ticaret atölyesidir.
Phase 28'in ana hedefi, atölye sahibinin her sabah güne başladığında tek bir merkezi ekrandan (`/admin/today`):
1. **Bugün hangi siparişleri hazırlamalıyım?**
2. **Hangi ürünleri üretmeliyim?**
3. **Hangi ürünlerde stok kritik?**
4. **Bugünkü üretim ve kargo sıram ne olmalı?**

sorularının kesin, deterministik ve aksiyon odaklı yanıtlarını görmesini sağlamaktır.

Bu modül yeni bir envanter authority'si veya yeni bir state machine oluşturmaz. Mevcut `InventoryService`, `ProductionService`, `OrdersService`, `ShippingService` ve `BulkShippingService` servislerinin yetkili verilerini toplayarak **salt-okunur (read-only)** bir operasyonel orkestrasyon sunar.

---

## 2. Veri Akışı (Data Flow)

```
                            [ İstek: GET /api/admin/today ]
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │  RBAC & Store Context (user.storeId)      │
                   └─────────────────────┬─────────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │       DailyOperationsService              │
                   │       (Pure Read-Only Orchestrator)       │
                   └─────────────────────┬─────────────────────┘
                                         │
      ┌──────────────────┬───────────────┼───────────────┬──────────────────┐
      │                  │               │               │                  │
      ▼                  ▼               ▼               ▼                  ▼
[OrdersService]  [InventoryService] [ProductionService] [ShippingService] [Marketplace]
  getAllOrders   getInventoryStatus  getProductionOrders  listShipments    getMarketplaceOrders
  - Açık sipariş  - Fiziksel stok    - Aktif kuyruk       - Gönderilecek   - Kanal siparişleri
  - Talep hesap  - Rezerve stok     - Düşük stok         - Etiket hazır/
                 - Kullanılabilir                         bekleyen
```

### Mutasyon Güvencesi (Zero-Mutation Invariant)
`/admin/today` ekranının yüklenmesi veya `DailyOperationsService` fonksiyonlarının çağrılması:
* Envanter stok veya rezervasyonlarını **kesinlikle değiştirmez**.
* Sipariş durumlarını **kesinlikle değiştirmez**.
* Üretim emirlerini **kesinlikle değiştirmez**.
* Kargo veya etiket durumlarını **kesinlikle değiştirmez**.

---

## 3. Önceliklendirme Mantığı (Priority Engine)

Sistem deterministik ve açıklanabilir 4 seviyeli bir öncelik motoru kullanır (Yapay Zeka / AI forecasting içermez):

| Seviye | Etiket | Kriter | UI Gösterimi | Aksiyon |
|---|---|---|---|---|
| **P0** | **ACİL** | Açık siparişin gönderilmesini engelleyen üretim eksikliği | 🔴 Kırmızı | `[Üretime Git]` |
| **P1** | **BUGÜN** | Üretimi bitmiş ve bugün sevk edilmesi gereken paketler / etiket bekleyenler | 🟠 / 🟢 Turuncu / Yeşil | `[Kargo Masasına Git]` / `[Kargoya Git]` |
| **P2** | **KRİTİK STOK** | Sipariş kaynaklı olmayan, minimum güvenlik stoğunun altına inmiş ürünler | 🟡 Sarı | `[Stokları Gör]` |
| **P3** | **NORMAL** | Aktif 3D baskı kuyruğunda veya tezgahta çalışan planlı üretim işleri | 🔵 Mavi | `[Üretimi Gör]` |

### FIFO Sıralaması
Aynı öncelik seviyesine sahip sipariş ve blokajlar arasında daima `createdAt ASC` (ilk gelen ilk çıkar) kuralı geçerlidir.

---

## 4. Üretim Önerisi Hesaplama Mantığı (Production Recommendations)

### Çift Sayımı Önleme (Double-Counting Prevention)
Atölyede açık siparişler için fiziksel stoktan ayrılmış (`reservedStock`) ürünler bulunmaktadır.
Kullanılabilir stok:
$$\text{availableStock} = \max(0, \text{physicalStock} - \text{reservedStock})$$

Üretim ihtiyacı belirlenirken depoda siparişler için zaten ayrılmış olan fiziksel stok tekrar eksik gibi gösterilmez:
$$\text{requiredProduction} = \max(0, \text{demand} - \text{physicalStock})$$

* Eğer $\text{reservedStock} = 0$ ise: $\text{physicalStock} = \text{availableStock}$, dolayısıyla $\max(0, \text{demand} - \text{availableStock})$.
* Eğer depoda 5 adet varsa (4'ü rezerve, 1'i boşta) ve toplam talep 5 ise: $\max(0, 5 - 5) = 0$ ek üretim gerekir.

---

## 5. Sipariş Bloke Edenler Mantığı (Order Blockers)

Açık siparişler satır bazında taranır:
1. Siparişteki ürünün kullanılabilir stoğu yetersiz ise (`item.quantity > availableStock`),
2. Bu ürün için aktif üretim (`QUEUED` veya `IN_PROGRESS`) var mı kontrol edilir:
   * **Aktif Üretim Varsa:** Durum `P1` olarak işaretlenir: `"Üretim devam ediyor (IN_PROGRESS) — Tamamlanınca gönderilebilir"`.
   * **Aktif Üretim Yoksa:** Durum `P0` acil olarak işaretlenir: `"Üretim gerekiyor — [Ürün Adı] (X eksik)"`. Aksiyon butonu kullanıcıyı parametreleri dolu üretim formuna yönlendirir: `/admin/production/new?productId=...&quantity=...&priority=URGENT`.

---

## 6. Güvenlik ve Yetkilendirme (Security & RBAC)

`GET /api/admin/today` uç noktası `ORDER_VIEW` iznini şart koşar:
* `ADMIN`, `SUPER_ADMIN`, `ORDER_MANAGER`, `STAFF` rolleri erişebilir (`HTTP 200`).
* `CUSTOMER` rolü kesinlikle engellenir (`HTTP 403 Forbidden`).
* Kimlik doğrulanmamış istekler reddedilir (`HTTP 401 Unauthorized`).

---

## 7. Çoklu Mağaza İzolasyonu (Multi-Store Isolation)

* Server tarafında `user.storeId` esas alınır.
* Client'tan gelebilecek `?storeId=...` query parametresi güvenlik gerekçesiyle dikkate alınmaz.
* Bir mağazaya (ör. `store-hb-1`) bağlı personel, başka bir mağazanın (`store-ty-1`) sipariş veya kargo verisini göremez.

---

## 8. Zaman Dilimi Standardı (Timezone)

Tüm tarih, gün ve gün başlangıç/bitiş hesaplamaları sunucu tarafında **`Europe/Istanbul`** zaman dilimi ile yürütülür:
* Client saatine güvenilmez.
* ISO tarih biçimi: `sv-SE` / `en-CA` formatı ile `YYYY-MM-DD`.
* Türkçe metin gösterimi: `29 Eylül 2026, Pazartesi`.

---

## 9. Test Sonuçları (Verification Results)

`src/scripts/verify-phase28.ts` doğrulama paketi çalıştırılmıştır:

```text
===============================================================
  ZUULAB PHASE 28 — DAILY WORKSHOP OPERATIONS VERIFICATION     
===============================================================

--- T1: Today endpoint authenticated access --- [PASS] (4 assertions)
--- T2: CUSTOMER blocked (403) --- [PASS] (2 assertions)
--- T3: Multi-store isolation --- [PASS] (2 assertions)
--- T4: Today date uses Europe/Istanbul --- [PASS] (4 assertions)
--- T5: Summary counts from real data --- [PASS] (4 assertions)
--- T6: Production demand calculation --- [PASS] (2 assertions)
--- T7: Available stock calculation uses authoritative inventory --- [PASS] (2 assertions)
--- T8: Reserved stock is not double-counted --- [PASS] (2 assertions)
--- T9: Production recommendation quantity --- [PASS] (3 assertions)
--- T10: Order blocker detection --- [PASS] (4 assertions)
--- T11: Low stock data --- [PASS] (2 assertions)
--- T12: Active production data --- [PASS] (4 assertions)
--- T13: Today's shipping summary --- [PASS] (3 assertions)
--- T14: Priority ordering deterministic --- [PASS] (1 assertion)
--- T15: FIFO ordering for same priority --- [PASS] (1 assertion)
--- T16: No inventory mutation when loading Today --- [PASS] (2 assertions)
--- T17: No order mutation when loading Today --- [PASS] (1 assertion)
--- T18: No production mutation when loading Today --- [PASS] (1 assertion)
--- T19: No shipment mutation when loading Today --- [PASS] (1 assertion)
--- T20: Existing production workflow regression --- [PASS] (2 assertions)
--- T21: Existing shipping workflow regression --- [PASS] (2 assertions)
--- T22: Existing order workflow regression --- [PASS] (2 assertions)
--- T23: Existing inventory workflow regression --- [PASS] (3 assertions)
--- T24: Dashboard integration verification --- [PASS] (3 assertions)
--- T25: TypeScript type check --- [PASS] (0 errors)
--- T26: Next.js production build --- [PASS] (compiled successfully)

===============================================================
  VERIFICATION RESULTS: 56 PASSED, 0 FAILED
===============================================================
```

### Regresyon Testleri
* Phase 18: **PASS** (55/55)
* Phase 19: **PASS** (56/56)
* Phase 20: **PASS** (99/99)
* Phase 21: **PASS** (100/100)
* Phase 22: **PASS** (100/100)
* Phase 23: **PASS** (100/100)
* Phase 24: **PASS** (123/123)
* Phase 25: **PASS** (59/59)
* Phase 26: **PASS** (79/79)
* Phase 27: **PASS** (43/43)
* Phase 28: **PASS** (56/56)

---

## 10. Kısıtlamalar (Remaining Limitations)

Aşağıdaki özellikler kapsam dışı bırakılmıştır ve Phase 28'e dahil edilmemiştir:
* Bambu MQTT / canlı yazıcı telemetrisi
* Yapay zeka (AI) üretim ve talep tahmini
* Otomatik satın alma ve hammadde tedarik zinciri
* Muhasebe ve ERP entegrasyonu
* Otomatik üretim başlatma veya otomatik kargolama (karar ve aksiyon daima atölye sahibindedir)
