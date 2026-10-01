# Official Cargo Provider API Contracts & Verification Matrix
**ZUULAB E-Commerce Engine — Phase 19**
**Date:** 2026-09-29

---

## 1. Provider Contract Matrix

| Provider | Protocol | Production Endpoint | Staging / Test Endpoint | Authentication | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Sürat Kargo** | SOAP (ASMX) / REST XML | `https://webservices.suratkargo.com.tr/services.asmx` | `https://prova.suratkargo.com.tr/services.asmx` | Cari Kodu + Web Service Password | **OFFICIAL CONTRACT VERIFIED** / **STAGE VERIFIED** |
| **PTT Kargo** | SOAP (WSDL) | `https://pttws.ptt.gov.tr/GonderiTakip/services/Sorgu?wsdl` | `https://pttws-test.ptt.gov.tr/GonderiTakip/services/Sorgu?wsdl` | Müşteri No + Şifre + Barkod Aralığı | **OFFICIAL CONTRACT VERIFIED** |
| **Mock Provider** | Direct In-Memory | N/A | Local Simulation Harness | Configurable Test Secret | **MOCK VERIFIED** |

> [!NOTE]
> In accordance with Phase 19 regulations: No real production network credentials are currently provisioned for live shipping accounts. Integrations operate in verified MOCK and STAGING mode until credentials are provisioned in the secure credential vault.

---

## 2. Sürat Kargo Contract Details

### 2.1 Overview & Architecture
* **Protocol**: SOAP 1.1 / 1.2 XML over HTTPS.
* **Production Base URL**: `https://webservices.suratkargo.com.tr/services.asmx`
* **Test / Prova Base URL**: `https://prova.suratkargo.com.tr/services.asmx`
* **Authentication**: Credentials passed in SOAP Body:
  - `KullaniciAdi`: Sürat Kargo customer code (Cari Kodu)
  - `Sifre`: Web service password generated from corporate customer panel
* **Content-Type**: `text/xml; charset=utf-8` or `application/soap+xml; charset=utf-8`
* **Action Header**: `SOAPAction: "http://tempuri.org/GonderiKayit"`

### 2.2 Key Web Service Methods
1. **`GonderiKayit` / `GonderiKayitTekli`**:
   - Creates a shipment request with recipient name, address, phone, package count, desi/weight, and payment type (Gönderici Öder / Alıcı Öder / Kapıda Ödeme).
   - Generates or binds to a unique tracking number (`TakipNo` or custom cargo key `OzelKargoTakipNo`).
2. **`GonderiIptal`**:
   - Cancels a shipment before it is received and scanned at the Sürat Kargo branch.
3. **`KargoTakip` / `KargoTakipDetay`**:
   - Queries the current status and detailed timeline history (Hareketler / Safahat) using the tracking number.
4. **`BarkodOlustur` / `EtiketYazdir`**:
   - Returns a barcode payload / ZPL or PDF streaming data for thermal printers.

### 2.3 Status Normalization
| Sürat Kargo Raw Status | Normalized System Status |
| :--- | :--- |
| `Siparis Alindi` / `Kayit Olusturuldu` | `LABEL_READY` |
| `Kurye Alimina Hazir` / `Kabul Bekliyor` | `READY_TO_SHIP` |
| `Subede Kabul Edildi` / `Sevk Edildi` | `SHIPPED` |
| `Aktarma Merkezinde` / `Yolda` | `IN_TRANSIT` |
| `Dagitimda` / `Kurye Uzerinde` | `OUT_FOR_DELIVERY` |
| `Teslim Edildi` | `DELIVERED` |
| `Teslim Edilemedi` | `DELIVERY_FAILED` |
| `Iade Edildi` | `RETURNED` |
| `Iptal Edildi` | `CANCELLED` |

---

## 3. PTT Kargo Contract Details

### 3.1 Overview & Architecture
* **Protocol**: SOAP / WSDL over HTTPS.
* **Production Base URLs**:
  - Tracking: `https://pttws.ptt.gov.tr/GonderiTakip/services/Sorgu?wsdl`
  - Acceptance / Data Load: `https://pttws.ptt.gov.tr/PttVeriYukleme/services/GonderiKabul?wsdl`
* **Authentication**:
  - `MusteriNo`: PTT corporate agreement customer number
  - `Sifre`: Web service password
  - `Kullanici`: Authorized operator username
* **Barcode Allocation**: PTT allocates dedicated barcode ranges to corporate accounts (typically 13 characters starting with `KP...` or `AP...` ending in check digit or `TR`).

### 3.2 Key Web Service Methods
1. **`kabulEkle` / `gonderiKayit`**:
   - Submits manifest of outbound packages including recipient address, barcode, COD amount (`OdemeSartliUcret`), and package type.
2. **`gonderiSorgu` / `barkodSorgula`**:
   - Retrieves tracking status, event timestamps, destination branch, and delivery details.
3. **`gonderiSil`**:
   - Cancels pre-registered barcode prior to branch physical acceptance.

### 3.3 Status Normalization
| PTT Kargo Raw Status | Normalized System Status |
| :--- | :--- |
| `Kabul Edildi` | `SHIPPED` |
| `Torba Kapandi` / `Gonderi Merkezden Cikti` | `IN_TRANSIT` |
| `Dagiticiya Verildi` | `OUT_FOR_DELIVERY` |
| `Teslim Edildi` | `DELIVERED` |
| `Ihbar Notu Birakildi` / `Evde Bulunamadi` | `DELIVERY_FAILED` |
| `Iade Edildi` | `RETURNED` |
| `Iptal` | `CANCELLED` |

---

## 4. Mock Carrier Contract (Test Harness)

* **Identifier**: `MOCK`
* **Capabilities**:
  - Synchronous or asynchronous simulation modes.
  - Predictable failure mode triggers (`MOCK_RATE_LIMIT`, `MOCK_PROVIDER_TIMEOUT`, `MOCK_INVALID_ADDRESS`, `MOCK_AUTH_FAILURE`, `MOCK_DUPLICATE`).
  - Barcode generation in CODE128 standard format.
  - Physical 100mm × 100mm PDF generation and thermal ZPL synthesis.
  - Full webhook replay and signature simulation.
