'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import adminStyles from '../../admin.module.css'
import s from '../../analytics/Analytics.module.css'
import { fmtInt } from '../../analytics/charts'
import type { SegmentDefinition, SegmentKey, SegmentSettings } from '@/lib/segments/definitions'
import type { SegmentResult } from '@/lib/services/segments.service'

interface Overview {
  definitions: SegmentDefinition[]
  overview: SegmentResult[]
  products: Array<{ id: string; name: string }>
  collections: Array<{ slug: string; name: string }>
}

const money = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('tr-TR') : '—')

export default function SegmentsPage() {
  const { token, canFetch } = useAuthStore()
  const [data, setData] = useState<Overview | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [selected, setSelected] = useState<SegmentKey | null>(null)
  const [settings, setSettings] = useState<SegmentSettings>({})
  const [detail, setDetail] = useState<SegmentResult | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    if (!canFetch) return
    let cancelled = false
    fetch('/api/admin/segments', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.success) throw new Error(d.error || 'Segmentler alınamadı.')
        setData(d)
        setFailure(null)
      })
      .catch((e: Error) => !cancelled && setFailure(e.message || 'Segmentler alınamadı.'))
    return () => {
      cancelled = true
    }
  }, [canFetch, token])

  const query = useCallback(
    (key: SegmentKey, st: SegmentSettings) => {
      const p = new URLSearchParams({ key })
      for (const [k, v] of Object.entries(st)) if (v !== undefined && v !== '') p.set(k, String(v))
      return p
    },
    []
  )

  useEffect(() => {
    if (!selected || !canFetch) return
    let cancelled = false
    setDetailLoading(true)
    fetch(`/api/admin/segments?${query(selected, settings)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.success) throw new Error(d.error || 'Segment alınamadı.')
        setDetail(d.segment)
        setFailure(null)
      })
      .catch((e: Error) => !cancelled && setFailure(e.message || 'Segment alınamadı.'))
      .finally(() => !cancelled && setDetailLoading(false))
    return () => {
      cancelled = true
    }
  }, [selected, settings, canFetch, token, query])

  const open = (key: SegmentKey) => {
    setSelected(key)
    setSettings({})
    setDetail(null)
  }

  const download = async () => {
    if (!selected) return
    const p = query(selected, settings)
    p.set('format', 'csv')
    const res = await fetch(`/api/admin/segments?${p}`, { headers })
    if (!res.ok) {
      setFailure('Liste indirilemedi.')
      return
    }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `segment-${selected}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const def = data?.definitions.find((d) => d.key === selected)
  const counts = new Map((data?.overview ?? []).map((o) => [o.key, o]))

  return (
    <div className={adminStyles.pageContainer}>
      <header className={adminStyles.pageHeader}>
        <div>
          <h1 className={adminStyles.pageTitle}>Müşteri grupları</h1>
          <p className={adminStyles.pageSubtitle}>
            Müşterilerinizi ve ziyaretçilerinizi davranışlarına göre gruplar. E-posta gönderebileceğiniz kişi sayısı, yalnızca
            ticari e-posta izni vermiş olanları sayar.
          </p>
        </div>
      </header>

      {failure && <div className={s.alert}>{failure}</div>}
      {!data && !failure && <div className={s.loadingBlock}>Veriler yükleniyor…</div>}

      {data && (
        <section className={s.panel}>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Grup</th>
                  <th className={s.num}>Kişi</th>
                  <th className={s.num}>E-posta atılabilir</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.definitions.map((d) => {
                  const c = counts.get(d.key)
                  return (
                    <tr key={d.key} style={selected === d.key ? { background: 'var(--surface-1)' } : undefined}>
                      <td className={s.pathCell} style={{ whiteSpace: 'normal' }}>
                        <strong>{d.label}</strong>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8em' }}>{d.description}</div>
                      </td>
                      <td className={s.num}>{c ? fmtInt(c.total) : '—'}</td>
                      <td className={s.num}>{d.kind === 'visitors' ? 'tanımsız ziyaretçi' : c ? fmtInt(c.reachable) : '—'}</td>
                      <td className={s.num}>
                        <button type="button" className={s.seg} onClick={() => open(d.key)}>
                          {selected === d.key ? 'Açık' : 'Ayrıntı'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && def && (
        <section className={s.panel} style={{ marginTop: '1.5rem' }}>
          <div className={s.panelHead}>
            <div>
              <h2 className={s.panelTitle}>{def.label}</h2>
              <p className={s.panelSub}>{def.description}</p>
            </div>
            {def.kind === 'customers' && (
              <button type="button" className={s.seg} onClick={download} disabled={!detail || detail.reachable === 0}>
                İzinli e-postaları indir (CSV)
              </button>
            )}
          </div>

          {def.params.length > 0 && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0 1rem 1rem' }}>
              {def.params.map((p) => (
                <label key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem' }}>
                  {p.label}
                  {p.key === 'productId' ? (
                    <select value={String(settings.productId ?? '')} onChange={(e) => setSettings({ ...settings, productId: e.target.value })}>
                      <option value="">Seçin…</option>
                      {data.products.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  ) : p.key === 'collectionSlug' ? (
                    <select
                      value={String(settings.collectionSlug ?? '')}
                      onChange={(e) => setSettings({ ...settings, collectionSlug: e.target.value })}
                    >
                      <option value="">Seçin…</option>
                      {data.collections.map((x) => (
                        <option key={x.slug} value={x.slug}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min={p.min}
                      max={p.max}
                      placeholder={String(p.default ?? '')}
                      value={String(settings[p.key] ?? '')}
                      onChange={(e) => setSettings({ ...settings, [p.key]: e.target.value })}
                      style={{ width: 120 }}
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          {detailLoading && !detail && <div className={s.loadingBlock}>Yükleniyor…</div>}
          {detail?.needs && <p className={s.empty}>{detail.needs}</p>}
          {detail && !detail.needs && (
            <>
              <p style={{ padding: '0 1rem' }}>
                <strong>{fmtInt(detail.total)}</strong> {def.kind === 'visitors' ? 'ziyaretçi' : 'kişi'}
                {def.kind === 'customers' && (
                  <>
                    {' '}
                    — <strong>{fmtInt(detail.reachable)}</strong> kişiye ticari e-posta gönderilebilir
                  </>
                )}
              </p>
              {def.kind === 'visitors' && (
                <p className={s.panelSub} style={{ padding: '0 1rem 1rem' }}>
                  Çerezleri kabul etmiş, adı bilinmeyen ziyaretçiler sayılır. Bunlara e-posta gönderilemez. Reklam kitlesi
                  olarak kullanmak için Meta Reklam Yöneticisi’nde Pixel olaylarından kitle kurun (rehber: docs/meta-remarketing.md).
                </p>
              )}
              {def.kind === 'customers' && detail.members.length > 0 && (
                <div className={s.tableScroll}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Kişi</th>
                        <th className={s.num}>Sipariş</th>
                        <th className={s.num}>Harcama</th>
                        <th className={s.num}>Son sipariş</th>
                        <th className={s.num}>E-posta izni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.members.map((m) => (
                        <tr key={m.email}>
                          <td className={s.pathCell}>
                            {m.name ? `${m.name} — ` : ''}
                            {m.email}
                          </td>
                          <td className={s.num}>{m.orders || '—'}</td>
                          <td className={s.num}>{m.spent ? money(m.spent) : '—'}</td>
                          <td className={s.num}>{day(m.lastOrderAt)}</td>
                          <td className={s.num}>{m.reachable ? 'Var' : 'Yok'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {detail.total > detail.members.length && (
                    <p className={s.panelSub} style={{ padding: '0.5rem 1rem' }}>
                      İlk {detail.members.length} kişi gösteriliyor.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
