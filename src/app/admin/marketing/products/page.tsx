'use client'

import { Fragment, useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import adminStyles from '../../admin.module.css'
import s from '../../analytics/Analytics.module.css'
import { BarList, fmtInt } from '../../analytics/charts'
import { changeOf } from '@/lib/analytics/seo'
import type { ProductRow } from '@/lib/analytics/product-insights'
import type { ProductReport } from '@/lib/services/analytics/product-analytics.service'
import SectionTabs from '@/app/admin/SectionTabs'

type Range = 'today' | '7' | '28' | '90'
const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'today', label: 'Bugün' },
  { value: '7', label: 'Son 7 gün' },
  { value: '28', label: 'Son 28 gün' },
  { value: '90', label: 'Son 90 gün' },
]

const pct = (n: number, digits = 1) => `%${(n * 100).toLocaleString('tr-TR', { maximumFractionDigits: digits })}`
const money = (n: number) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`
const money2 = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
const rate = (n: number | null) => (n === null ? '—' : pct(n))

function Change({ current, previous }: { current: number; previous: number | undefined }) {
  const c = changeOf(current, previous)
  if (c === null || Math.abs(c) < 0.005) return null
  return (
    <span className={c > 0 ? s.deltaUp : s.deltaDown} style={{ marginLeft: 6, fontSize: '0.75em' }}>
      {c > 0 ? '▲' : '▼'} {pct(Math.abs(c), 0)}
    </span>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>{title}</h2>
          {subtitle && <p className={s.panelSub}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

const sourceName = (x: { source: string; medium: string; campaign: string }) => [x.source, x.medium, x.campaign].filter(Boolean).join(' / ')

/** A short list of products with the reason they are listed */
function OpportunityList({ rows, reason, empty }: { rows: ProductRow[]; reason: (r: ProductRow) => string; empty: string }) {
  if (rows.length === 0) return <p className={s.empty}>{empty}</p>
  return (
    <div className={s.tableScroll}>
      <table className={s.table}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.productId}>
              <td className={s.pathCell}>{r.name}</td>
              <td className={s.num} style={{ whiteSpace: 'normal' }}>
                {reason(r)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ProductAnalyticsPage() {
  const { token, canFetch } = useAuthStore()
  const [range, setRange] = useState<Range>('28')
  const [report, setReport] = useState<ProductReport | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [loadedRange, setLoadedRange] = useState<Range | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const loading = loadedRange !== range

  useEffect(() => {
    if (!canFetch) return
    let cancelled = false
    fetch(`/api/admin/insights/products?range=${range}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.success) throw new Error(d.error || 'Ürün verileri alınamadı.')
        setReport(d.report)
        setFailure(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setFailure(e.message || 'Ürün verileri alınamadı.')
      })
      .finally(() => {
        if (!cancelled) setLoadedRange(range)
      })
    return () => {
      cancelled = true
    }
  }, [canFetch, token, range])

  const cur = report?.current
  const before = new Map((report?.previous.products ?? []).map((p) => [p.productId, p]))

  return (
    <div className={adminStyles.pageContainer}>
      <SectionTabs />
      <header className={adminStyles.pageHeader}>
        <div>
          <h1 className={adminStyles.pageTitle}>Ürün performansı</h1>
          <p className={adminStyles.pageSubtitle}>
            Her ürün ilk görülmeden satışa kadar nasıl ilerliyor, hangileri ilgi görüyor ama satmıyor, hangileri daha çok
            gösterilmeyi hak ediyor.
          </p>
        </div>
        <div className={s.toolbar}>
          <div className={s.segmented} role="group" aria-label="Tarih aralığı">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={range === r.value ? s.segActive : s.seg}
                aria-pressed={range === r.value}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {failure && <div className={s.alert}>{failure}</div>}
      {loading && !report && <div className={s.loadingBlock}>Veriler yükleniyor…</div>}

      {cur && (
        <>
          <p className={s.note}>
            Görüntüleme, sepet ve ödeme sayıları yalnızca çerez bandında “tümünü kabul et” diyen ziyaretçileri kapsar. Adet ve ciro
            tüm siparişleri kapsar. Dönüşüm, satın alan takip edilen ziyaretçilerin o ürünü görenlere oranıdır.
          </p>

          <div className={s.grid2}>
            <Panel title="En çok görüntülenen" subtitle="Ürünü gören ziyaretçi sayısı">
              <BarList rows={cur.rankings.mostViewed.map((p) => ({ label: p.name, value: p.viewers }))} empty="Henüz görüntüleme verisi yok." />
            </Panel>
            <Panel title="En çok sepete eklenen" subtitle="Sepete ekleyen ziyaretçi sayısı">
              <BarList rows={cur.rankings.mostAddedToCart.map((p) => ({ label: p.name, value: p.cartAdders }))} empty="Henüz sepete ekleme verisi yok." />
            </Panel>
          </div>
          <Panel title="En çok satan" subtitle="Satılan adet">
            <BarList rows={cur.rankings.bestSelling.map((p) => ({ label: p.name, value: p.units, hint: money(p.revenue) }))} empty="Bu dönemde satış yok." />
          </Panel>

          <h2 className={s.sectionTitle}>Fırsatlar</h2>
          <div className={s.grid2}>
            <Panel title="Çok bakılıyor ama satmıyor" subtitle="Fiyatı, fotoğrafları, açıklaması veya stok durumu gözden geçirilebilir">
              <OpportunityList
                rows={cur.opportunities.highViewsLowSales}
                reason={(r) => `${fmtInt(r.viewers)} kişi gördü · ${r.units === 0 ? 'hiç satmadı' : `dönüşüm ${rate(r.conversionRate)}`}`}
                empty="Şu an böyle bir ürün yok ya da henüz yeterli veri birikmedi."
              />
            </Panel>
            <Panel title="Az görülüyor ama iyi satıyor" subtitle="Daha çok kişiye göstermek (reklam, ana sayfa, koleksiyon) getiri sağlayabilir">
              <OpportunityList
                rows={cur.opportunities.highSalesLowTraffic}
                reason={(r) => `dönüşüm ${rate(r.conversionRate)} · yalnızca ${fmtInt(r.viewers)} kişi gördü`}
                empty="Şu an böyle bir ürün yok ya da henüz yeterli veri birikmedi."
              />
            </Panel>
          </div>

          <h2 className={s.sectionTitle}>Tüm ürünler</h2>
          {cur.products.length === 0 ? (
            <p className={s.empty}>Bu dönemde görüntülenen veya satılan ürün yok.</p>
          ) : (
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th className={s.num}>Gören</th>
                    <th className={s.num}>Sepete ekleyen</th>
                    <th className={s.num}>Ödemeye geçen</th>
                    <th className={s.num}>Satış (adet)</th>
                    <th className={s.num}>Ciro</th>
                    <th className={s.num}>Ort. fiyat</th>
                    <th className={s.num}>Dönüşüm</th>
                  </tr>
                </thead>
                <tbody>
                  {cur.products.map((p) => {
                    const prev = before.get(p.productId)
                    const isOpen = open === p.productId
                    return (
                      <Fragment key={p.productId}>
                        <tr onClick={() => setOpen(isOpen ? null : p.productId)} style={{ cursor: 'pointer' }} aria-expanded={isOpen}>
                          <td className={s.pathCell}>
                            <span aria-hidden style={{ opacity: 0.5, marginRight: 6 }}>{isOpen ? '▾' : '▸'}</span>
                            {p.name}
                          </td>
                          <td className={s.num}>
                            {fmtInt(p.viewers)}
                            <Change current={p.viewers} previous={prev?.viewers} />
                          </td>
                          <td className={s.num}>{fmtInt(p.cartAdders)}</td>
                          <td className={s.num}>{fmtInt(p.checkoutStarters)}</td>
                          <td className={s.num}>
                            {fmtInt(p.units)}
                            <Change current={p.units} previous={prev?.units} />
                          </td>
                          <td className={s.num}>
                            {money(p.revenue)}
                            <Change current={p.revenue} previous={prev?.revenue} />
                          </td>
                          <td className={s.num}>{p.averagePrice === null ? '—' : money2(p.averagePrice)}</td>
                          <td className={s.num}>{rate(p.conversionRate)}</td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={8} style={{ background: 'var(--surface-1, rgba(0,0,0,0.03))' }}>
                              <p className={s.kpiHint} style={{ margin: '4px 0' }}>
                                Görenlerin sepete ekleme oranı {rate(p.viewToCart)} · sepete ekleyenlerin ödemeye geçme oranı{' '}
                                {rate(p.cartToCheckout)} · toplam {fmtInt(p.views)} görüntüleme · {fmtInt(p.orders)} sipariş
                              </p>
                              {p.sources.length === 0 ? (
                                <p className={s.kpiHint} style={{ margin: '4px 0' }}>
                                  Bu ürünün satışlarından hiçbiri bir kampanya bağlantısından gelmedi (ya da bağlantıda utm bilgisi yoktu).
                                </p>
                              ) : (
                                <table className={s.table}>
                                  <thead>
                                    <tr>
                                      <th>Hangi kaynaktan satıldı</th>
                                      <th className={s.num}>Sipariş</th>
                                      <th className={s.num}>Adet</th>
                                      <th className={s.num}>Ciro</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.sources.map((x) => (
                                      <tr key={sourceName(x)}>
                                        <td className={s.pathCell}>{sourceName(x)}</td>
                                        <td className={s.num}>{fmtInt(x.orders)}</td>
                                        <td className={s.num}>{fmtInt(x.units)}</td>
                                        <td className={s.num}>{money(x.revenue)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className={s.footnote}>
            Dönem: {cur.period.start} – {cur.period.end} · karşılaştırma: {report!.previous.period.start} – {report!.previous.period.end}. Fırsat
            listeleri en az 10 kişinin gördüğü ürünleri değerlendirir; az veriyle yorum yapılmaz.
          </p>
        </>
      )}
    </div>
  )
}
