'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import styles from '../../admin.module.css'

type Filter = 'UNMAPPED' | 'MAPPED' | 'IGNORED' | 'ALL'

interface Suggestion {
  productId: string
  name: string
  sku: string
  score: number
}

interface Listing {
  id: string
  storeId: string
  storeName: string
  barcode: string
  stockCode: string | null
  productMainId: string | null
  title: string
  categoryName: string | null
  imageUrl: string | null
  productUrl: string | null
  salePrice: number
  listPrice: number
  quantity: number
  onSale: boolean
  productId: string | null
  productName: string | null
  productSku: string | null
  matchMethod: string | null
  ignored: boolean
  targetSalePrice: number | null
  targetListPrice: number | null
  suggestions: Suggestion[]
}

interface SiteProduct {
  id: string
  name: string
  sku: string
  isActive: boolean
}

interface Store {
  id: string
  name: string
  provider: string
  hasCredentials: boolean
}

const FILTER_LABEL: Record<Filter, string> = {
  UNMAPPED: 'Eşleşmemiş',
  MAPPED: 'Eşleşmiş',
  IGNORED: 'Yoksayılan',
  ALL: 'Tümü',
}

const METHOD_LABEL: Record<string, string> = {
  MODEL_CODE: 'Model kodu',
  BARCODE: 'Barkod',
  SKU: 'Stok kodu',
  MANUAL: 'Elle',
  IMPORT: 'Aktarıldı',
}

function tl(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} TL`
}

export default function MarketplaceMappingsPage() {
  const { token, canFetch } = useAuthStore()
  const [stores, setStores] = useState<Store[]>([])
  const [storeId, setStoreId] = useState('')
  const [filter, setFilter] = useState<Filter>('UNMAPPED')
  const [listings, setListings] = useState<Listing[]>([])
  const [products, setProducts] = useState<SiteProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})

  const headers = useCallback(
    (json = false): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }),
    [token]
  )

  const load = useCallback(() => {
    if (!canFetch) return
    const params = new URLSearchParams({ filter })
    if (storeId) params.set('storeId', storeId)
    fetch(`/api/admin/marketplaces/listings?${params}`, { headers: headers() })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error)
        setListings(data.listings)
        setProducts(data.products)
        setSelected(new Set())
      })
      .catch((err) => toast.error(err.message || 'Ürünler yüklenemedi.'))
      .finally(() => setLoading(false))
  }, [canFetch, filter, storeId, headers])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!canFetch) return
    fetch('/api/admin/marketplaces/stores', { headers: headers() })
      .then((res) => res.json())
      .then((data) => data.success && setStores(data.stores))
      .catch(() => {})
  }, [canFetch, headers])

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/marketplaces/listings/refresh', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify(storeId ? { storeId } : {}),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      const names = new Map(stores.map((s) => [s.id, s.name]))
      for (const r of data.results) {
        const name = names.get(r.storeId) ?? r.storeId
        if (r.error) toast.error(`${name}: ${r.error}`)
        else
          toast.success(
            `${name}: ${r.fetched} ürün okundu (${r.created} yeni${r.archived ? `, ${r.archived} yayından kalkmış` : ''}${r.autoMapped ? `, ${r.autoMapped} otomatik eşleşti` : ''}).`
          )
      }
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ürünler okunamadı.')
    } finally {
      setRefreshing(false)
    }
  }

  async function patch(listing: Listing, body: Record<string, unknown>, success?: string) {
    setBusyId(listing.id)
    try {
      const res = await fetch(`/api/admin/marketplaces/listings/${listing.id}`, {
        method: 'PATCH',
        headers: headers(true),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      if (success) toast.success(success)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşlem başarısız.')
    } finally {
      setBusyId(null)
    }
  }

  function link(listing: Listing, productId: string) {
    if (!productId) return
    const name = products.find((p) => p.id === productId)?.name ?? ''
    patch(listing, { action: 'map', productId, applyToModel: true }, `"${listing.title}" → "${name}" bağlandı.`)
  }

  function savePrice(listing: Listing) {
    const draft = priceDrafts[listing.id]
    if (draft === undefined) return
    const value = draft.trim() === '' ? null : Number(draft.replace(',', '.'))
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      toast.error('Geçerli bir fiyat girin.')
      return
    }
    if (value === listing.targetSalePrice) return
    patch(listing, { action: 'price', salePrice: value, listPrice: value !== null ? Math.max(value, listing.targetListPrice ?? value) : null }, 'Mağaza fiyatı kaydedildi.')
    setPriceDrafts((d) => {
      const next = { ...d }
      delete next[listing.id]
      return next
    })
  }

  async function importSelected() {
    if (selected.size === 0) return
    setImporting(true)
    try {
      const res = await fetch('/api/admin/marketplaces/listings/import', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ listingIds: [...selected] }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      if (data.created.length) {
        toast.success(
          `${data.created.length} ürün siteye taslak olarak eklendi. Stok 0; fiyat, kategori ve stoku kontrol edip yayına alın.`,
          8000
        )
      }
      for (const s of data.skipped) toast.error(`${s.title}: ${s.reason}`)
      if (data.imageWarnings.length) toast.error(`${data.imageWarnings.length} görsel kopyalanamadı: ${data.imageWarnings[0]}`, 8000)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aktarım başarısız.')
    } finally {
      setImporting(false)
    }
  }

  const selectable = useMemo(() => listings.filter((l) => !l.productId && !l.ignored), [listings])
  const allSelected = selectable.length > 0 && selectable.every((l) => selected.has(l.id))
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className={styles.adminPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Pazaryeri Ürün Eşleştirme</h1>
          <p className={styles.pageSubtitle}>
            Pazaryerindeki ürünlerinizi site ürünlerine bağlayın. Stok, fiyat ve siparişler bu bağlantı üzerinden yürür.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/admin/marketplaces" className={styles.secondaryButton}>
            Mağazalar
          </Link>
          <button className={styles.primaryButton} onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Okunuyor…' : 'Ürünleri pazaryerinden çek'}
          </button>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Aynı model koduna sahip ürünler (farklı mağazalardaki aynı ürün) tek site ürününe birlikte bağlanır. Barkod,
        stok kodu veya model kodu birebir tutan ürünler otomatik eşleşir; isim benzerliği yalnızca öneri olarak
        gösterilir. Sitede karşılığı olmayan ürünleri seçip <strong>siteye aktarabilirsiniz</strong>: taslak olarak,
        stok 0 ile eklenir. &quot;Mağaza fiyatı&quot; o mağazaya gönderilecek fiyattır.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div className={styles.operationalTabs} style={{ marginBottom: 0 }}>
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`${styles.operationalTabItem} ${filter === f ? styles.active : ''}`}
            >
              {FILTER_LABEL[f]}
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
        {selected.size > 0 && (
          <button className={styles.primaryButton} onClick={importSelected} disabled={importing}>
            {importing ? 'Aktarılıyor… (görseller kopyalanıyor)' : `Seçilenleri siteye aktar (${selected.size})`}
          </button>
        )}
      </div>

      <div className={styles.tableCard}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Yükleniyor…</div>
        ) : listings.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            {filter === 'UNMAPPED'
              ? 'Eşleşmemiş ürün yok. Henüz çekmediyseniz "Ürünleri pazaryerinden çek" düğmesine basın.'
              : 'Kayıt yok.'}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input
                    type="checkbox"
                    aria-label="Tümünü seç"
                    checked={allSelected}
                    disabled={selectable.length === 0}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((l) => l.id)))}
                  />
                </th>
                <th>Pazaryeri ürünü</th>
                <th>Mağaza</th>
                <th>Pazaryeri fiyatı / stok</th>
                <th>Mağaza fiyatı</th>
                <th style={{ minWidth: 260 }}>Site ürünü</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => {
                const busy = busyId === l.id
                return (
                  <tr key={l.id} style={{ opacity: l.ignored ? 0.55 : 1 }}>
                    <td>
                      {!l.productId && !l.ignored && (
                        <input type="checkbox" aria-label="Seç" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {l.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.imageUrl} alt="" width={44} height={44} style={{ objectFit: 'cover', borderRadius: 4 }} />
                        ) : (
                          <div style={{ width: 44, height: 44, background: 'var(--surface-2)', borderRadius: 4 }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {l.productUrl ? (
                              <a href={l.productUrl} target="_blank" rel="noreferrer">
                                {l.title}
                              </a>
                            ) : (
                              l.title
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Barkod <code>{l.barcode}</code>
                            {l.productMainId && (
                              <>
                                {' · '}Model <code>{l.productMainId}</code>
                              </>
                            )}
                            {!l.onSale && ' · satışta değil'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{l.storeName}</td>
                    <td style={{ fontSize: 12 }}>
                      {tl(l.salePrice)}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>stok {l.quantity}</div>
                    </td>
                    <td>
                      <input
                        className={styles.input}
                        style={{ width: 96, padding: '4px 8px', fontSize: 12 }}
                        inputMode="decimal"
                        placeholder="—"
                        value={priceDrafts[l.id] ?? (l.targetSalePrice ?? '').toString()}
                        onChange={(e) => setPriceDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                        onBlur={() => savePrice(l)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        disabled={busy}
                        aria-label="Mağaza fiyatı"
                      />
                    </td>
                    <td>
                      {l.productId ? (
                        <div style={{ fontSize: 12 }}>
                          <Link href={`/admin/products/${l.productId}`} style={{ fontWeight: 600 }}>
                            {l.productName}
                          </Link>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {l.productSku} · {METHOD_LABEL[l.matchMethod ?? ''] ?? l.matchMethod}
                          </div>
                        </div>
                      ) : l.ignored ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Yoksayıldı</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {l.suggestions.map((s) => (
                            <button
                              key={s.productId}
                              type="button"
                              className={styles.secondaryButton}
                              style={{ padding: '2px 8px', fontSize: 11, textAlign: 'left' }}
                              disabled={busy}
                              onClick={() => link(l, s.productId)}
                              title="Bu ürüne bağla"
                            >
                              Öneri: {s.name} (%{Math.round(s.score * 100)})
                            </button>
                          ))}
                          <select
                            className={styles.select}
                            style={{ fontSize: 12, padding: '4px 8px' }}
                            value=""
                            disabled={busy}
                            onChange={(e) => link(l, e.target.value)}
                            aria-label="Site ürünü seç"
                          >
                            <option value="">Site ürünü seç…</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.sku}){p.isActive ? '' : ' · pasif'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {l.productId ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          disabled={busy}
                          onClick={() => patch(l, { action: 'map', productId: null }, 'Bağlantı kaldırıldı.')}
                        >
                          Bağlantıyı kaldır
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          disabled={busy}
                          onClick={() => patch(l, { action: 'ignore', ignored: !l.ignored })}
                          title="Bu ürün sitede satılmayacaksa yoksayın; stok/fiyat gönderilmez."
                        >
                          {l.ignored ? 'Geri al' : 'Yoksay'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
