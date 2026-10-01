'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import styles from '../../../admin.module.css'

interface MarketplaceOrderItem {
  id: string
  externalLineItemId: string
  externalSku: string
  externalBarcode: string | null
  merchantSku: string | null
  productId: string | null
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  rawStatus: string
  status: string
  reconciliationStatus?: 'MATCHED' | 'UNMATCHED' | 'PENDING'
  stockStatus?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN'
}

interface MarketplaceOrder {
  id: string
  storeId: string
  externalOrderId: string
  externalOrderNumber: string
  status: string
  rawStatus: string
  reconciliationStatus?: 'MATCHED' | 'PARTIALLY_MATCHED' | 'UNMATCHED' | 'ERROR' | 'PENDING'
  orderDate: string
  lastModifiedAt: string
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  paymentMethod?: string | null
  shippingAddress: {
    fullName: string
    addressLine1: string
    addressLine2?: string | null
    city: string
    district: string
    postalCode?: string | null
    country: string
    phone?: string | null
  }
  billingAddress: {
    fullName: string
    addressLine1: string
    city: string
    district: string
    country: string
  } | null
  cargoProvider: string | null
  cargoTrackingNumber: string | null
  packageNumber: string | null
  totalAmount: number
  currency: string
  rawPayload?: Record<string, unknown>
  snapshot?: any
  items: MarketplaceOrderItem[]
  unmatchedCount?: number
  syncedAt: string
}

export default function AdminMarketplaceOrderDetailPage() {
  const { id } = useParams() as { id: string }
  const { token } = useAuthStore()
  const [order, setOrder] = useState<MarketplaceOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconciling, setReconciling] = useState(false)
  const [notification, setNotification] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  const loadOrder = () => {
    if (!token || !id) return
    setLoading(true)

    fetch(`/api/admin/marketplaces/orders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.order) {
          setOrder(data.order)
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadOrder()
  }, [token, id])

  const handleReconcile = async () => {
    if (!token || !id) return
    setReconciling(true)
    setNotification(null)

    try {
      const res = await fetch(`/api/admin/marketplaces/orders/${id}/reconcile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()

      if (data.success && data.order) {
        setOrder(data.order)
        setNotification({
          text: 'Sipariş ürün eşleştirmeleri güncel katalog ile başarıyla yeniden doğrulandı.',
          type: 'success',
        })
      } else {
        setNotification({
          text: data.error || 'Yeniden eşleştirme başarısız oldu.',
          type: 'error',
        })
      }
    } catch (err: any) {
      setNotification({
        text: err.message || 'Hata oluştu.',
        type: 'error',
      })
    } finally {
      setReconciling(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.adminPage}>
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          Sipariş detayları yükleniyor...
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className={styles.adminPage}>
        <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>
          Pazaryeri siparişi bulunamadı.
        </div>
        <div style={{ textAlign: 'center' }}>
          <Link href="/admin/marketplaces/orders" className={styles.secondaryButton}>
            ← Sipariş Havuzuna Dön
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.adminPage}>
      {/* Top Breadcrumb */}
      <div style={{ marginBottom: '16px' }}>
        <Link
          href="/admin/marketplaces/orders"
          style={{
            color: '#60a5fa',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          ← Pazaryeri Sipariş Havuzuna Dön
        </Link>
      </div>

      <div className={styles.pageHeader}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className={styles.pageTitle}>Sipariş #{order.externalOrderNumber}</h1>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor:
                  order.reconciliationStatus === 'MATCHED'
                    ? '#064e3b'
                    : order.reconciliationStatus === 'PARTIALLY_MATCHED'
                    ? '#78350f'
                    : '#7f1d1d',
                color:
                  order.reconciliationStatus === 'MATCHED'
                    ? '#a7f3d0'
                    : order.reconciliationStatus === 'PARTIALLY_MATCHED'
                    ? '#fde68a'
                    : '#fecaca',
              }}
            >
              {order.reconciliationStatus === 'MATCHED'
                ? 'Eşleşti (MATCHED)'
                : order.reconciliationStatus === 'PARTIALLY_MATCHED'
                ? 'Kısmi Eşleşti'
                : 'Eşleşmedi (UNMATCHED)'}
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Harici ID: {order.externalOrderId} · Mağaza: {order.storeId} · Senkronizasyon: {new Date(order.syncedAt).toLocaleString('tr-TR')}
          </p>
        </div>
        <div>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleReconcile}
            disabled={reconciling}
          >
            {reconciling ? 'Eşleştiriliyor...' : 'Yeniden Eşleştir'}
          </button>
        </div>
      </div>

      {notification && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            backgroundColor:
              notification.type === 'success' ? '#064e3b' : '#7f1d1d',
            color: notification.type === 'success' ? '#a7f3d0' : '#fecaca',
            border: `1px solid ${
              notification.type === 'success' ? '#059669' : '#dc2626'
            }`,
          }}
        >
          {notification.text}
        </div>
      )}

      {/* Safety Notice on Stock Mutation */}
      <div
        style={{
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
        }}
      >
        <span style={{ fontSize: '12px', color: '#93c5fd' }}>
          <strong>Phase 17 Güvenlik Kuralı:</strong> Bu ekranda gösterilen ürün stok durumu yalnızca operasyonel görüntüleme amaçlıdır.
          Pazaryeri siparişleri doğrudan stok düşümü (mutation) yapmaz; çok kanallı merkezi stok senkronizasyonu Phase 18 kapsamında devreye alınacaktır.
        </span>
      </div>

      {/* Overview Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* Marketplace & Cargo Card */}
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#f8fafc' }}>
            Lojistik & Kargo Bilgileri
          </h3>
          <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.8' }}>
            <div>
              <span style={{ color: '#94a3b8' }}>Paket Numarası:</span>{' '}
              <strong>{order.packageNumber || '—'}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Kargo Firması:</span>{' '}
              <strong>{order.cargoProvider || '—'}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Kargo Takip No:</span>{' '}
              <code style={{ color: '#38bdf8' }}>{order.cargoTrackingNumber || '—'}</code>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Sipariş Tarihi:</span>{' '}
              {new Date(order.orderDate).toLocaleString('tr-TR')}
            </div>
          </div>
        </div>

        {/* Customer & Address Card */}
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#f8fafc' }}>
            Müşteri & Teslimat Adresi
          </h3>
          <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.8' }}>
            <div>
              <span style={{ color: '#94a3b8' }}>Müşteri:</span>{' '}
              <strong>{order.customerName}</strong>
            </div>
            {order.customerPhone && (
              <div>
                <span style={{ color: '#94a3b8' }}>Telefon:</span> {order.customerPhone}
              </div>
            )}
            {order.customerEmail && (
              <div>
                <span style={{ color: '#94a3b8' }}>E-Posta:</span> {order.customerEmail}
              </div>
            )}
            <div style={{ marginTop: '6px', borderTop: '1px solid #334155', paddingTop: '6px' }}>
              <span style={{ color: '#94a3b8' }}>Teslimat Adresi:</span>
              <div>
                {order.shippingAddress.addressLine1}
                {order.shippingAddress.addressLine2 ? ` ${order.shippingAddress.addressLine2}` : ''}
                , {order.shippingAddress.district} / {order.shippingAddress.city}
              </div>
            </div>
          </div>
        </div>

        {/* Status & Financials Card */}
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#f8fafc' }}>
            Durum & Finansal Özet
          </h3>
          <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.8' }}>
            <div>
              <span style={{ color: '#94a3b8' }}>Normalleştirilmiş Durum:</span>{' '}
              <strong style={{ color: '#93c5fd' }}>{order.status}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Ham Pazaryeri Durumu:</span>{' '}
              <code>{order.rawStatus}</code>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Ödeme Yöntemi:</span>{' '}
              {order.paymentMethod || '—'}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', marginTop: '8px' }}>
              {order.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {order.currency}
            </div>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className={styles.tableCard} style={{ marginBottom: '24px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #334155' }}>
          <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>
            Sipariş Kalemleri ({order.items.length})
          </h3>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Line Item ID</th>
              <th>Pazaryeri Harici SKU</th>
              <th>Eşleşen ZUULAB Ürünü</th>
              <th>Miktar</th>
              <th>Birim Fiyat</th>
              <th>Toplam Tutar</th>
              <th>Eşleştirme Durumu</th>
              <th>Stok Göstergesi</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id}>
                <td>
                  <code style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {it.externalLineItemId}
                  </code>
                </td>
                <td>
                  <code style={{ fontSize: '11px', color: '#fb923c' }}>
                    {it.externalSku}
                  </code>
                </td>
                <td>
                  {it.productId ? (
                    <div>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>
                        {it.productName}
                      </div>
                      <div style={{ fontSize: '10px', color: '#38bdf8' }}>
                        ID: {it.productId}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#f87171', fontSize: '11px', fontWeight: 600 }}>
                      Eşleşen Ürün Yok (Unmapped)
                    </span>
                  )}
                </td>
                <td style={{ fontWeight: 600 }}>{it.quantity}</td>
                <td style={{ fontSize: '12px' }}>
                  {it.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {order.currency}
                </td>
                <td style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                  {it.totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {order.currency}
                </td>
                <td>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor:
                        it.reconciliationStatus === 'MATCHED'
                          ? '#064e3b'
                          : '#7f1d1d',
                      color:
                        it.reconciliationStatus === 'MATCHED'
                          ? '#a7f3d0'
                          : '#fecaca',
                    }}
                  >
                    {it.reconciliationStatus === 'MATCHED' ? 'MATCHED' : 'UNMATCHED'}
                  </span>
                </td>
                <td>
                  <span
                    style={{
                      fontSize: '11px',
                      color:
                        it.stockStatus === 'IN_STOCK'
                          ? '#34d399'
                          : it.stockStatus === 'LOW_STOCK'
                          ? '#fbbf24'
                          : it.stockStatus === 'OUT_OF_STOCK'
                          ? '#f87171'
                          : '#94a3b8',
                    }}
                  >
                    {it.stockStatus === 'IN_STOCK'
                      ? '● Stokta Var'
                      : it.stockStatus === 'LOW_STOCK'
                      ? '● Kritik Stok'
                      : it.stockStatus === 'OUT_OF_STOCK'
                      ? '● Tükendi'
                      : '○ Bilinmiyor'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sanitized Raw Payload Viewer */}
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <details>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              color: '#94a3b8',
            }}
          >
            Güvenli Ham Veri (Sanitized Raw Payload)
          </summary>
          <pre
            style={{
              marginTop: '12px',
              background: '#020617',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#cbd5e1',
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(order.rawPayload, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  )
}
