'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import styles from '../../../admin.module.css'
import { SkeletonPage } from '@/components/common/Skeleton'

interface OrderLine {
  lineId: string
  barcode: string
  stockCode: string | null
  productName: string
  quantity: number
  vatRate: number
  grossTotal: number
  sellerDiscount: number
  netTotal: number
  status: string | null
}

interface MarketplaceOrder {
  id: string
  storeName: string
  packageId: string
  externalOrderNumber: string
  status: string
  siteStatus: string | null
  orderDate: string | null
  lastModifiedAt: string | null
  totalAmount: number
  customerName: string | null
  cargoProvider: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  lines: OrderLine[]
  affectsStock: boolean
  unmatchedCount: number
  orderNumber: string | null
  lastError: string | null
}

function tl(value: number): string {
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13, padding: '4px 0' }}>
      <div style={{ width: 170, color: 'var(--text-muted)' }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}

export default function MarketplaceOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { token, canFetch } = useAuthStore()
  const [order, setOrder] = useState<MarketplaceOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)

  const load = useCallback(() => {
    if (!canFetch || !id) return
    fetch(`/api/admin/marketplaces/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error)
        setOrder(data.order)
      })
      .catch((err) => toast.error(err.message || 'Sipariş yüklenemedi.'))
      .finally(() => setLoading(false))
  }, [canFetch, id, token])

  useEffect(() => {
    load()
  }, [load])

  async function retry() {
    setRetrying(true)
    try {
      const res = await fetch(`/api/admin/marketplaces/orders/${id}/reconcile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setOrder(data.order)
      if (data.order?.orderNumber) toast.success(`Site siparişi oluşturuldu: ${data.order.orderNumber}`)
      else toast.error(data.order?.lastError || 'Sipariş hâlâ oluşturulamıyor.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Yeniden denenemedi.')
    } finally {
      setRetrying(false)
    }
  }

  if (loading)
    return (
      <div className={styles.adminPage}>
        <SkeletonPage />
      </div>
    )
  if (!order) return <div className={styles.adminPage}>Sipariş bulunamadı.</div>

  return (
    <div className={styles.adminPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Sipariş {order.externalOrderNumber}</h1>
          <p className={styles.pageSubtitle}>
            {order.storeName} · paket {order.packageId}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/marketplaces/orders" className={styles.secondaryButton}>
            ← Pazaryeri siparişleri
          </Link>
          {!order.orderNumber && (
            <button className={styles.primaryButton} onClick={retry} disabled={retrying}>
              {retrying ? 'Deneniyor…' : 'Siparişi yeniden dene'}
            </button>
          )}
        </div>
      </div>

      <div className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
        <Row label="Pazaryeri durumu">{order.status}</Row>
        <Row label="Site siparişi">
          {order.orderNumber ? (
            <Link href={`/admin/orders/${order.orderNumber}`}>
              {order.orderNumber} ({order.siteStatus})
            </Link>
          ) : (
            <span style={{ color: '#b45309' }}>{order.lastError ?? 'Henüz oluşturulmadı.'}</span>
          )}
        </Row>
        <Row label="Stok">
          {order.affectsStock
            ? 'Bu sipariş stoktan düşer (iptalde geri eklenir).'
            : 'Stoka dokunmaz: mağazanın ilk alımından önceki geçmiş sipariş ya da ilk görüldüğünde iptal.'}
        </Row>
        <Row label="Tarih">{order.orderDate ? new Date(order.orderDate).toLocaleString('tr-TR') : '—'}</Row>
        <Row label="Müşteri">{order.customerName ?? '—'}</Row>
        <Row label="Kargo">
          {order.cargoProvider ?? '—'}
          {order.trackingNumber &&
            (order.trackingUrl ? (
              <>
                {' · '}
                <a href={order.trackingUrl} target="_blank" rel="noreferrer">
                  {order.trackingNumber}
                </a>
              </>
            ) : (
              ` · ${order.trackingNumber}`
            ))}
        </Row>
        <Row label="Tutar (satıcı)">{tl(order.totalAmount)}</Row>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Barkod</th>
              <th>Adet</th>
              <th>Brüt</th>
              <th>Satıcı indirimi</th>
              <th>Net</th>
              <th>KDV</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.lineId}>
                <td>{l.productName}</td>
                <td>
                  <code>{l.barcode}</code>
                </td>
                <td>{l.quantity}</td>
                <td>{tl(l.grossTotal)}</td>
                <td>{l.sellerDiscount ? `−${tl(l.sellerDiscount)}` : '—'}</td>
                <td style={{ fontWeight: 600 }}>{tl(l.netTotal)}</td>
                <td>%{l.vatRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
