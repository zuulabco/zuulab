'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { formatPrice } from '@/lib/utils'

interface OrderItem {
  id?: string
  productId: string
  productName: string
  sku: string
  quantity: number
  unitPrice: number
  totalAmount: number
  imageUrl: string | null
}

interface OrderDetail {
  id: string
  orderNumber: string
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  createdAt: string
  deliveredAt?: string
  items: OrderItem[]
}

const RETURN_REASONS = [
  'Ürün beklentimi karşılamadı',
  'Yanlış ürün',
  'Hasarlı ürün',
  'Kusurlu ürün',
  'Farklı ürün geldi',
  'Beden / numara uymadı',
  'Diğer',
]

export default function ReturnRequestClient() {
  const params = useParams()
  const router = useRouter()
  const orderNumber = params.orderNumber as string
  const { token } = useAuthStore()

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successResult, setSuccessResult] = useState<any>(null)

  // Form state
  const [selectedType, setSelectedType] = useState<'RETURN' | 'EXCHANGE'>('RETURN')
  const [reason, setReason] = useState(RETURN_REASONS[0])
  const [customerNote, setCustomerNote] = useState('')
  const [selectedItems, setSelectedItems] = useState<{ [productId: string]: { selected: boolean; quantity: number } }>({})
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [photoInput, setPhotoInput] = useState('')

  useEffect(() => {
    fetch(`/api/orders/${orderNumber}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.order) {
          setOrder(data.order)
          const initialSelection: { [productId: string]: { selected: boolean; quantity: number } } = {}
          data.order.items.forEach((item: OrderItem) => {
            initialSelection[item.productId] = { selected: false, quantity: item.quantity }
          })
          setSelectedItems(initialSelection)
        } else {
          setError(data.error || 'Sipariş yüklenemedi.')
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [orderNumber, token])

  const handleToggleItem = (productId: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        selected: !prev[productId]?.selected,
      },
    }))
  }

  const handleQuantityChange = (productId: string, maxQty: number, val: number) => {
    const q = Math.max(1, Math.min(maxQty, val))
    setSelectedItems((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        quantity: q,
      },
    }))
  }

  const handleAddPhoto = () => {
    if (!photoInput.trim()) return
    setPhotoUrls((prev) => [...prev, photoInput.trim()])
    setPhotoInput('')
  }

  const handleRemovePhoto = (idx: number) => {
    setPhotoUrls((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const itemsToSubmit = Object.entries(selectedItems)
      .filter(([_, val]) => val.selected)
      .map(([productId, val]) => ({
        productId,
        quantity: val.quantity,
        reason,
      }))

    if (itemsToSubmit.length === 0) {
      setError('Lütfen iade veya değişim yapmak istediğiniz en az bir ürün seçin.')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch(`/api/orders/${orderNumber}/returns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type: selectedType,
          reason,
          customerNote,
          items: itemsToSubmit,
          photoUrls,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setSuccessResult(data.returnRequest)
      } else {
        setError(data.error || 'İade talebi oluşturulamadı.')
      }
    } catch (err: any) {
      setError(err.message || 'İletişim hatası oluştu.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: '#6b7280' }}>
        Sipariş bilgileri yükleniyor...
      </div>
    )
  }

  if (successResult) {
    return (
      <div style={{ maxWidth: 640, margin: '40px auto', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>
            ✓
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>
            Talebiniz Başarıyla Alındı
          </h2>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>
            Talep No: <strong style={{ fontFamily: 'monospace', color: '#111827' }}>{successResult.returnNumber}</strong>
          </p>
        </div>

        <div style={{ borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', padding: '20px 0', marginBottom: 24, fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
          <p>
            <strong>İşlem Türü:</strong> {successResult.type === 'EXCHANGE' ? 'Ürün Değişimi' : 'Para İadesi (Refund)'}
          </p>
          <p>
            <strong>Durum:</strong> {successResult.status === 'APPROVED' ? 'Onaylandı (Kargo Kodu Hazırlanıyor)' : 'İncelemeye Alındı'}
          </p>
          <p>
            Talebiniz operasyon ekibimiz tarafından incelendikten sonra tarafınıza e-posta ve SMS ile bildirim gönderilecek ve kargo iade kodu tanımlanacaktır.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <Link
            href={`/hesap/siparisler/${orderNumber}`}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '10px 16px',
              background: '#111827',
              color: '#ffffff',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Sipariş Detayına Dön
          </Link>
          <Link
            href="/hesap/siparisler"
            style={{
              padding: '10px 16px',
              border: '1px solid #e5e7eb',
              color: '#374151',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Tüm Siparişlerim
          </Link>
        </div>
      </div>
    )
  }

  if (error && !order) {
    return (
      <div style={{ padding: '40px 0', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', marginBottom: 16 }}>{error}</p>
        <Link href={`/hesap/siparisler/${orderNumber}`} style={{ color: '#111827', textDecoration: 'underline' }}>
          Sipariş detayına geri dön
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760, margin: '24px auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', margin: '0 0 6px 0' }}>
          İade & Değişim Talebi
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          Sipariş No: #{orderNumber} · 14 gün içerisinde cayma ve değişim hakkı
        </p>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* İşlem Türü Seçimi */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
            İşlem Türünü Seçin
          </label>
          <div style={{ display: 'flex', gap: 16 }}>
            <label
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                border: selectedType === 'RETURN' ? '2px solid #111827' : '1px solid #e5e7eb',
                borderRadius: 6,
                cursor: 'pointer',
                background: selectedType === 'RETURN' ? '#f9fafb' : '#ffffff',
              }}
            >
              <input
                type="radio"
                name="returnType"
                value="RETURN"
                checked={selectedType === 'RETURN'}
                onChange={() => setSelectedType('RETURN')}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>İade (Para İadesi)</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Ödeme yapılan karta ücret iadesi</div>
              </div>
            </label>

            <label
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                border: selectedType === 'EXCHANGE' ? '2px solid #111827' : '1px solid #e5e7eb',
                borderRadius: 6,
                cursor: 'pointer',
                background: selectedType === 'EXCHANGE' ? '#f9fafb' : '#ffffff',
              }}
            >
              <input
                type="radio"
                name="returnType"
                value="EXCHANGE"
                checked={selectedType === 'EXCHANGE'}
                onChange={() => setSelectedType('EXCHANGE')}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Değişim</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Ürünün sağlam veya yeni varyantı ile değişimi</div>
              </div>
            </label>
          </div>
        </div>

        {/* Ürün Seçimi */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
            İşlem Yapılacak Ürünleri Seçin
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {order?.items.map((item) => {
              const isSelected = selectedItems[item.productId]?.selected || false
              const currentQty = selectedItems[item.productId]?.quantity || 1

              return (
                <div
                  key={item.productId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: 12,
                    border: isSelected ? '1px solid #111827' : '1px solid #f3f4f6',
                    borderRadius: 6,
                    background: isSelected ? '#fbfbfb' : '#ffffff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleItem(item.productId)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />

                  <div style={{ position: 'relative', width: 48, height: 48, borderRadius: 4, overflow: 'hidden', background: '#f3f4f6', flexShrink: 0 }}>
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.productName} fill style={{ objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#e5e7eb' }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.productName}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      SKU: {item.sku} · {formatPrice(item.unitPrice)}
                    </div>
                  </div>

                  {isSelected && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Adet:</span>
                      <select
                        value={currentQty}
                        onChange={(e) => handleQuantityChange(item.productId, item.quantity, parseInt(e.target.value))}
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
                      >
                        {Array.from({ length: item.quantity }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Neden ve Açıklama */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
              {selectedType === 'EXCHANGE' ? 'Değişim Nedeni' : 'İade Nedeni'}
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
            >
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
              Açıklama / Müşteri Notu
            </label>
            <textarea
              rows={3}
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="Talep hakkında detay belirtmek isterseniz yazabilirsiniz..."
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Fotoğraf Yükleme (Opsiyonel / URL) */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            Hasar / Kusur Fotoğrafı (Opsiyonel)
          </label>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px 0' }}>
            Kusurlu veya hasarlı ürünler için görsel bağlantısı ekleyebilirsiniz.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="url"
              placeholder="https://... (Fotoğraf URL)"
              value={photoInput}
              onChange={(e) => setPhotoInput(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
            />
            <button
              type="button"
              onClick={handleAddPhoto}
              style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              Ekle
            </button>
          </div>

          {photoUrls.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {photoUrls.map((url, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9fafb', border: '1px solid #e5e7eb', padding: '4px 10px', borderRadius: 4, fontSize: 12 }}>
                  <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                  <button type="button" onClick={() => handleRemovePhoto(i)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Butonlar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          <Link
            href={`/hesap/siparisler/${orderNumber}`}
            style={{
              padding: '10px 20px',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              color: '#374151',
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Vazgeç
          </Link>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '10px 24px',
              background: '#111827',
              color: '#ffffff',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Talebiniz Gönderiliyor...' : 'Talebi Oluştur'}
          </button>
        </div>
      </form>
    </div>
  )
}
