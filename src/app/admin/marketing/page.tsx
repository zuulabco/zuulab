'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import adminStyles from '../admin.module.css'
import s from '../analytics/Analytics.module.css'
import { BarList, LineChart, fmtInt } from '../analytics/charts'
import { changeOf } from '@/lib/analytics/seo'
import type { InternalMetrics, InternalReport } from '@/lib/services/analytics/internal-analytics.service'
import type { SeoReport } from '@/lib/services/analytics/seo-report.service'

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
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })

function Kpi({
  label,
  value,
  current,
  previous,
  lowerIsBetter,
  hint,
}: {
  label: string
  value: string
  current?: number | null
  previous?: number | null
  lowerIsBetter?: boolean
  hint?: string
}) {
  const c = current !== undefined && current !== null ? changeOf(current, previous) : null
  const good = c !== null && (lowerIsBetter ? c < 0 : c > 0)
  return (
    <div className={s.kpi}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue}>{value}</span>
      {c !== null && Math.abs(c) >= 0.005 ? (
        <span className={good ? s.deltaUp : s.deltaDown}>
          {c > 0 ? '▲' : '▼'} {pct(Math.abs(c), 0)} <span className={s.deltaNote}>önceki döneme göre</span>
        </span>
      ) : (
        hint && <span className={s.kpiHint}>{hint}</span>
      )}
    </div>
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

/** A channel that is not connected yet: said plainly instead of showing zeros that look like results */
function ChannelCard({ title, status, children }: { title: string; status: 'live' | 'soon'; children: React.ReactNode }) {
  return (
    <div className={s.kpi} style={{ gap: 6, opacity: status === 'soon' ? 0.75 : 1 }}>
      <span className={s.kpiLabel}>
        {title} {status === 'soon' && <em style={{ fontStyle: 'normal', opacity: 0.7 }}>· henüz bağlı değil</em>}
      </span>
      {children}
    </div>
  )
}

function Funnel({ m }: { m: InternalMetrics }) {
  const first = m.funnel[0]?.visitors ?? 0
  if (first === 0) return <p className={s.empty}>Henüz çerezi kabul eden ziyaretçi verisi yok.</p>
  return (
    <ol className={s.funnel}>
      {m.funnel.map((step, i) => (
        <li key={step.key} className={s.funnelStep}>
          <div className={s.funnelHead}>
            <span>{step.label}</span>
            <span className={s.funnelNums}>
              <strong>{fmtInt(step.visitors)}</strong>
              {i > 0 && <em>{step.ofPrevious === null ? '—' : pct(step.ofPrevious)} önceki adımdan</em>}
            </span>
          </div>
          <div className={s.barTrack}>
            <span className={s.barFill} style={{ width: `${Math.max(2, (step.visitors / first) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function MarketingOverviewPage() {
  const { token, canFetch } = useAuthStore()
  const [range, setRange] = useState<Range>('28')
  const [report, setReport] = useState<InternalReport | null>(null)
  const [seo, setSeo] = useState<SeoReport | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [loadedRange, setLoadedRange] = useState<Range | null>(null)
  const loading = loadedRange !== range

  useEffect(() => {
    if (!canFetch) return
    let cancelled = false
    const headers = { Authorization: `Bearer ${token}` }
    // The shop's own numbers are the page; Google is an extra that may be missing or slow
    const own = fetch(`/api/admin/insights?range=${range}`, { headers, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error || 'Pazarlama verileri alınamadı.')
        if (!cancelled) {
          setReport(d.report)
          setFailure(null)
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setFailure(e.message || 'Pazarlama verileri alınamadı.')
      })
    const google = fetch(`/api/admin/seo?range=${range}`, { headers, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSeo(d.success ? d.report : null)
      })
      .catch(() => {
        if (!cancelled) setSeo(null)
      })
    Promise.all([own, google]).finally(() => {
      if (!cancelled) setLoadedRange(range)
    })
    return () => {
      cancelled = true
    }
  }, [canFetch, token, range])

  const cur = report?.current
  const prev = report?.previous
  const gsc = seo?.gsc?.totals.data

  return (
    <div className={adminStyles.pageContainer}>
      <header className={adminStyles.pageHeader}>
        <div>
          <h1 className={adminStyles.pageTitle}>Pazarlama</h1>
          <p className={adminStyles.pageSubtitle}>
            Sitenin durumu tek bakışta: satış, ziyaretçi, huni ve hangi kaynaktan geldiği. Her sayı bir önceki aynı uzunluktaki
            dönemle karşılaştırılır.
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

      {cur && prev && (
        <>
          <section className={s.kpis} aria-label="Özet">
            <Kpi label="Ciro" value={money(cur.revenue)} current={cur.revenue} previous={prev.revenue} hint="ödenen siparişler, kargo dahil" />
            <Kpi label="Sipariş" value={fmtInt(cur.orders)} current={cur.orders} previous={prev.orders} />
            <Kpi
              label="Ortalama sepet"
              value={cur.averageOrderValue === null ? '—' : money2(cur.averageOrderValue)}
              current={cur.averageOrderValue}
              previous={prev.averageOrderValue}
              hint="sipariş başına"
            />
            <Kpi label="Ziyaretçi" value={fmtInt(cur.visitors)} current={cur.visitors} previous={prev.visitors} hint="çerezi kabul edenler" />
            <Kpi
              label="Dönüşüm oranı"
              value={cur.conversionRate === null ? '—' : pct(cur.conversionRate, 2)}
              current={cur.conversionRate}
              previous={prev.conversionRate}
              hint="ziyaretçilerin kaçı satın aldı"
            />
            <Kpi
              label="Sepet terk oranı"
              value={cur.cartAbandonmentRate === null ? '—' : pct(cur.cartAbandonmentRate, 0)}
              current={cur.cartAbandonmentRate}
              previous={prev.cartAbandonmentRate}
              lowerIsBetter
              hint="sepete ekleyip almayanlar"
            />
          </section>

          {cur.orders > 0 && cur.trackedOrderShare !== null && cur.trackedOrderShare < 1 && (
            <p className={s.note}>
              Ziyaretçi, dönüşüm ve terk oranı yalnızca çerez bandında “tümünü kabul et” diyenleri kapsar (bu dönemde siparişlerin{' '}
              {pct(cur.trackedOrderShare, 0)} kadarı bu gruptan geldi). Ciro ve sipariş sayısı ise tüm siparişleri kapsar.
            </p>
          )}

          <div className={s.grid2}>
            <Panel title="Günlük ciro" subtitle={`${cur.period.start} – ${cur.period.end}`}>
              <LineChart points={cur.days.map((d) => ({ label: dayLabel(d.day), value: d.revenue }))} valueLabel="₺" format={money} />
            </Panel>
            <Panel title="Satış hunisi" subtitle="Ziyaretçiler hangi adımda kalıyor?">
              <Funnel m={cur} />
            </Panel>
          </div>

          <div className={s.grid2}>
            <Panel title="En çok kazandıran ürünler" subtitle="Ciroya göre">
              <BarList
                rows={cur.products.slice(0, 6).map((p) => ({
                  label: p.name,
                  value: p.revenue,
                  hint: `${p.units} adet · ${p.viewers} görüntüleme${p.conversionRate === null ? '' : ` · dönüşüm ${pct(p.conversionRate)}`}`,
                }))}
                format={money}
                empty="Bu dönemde satış yok."
              />
            </Panel>
            <Panel title="Trafik kaynakları" subtitle="Reklam ve kampanya bağlantılarından gelenler">
              {cur.sources.length === 0 ? (
                <p className={s.empty}>
                  Henüz kampanya kaynaklı ziyaret yok. Reklam bağlantılarına utm_source, utm_medium ve utm_campaign eklendiğinde
                  burada görünür.
                </p>
              ) : (
                <div className={s.tableScroll}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Kaynak</th>
                        <th className={s.num}>Ziyaretçi</th>
                        <th className={s.num}>Sipariş</th>
                        <th className={s.num}>Ciro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cur.sources.slice(0, 8).map((src) => (
                        <tr key={`${src.source}/${src.medium}/${src.campaign}`}>
                          <td className={s.pathCell}>{[src.source, src.medium, src.campaign].filter(Boolean).join(' / ')}</td>
                          <td className={s.num}>{fmtInt(src.visitors)}</td>
                          <td className={s.num}>{fmtInt(src.orders)}</td>
                          <td className={s.num}>{money(src.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <h2 className={s.sectionTitle}>Kanallar</h2>
          <section className={s.kpis} aria-label="Kanallar">
            <ChannelCard title="Google arama" status={gsc ? 'live' : 'soon'}>
              {gsc ? (
                <>
                  <span className={s.kpiValue}>{fmtInt(gsc.current.clicks)} tıklama</span>
                  <span className={s.kpiHint}>
                    {fmtInt(gsc.current.impressions)} gösterim · ortalama sıra{' '}
                    {gsc.current.impressions ? gsc.current.position.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '—'}
                  </span>
                  <Link href="/seo">SEO ayrıntıları →</Link>
                </>
              ) : (
                <span className={s.kpiHint}>Search Console verisi alınamadı. Kurulum için Analitik sayfasına bakın.</span>
              )}
            </ChannelCard>
            <ChannelCard title="Meta reklamları" status="soon">
              <span className={s.kpiHint}>
                Pixel ve sunucu olayları çalışıyor. Reklam harcaması, ROAS ve reklam bazlı satış, Meta reklam hesabı bağlandığında
                görünecek.
              </span>
            </ChannelCard>
            <ChannelCard title="E-posta" status="soon">
              <span className={s.kpiHint}>Gönderim, açılma ve tıklama rakamları e-posta merkezi eklendiğinde görünecek.</span>
            </ChannelCard>
          </section>

          <p className={s.footnote}>
            Rakamlar kendi veritabanımızdan hesaplanır, Google veya Meta’ya bağlı değildir. Günler Türkiye saatine göredir; bir sipariş
            verildiği günün dönemine yazılır. Ayrıntılı Google verileri için <Link href="/analytics">Analitik</Link> ve{' '}
            <Link href="/seo">SEO</Link> sayfalarına bakın.
          </p>
        </>
      )}
    </div>
  )
}
