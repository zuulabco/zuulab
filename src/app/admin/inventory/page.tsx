'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import styles from '../admin.module.css'
import { SkeletonList } from '@/components/common/Skeleton'

interface Channel {
  storeName: string
  marketplaceQuantity: number
  pushedQuantity: number | null
  stockSyncEnabled: boolean
  pushError: string | null
}

interface StockRow {
  productId: string
  productName: string
  sku: string
  category: string
  isActive: boolean
  available: number
  reserved: number
  lowStockThreshold: number
  minimumStock: number
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
  inProduction: number
  channels: Channel[]
  /** Open "gelince haber ver" requests */
  waitingAlerts?: number
}

interface Movement {
  id: string
  productId: string
  productName: string
  previousStock: number
  newStock: number
  quantityChange: number
  reason: string
  changedBy: string
  createdAt: string
  typeLabel?: string
  orderNumber?: string | null
}

type Tab = 'stock' | 'movements'
type StatusFilter = 'ALL' | 'LOW' | 'OUT'

const STATUS_LABEL: Record<StockRow['status'], { text: string; cls: string }> = {
  IN_STOCK: { text: 'Stokta', cls: 'badgeSuccess' },
  LOW_STOCK: { text: 'Az kaldı', cls: 'badgeWarning' },
  OUT_OF_STOCK: { text: 'Tükendi', cls: 'badgeDanger' },
}

const ADJUST_TYPES = [
  { value: 'RESTOCK', label: 'Stok girişi (+)' },
  { value: 'CORRECTION', label: 'Düzeltme (+/−)' },
  { value: 'MANUAL_ADJUSTMENT', label: 'Fire / kayıp (−)' },
]

export default function InventoryPage() {
  const { token, canFetch } = useAuthStore()
  const [tab, setTab] = useState<Tab>('stock')
  const [rows, setRows] = useState<StockRow[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [onlyActive, setOnlyActive] = useState(true)
  const [movementProduct, setMovementProduct] = useState('')

  const [countRow, setCountRow] = useState<StockRow | null>(null)
  const [countValue, setCountValue] = useState('')
  const [adjustRow, setAdjustRow] = useState<StockRow | null>(null)
  const [adjust, setAdjust] = useState({ change: '', type: 'RESTOCK', reason: '' })
  const [saving, setSaving] = useState(false)

  const headers = useCallback(
    (json = false): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }),
    [token]
  )

  const loadStock = useCallback(() => {
    if (!canFetch) return
    fetch('/api/admin/inventory/overview', { headers: headers() })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error)
        setRows(data.inventory)
      })
      .catch((err) => toast.error(err.message || 'Stoklar yüklenemedi.'))
      .finally(() => setLoading(false))
  }, [canFetch, headers])

  const loadMovements = useCallback(() => {
    if (!canFetch) return
    const qs = movementProduct ? `?productId=${encodeURIComponent(movementProduct)}` : ''
    fetch(`/api/admin/inventory/movements${qs}`, { headers: headers() })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error)
        setMovements(data.movements)
      })
      .catch((err) => toast.error(err.message || 'Hareketler yüklenemedi.'))
  }, [canFetch, headers, movementProduct])

  useEffect(() => {
    loadStock()
  }, [loadStock])

  useEffect(() => {
    if (tab === 'movements') loadMovements()
  }, [tab, loadMovements])

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    return rows.filter((r) => {
      if (onlyActive && !r.isActive) return false
      if (statusFilter === 'LOW' && r.status !== 'LOW_STOCK') return false
      if (statusFilter === 'OUT' && r.status !== 'OUT_OF_STOCK') return false
      if (q && !r.productName.toLocaleLowerCase('tr-TR').includes(q) && !r.sku.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, statusFilter, onlyActive])

  const active = rows.filter((r) => r.isActive)
  const kpis = {
    products: active.length,
    units: active.reduce((s, r) => s + Math.max(0, r.available), 0),
    low: active.filter((r) => r.status === 'LOW_STOCK').length,
    out: active.filter((r) => r.status === 'OUT_OF_STOCK').length,
    inProduction: active.reduce((s, r) => s + r.inProduction, 0),
  }

  async function saveCount() {
    if (!countRow) return
    const value = Number(countValue)
    if (countValue.trim() === '' || !Number.isInteger(value) || value < 0) {
      toast.error('0 veya pozitif bir tam sayı girin.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/inventory/set-stock', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ items: [{ productId: countRow.productId, stock: value, expectedStock: countRow.available }], reason: 'Envanter sayımı' }),
      })
      const data = await res.json()
      const r = data.results?.[0]
      if (!data.success || !r) throw new Error(data.error || 'Kaydedilemedi.')
      if (r.status === 'UPDATED' || r.status === 'UNCHANGED') {
        toast.success(`${countRow.productName}: stok ${r.newStock}`)
        setCountRow(null)
      } else {
        toast.error(r.message || 'Kaydedilemedi.')
      }
      loadStock()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  async function saveAdjust() {
    if (!adjustRow) return
    const change = Number(adjust.change)
    if (!Number.isInteger(change) || change === 0) {
      toast.error('Sıfırdan farklı bir tam sayı girin (azaltmak için eksi).')
      return
    }
    if (!adjust.reason.trim()) {
      toast.error('Açıklama girin.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ productId: adjustRow.productId, quantityChange: change, movementType: adjust.type, reason: adjust.reason }),
      })
      const data = await res.json()
      if (data.success === false) throw new Error(data.error || 'Kaydedilemedi.')
      toast.success(`${adjustRow.productName}: stok ${data.newStock}`)
      setAdjustRow(null)
      loadStock()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.adminPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Envanter</h1>
          <p className={styles.pageSubtitle}>
            Satılabilir stok, ödenmemiş siparişlerde bekleyenler, üretimdekiler ve pazaryerlerine giden stok.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/production" className={styles.secondaryButton}>
            Üretim
          </Link>
          <Link href="/admin/products" className={styles.secondaryButton}>
            Toplu stok girişi (Ürünler)
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          ['Aktif ürün', kpis.products],
          ['Raftaki toplam adet', kpis.units],
          ['Az kalan', kpis.low],
          ['Tükenen', kpis.out],
          ['Üretimde', kpis.inProduction],
        ].map(([label, value]) => (
          <div key={label} className={styles.tableCard} style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      <div className={styles.operationalTabs}>
        {(
          [
            ['stock', 'Stok'],
            ['movements', 'Stok hareketleri'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`${styles.operationalTabItem} ${tab === key ? styles.active : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              className={styles.input}
              style={{ width: 260 }}
              placeholder="Ürün adı veya SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className={styles.select} style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="ALL">Tüm durumlar</option>
              <option value="LOW">Az kalanlar</option>
              <option value="OUT">Tükenenler</option>
            </select>
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              Yalnızca satıştaki ürünler
            </label>
          </div>

          <div className={styles.tableCard}>
            {loading ? (
              <SkeletonList rows={5} />
            ) : filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Ürün yok.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th>Satılabilir</th>
                    <th title="Ödemesi bekleyen site siparişleri için ayrılmış">Ödeme bekleyen</th>
                    <th>Üretimde</th>
                    <th>Minimum</th>
                    <th>Pazaryerleri</th>
                    <th style={{ textAlign: 'right' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.productId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          <Link href={`/admin/products/${r.productId}`}>{r.productName}</Link>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {r.sku} · {r.category}
                          {!r.isActive && ' · pasif'}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{r.available}</span>{' '}
                        <span className={`${styles.badge} ${styles[STATUS_LABEL[r.status].cls]}`}>{STATUS_LABEL[r.status].text}</span>
                        {(r.waitingAlerts ?? 0) > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {r.waitingAlerts} kişi gelince haber bekliyor
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{r.reserved || '—'}</td>
                      <td style={{ fontSize: 13 }}>{r.inProduction || '—'}</td>
                      <td style={{ fontSize: 13 }}>{r.minimumStock > 0 ? r.minimumStock : r.lowStockThreshold}</td>
                      <td style={{ fontSize: 11 }}>
                        {r.channels.length === 0
                          ? '—'
                          : r.channels.map((c, i) => (
                              <div key={i} title={c.pushError ?? undefined} style={{ color: c.pushError ? '#dc2626' : undefined }}>
                                {c.storeName}: {c.stockSyncEnabled ? (c.pushedQuantity !== null ? `${c.pushedQuantity} gönderildi` : 'gönderilecek') : `${c.marketplaceQuantity} (gönderim kapalı)`}
                              </div>
                            ))}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => {
                              setCountRow(r)
                              setCountValue('')
                            }}
                          >
                            Sayım gir
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => {
                              setAdjustRow(r)
                              setAdjust({ change: '', type: 'RESTOCK', reason: '' })
                            }}
                          >
                            +/− Düzelt
                          </button>
                          <Link
                            href={`/admin/production/new?productId=${r.productId}`}
                            className={styles.secondaryButton}
                            style={{ padding: '3px 8px', fontSize: 11 }}
                          >
                            Bas
                          </Link>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => {
                              setMovementProduct(r.productId)
                              setTab('movements')
                            }}
                          >
                            Hareketler
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'movements' && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <select className={styles.select} style={{ width: 320 }} value={movementProduct} onChange={(e) => setMovementProduct(e.target.value)}>
              <option value="">Tüm ürünler (son 200 hareket)</option>
              {rows.map((r) => (
                <option key={r.productId} value={r.productId}>
                  {r.productName}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.tableCard}>
            {movements.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Hareket yok.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Ürün</th>
                    <th>Tür</th>
                    <th>Değişim</th>
                    <th>Stok</th>
                    <th>Açıklama</th>
                    <th>Kim</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontSize: 12 }}>{new Date(m.createdAt).toLocaleString('tr-TR')}</td>
                      <td style={{ fontSize: 12 }}>{m.productName}</td>
                      <td style={{ fontSize: 12 }}>{m.typeLabel ?? '—'}</td>
                      <td style={{ fontWeight: 700, color: m.quantityChange > 0 ? '#059669' : '#dc2626' }}>
                        {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {m.previousStock} → {m.newStock}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {m.orderNumber ? (
                          <Link href={`/admin/orders/${m.orderNumber}`}>{m.reason}</Link>
                        ) : (
                          m.reason
                        )}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.changedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <Modal isOpen={Boolean(countRow)} onClose={() => !saving && setCountRow(null)} ariaLabel="Sayım gir" maxWidth={420}>
        {countRow && (
          <div style={{ padding: '8px 4px' }}>
            <h3 style={{ marginTop: 0 }}>{countRow.productName}: sayım</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Rafta saydığınız adedi yazın. Şu an kayıtlı: <strong>{countRow.available}</strong>. Siz yazarken sipariş gelip stok
              değişirse kaydedilmez ve uyarılırsınız.
            </p>
            <input
              type="number"
              min={0}
              step={1}
              autoFocus
              className={styles.formInput}
              value={countValue}
              onChange={(e) => setCountValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveCount()}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setCountRow(null)} disabled={saving}>
                Vazgeç
              </button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveCount} disabled={saving}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(adjustRow)} onClose={() => !saving && setAdjustRow(null)} ariaLabel="Stok düzelt" maxWidth={440}>
        {adjustRow && (
          <div style={{ padding: '8px 4px' }}>
            <h3 style={{ marginTop: 0 }}>{adjustRow.productName}: stok düzelt</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Mevcut stoka ekler veya çıkarır (ör. 5 ya da −2). Stok sıfırın altına inmez.
            </p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Tür</label>
              <select className={styles.select} value={adjust.type} onChange={(e) => setAdjust({ ...adjust, type: e.target.value })}>
                {ADJUST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Adet</label>
              <input type="number" step={1} className={styles.formInput} value={adjust.change} onChange={(e) => setAdjust({ ...adjust, change: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Açıklama</label>
              <input className={styles.formInput} value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} placeholder="Ör. kırık ürün, sayım farkı" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setAdjustRow(null)} disabled={saving}>
                Vazgeç
              </button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveAdjust} disabled={saving}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
