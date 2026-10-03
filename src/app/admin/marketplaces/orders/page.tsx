'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import styles from '../../admin.module.css'
import { SkeletonList } from '@/components/common/Skeleton'

type State = 'ALL' | 'PENDING' | 'IMPORTED'

interface OrderLine {
  lineId: string
  barcode: string
  productName: string
  quantity: number
  netTotal: number
}

interface MarketplaceOrder {
  id: string
  storeName: string
  packageId: string
  externalOrderNumber: string
  status: string
  siteStatus: string | null
  orderDate: string | null
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

interface Store {
  id: string
  name: string
  provider: string
  orderImportEnabled: boolean
  lastSuccessfulSync: string | null
}

const STATE_LABEL: Record<State, string> = { ALL: 'Tümü', PENDING: 'Bekleyen', IMPORTED: 'Aktarılan' }

// Trendyol package statuses in Turkish
const STATUS_LABEL: Record<string, string> = {
  Awaiting: 'Ödeme bekleniyor',
  Created: 'Yeni',
  Picking: 'Hazırlanıyor',
  Invoiced: 'Faturalandı',
  Shipped: 'Kargoda',
  AtCollectionPoint: 'Teslim noktasında',
  UnDelivered: 'Teslim edilemedi',
  Delivered: 'Teslim edildi',
  Cancelled: 'İptal',
  UnSupplied: 'Tedarik edilemedi',
  UnPacked: 'Paket bölündü',
  Returned: 'İade',
}

function tl(value: number): string {
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
}

export default function MarketplaceOrdersPage() {
  const { token, canFetch } = useAuthStore()
  const [orders, setOrders] = useState<MarketplaceOrder[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [state, setState] = useState<State>('ALL')
  const [storeId, setStoreId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const headers = useCallback(
    (json = false): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }),
    [token]
  )

  const load = useCallback(() => {
    if (!canFetch) return
    const params = new URLSearchParams({ state })
    if (storeId) params.set('storeId', storeId)
    if (query.trim()) params.set('q', query.trim())
    fetch(`/api/admin/marketplaces/orders?${params}`, { headers: headers() })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error)
        setOrders(data.orders)
      })
      .catch((err) => toast.error(err.message || 'Siparişler yüklenemedi.'))
      .finally(() => setLoading(false))
  }, [canFetch, state, storeId, query, headers])

  const loadStores = useCallback(() => {
    if (!canFetch) return
    fetch('/api/admin/marketplaces/stores', { headers: headers() })
      .then((res) => res.json())
      .then((data) => data.success && setStores(data.stores))
      .catch(() => {})
  }, [canFetch, headers])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadStores()
  }, [loadStores])

  async function syncNow() {
    const targets = stores.filter((s) => s.provider === 'TRENDYOL' && s.orderImportEnabled && (!storeId || s.id === storeId))
    if (targets.length === 0) {
      toast.error('Sipariş alma açık bir Trendyol mağazası yok.')
      return
    }
    setSyncing(true)
    try {
      for (const store of targets) {
        const res = await fetch(`/api/admin/marketplaces/stores/${store.id}/sync`, { method: 'POST', headers: headers() })
        const data = await res.json()
        const r = data.result
        if (!data.success || !r) toast.error(`${store.name}: ${data.error || 'Sipariş alınamadı.'}`)
        else if (r.status === 'FAILED') toast.error(`${store.name}: ${r.errorMessage}`)
        else
          toast.success(
            `${store.name}: ${r.recordsRead} paket okundu, ${r.recordsCreated} yeni sipariş${r.recordsUpdated ? `, ${r.recordsUpdated} güncellendi` : ''}${r.unmatched ? `, ${r.unmatched} bekliyor` : ''}.`
          )
      }
      load()
      loadStores()
    } finally {
      setSyncing(false)
    }
  }

  async function retryPending() {
    setRetrying(true)
    try {
      const res = await fetch('/api/admin/marketplaces/reconcile-unmatched', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify(storeId ? { storeId } : {}),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      toast.success(`${data.checked} bekleyen paket denendi, ${data.created} sipariş oluşturuldu.`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Yeniden denenemedi.')
    } finally {
      setRetrying(false)
    }
  }

  const pendingCount = orders.filter((o) => !o.orderNumber).length

  return (
    <div className={styles.adminPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Pazaryeri Siparişleri</h1>
          <p className={styles.pageSubtitle}>
            Trendyol paketleri. Ürünleri eşleşen paketler siteye sipariş olarak aktarılır ve stoktan düşer.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/marketplaces/mappings" className={styles.secondaryButton}>
            Ürün eşleştirme
          </Link>
          <button className={styles.secondaryButton} onClick={retryPending} disabled={retrying}>
            {retrying ? 'Deneniyor…' : 'Bekleyenleri yeniden dene'}
          </button>
          <button className={styles.primaryButton} onClick={syncNow} disabled={syncing}>
            {syncing ? 'Alınıyor…' : 'Siparişleri şimdi al'}
          </button>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Son alım:{' '}
        {stores
          .filter((s) => s.provider === 'TRENDYOL')
          .map((s) => `${s.name} ${s.lastSuccessfulSync ? new Date(s.lastSuccessfulSync).toLocaleString('tr-TR') : 'hiç'}`)
          .join(' · ') || '—'}
        . &quot;Bekleyen&quot; paketlerde sitede karşılığı bağlanmamış ürün var; ürünü eşleştirince sipariş oluşur.
        Mağazanın ilk alımında kargolanmış/teslim edilmiş geçmiş siparişler stoka dokunmaz.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div className={styles.operationalTabs} style={{ marginBottom: 0 }}>
          {(Object.keys(STATE_LABEL) as State[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={`${styles.operationalTabItem} ${state === s ? styles.active : ''}`}
            >
              {STATE_LABEL[s]}
              {s === 'PENDING' && state === 'ALL' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>
        <select className={styles.select} style={{ width: 'auto' }} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">Tüm mağazalar</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          style={{ width: 240 }}
          placeholder="Sipariş no, paket no, müşteri"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className={styles.tableCard}>
        {loading ? (
          <SkeletonList rows={5} />
        ) : orders.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            Sipariş yok. &quot;Siparişleri şimdi al&quot; ile son iki haftanın siparişlerini çekebilirsiniz.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Mağaza / Sipariş</th>
                <th>Müşteri</th>
                <th>Ürünler</th>
                <th>Tutar</th>
                <th>Pazaryeri durumu</th>
                <th>Site siparişi</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td style={{ fontSize: 12 }}>{o.orderDate ? new Date(o.orderDate).toLocaleString('tr-TR') : '—'}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      <Link href={`/admin/marketplaces/orders/${o.id}`}>{o.externalOrderNumber}</Link>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {o.storeName} · paket {o.packageId}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>{o.customerName ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {o.lines.map((l) => (
                      <div key={l.lineId}>
                        {l.quantity} × {l.productName}
                      </div>
                    ))}
                  </td>
                  <td style={{ fontSize: 12 }}>{tl(o.totalAmount)}</td>
                  <td style={{ fontSize: 12 }}>
                    {STATUS_LABEL[o.status] ?? o.status}
                    {o.trackingNumber && (
                      <div style={{ fontSize: 11 }}>
                        {o.trackingUrl ? (
                          <a href={o.trackingUrl} target="_blank" rel="noreferrer">
                            {o.cargoProvider ?? 'Kargo'} takip
                          </a>
                        ) : (
                          `${o.cargoProvider ?? 'Kargo'} ${o.trackingNumber}`
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {o.orderNumber ? (
                      <>
                        <Link href={`/admin/orders/${o.orderNumber}`} style={{ fontWeight: 600 }}>
                          {o.orderNumber}
                        </Link>
                        {!o.affectsStock && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>stoka dokunmadı (geçmiş)</div>
                        )}
                      </>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeWarning}`} title={o.lastError ?? ''}>
                        {o.unmatchedCount > 0 ? `${o.unmatchedCount} ürün eşleşmedi` : o.status === 'Awaiting' ? 'Ödeme bekleniyor' : 'Bekliyor'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
