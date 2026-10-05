'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import adminStyles from '../admin.module.css'
import s from '../analytics/Analytics.module.css'
import { LineChart, fmtInt } from '../analytics/charts'
import { changeOf, countryName, pageKind, pathOfUrl, type GscRow, type SeoRow } from '@/lib/analytics/seo'
import type { SeoReport } from '@/lib/services/analytics/seo-report.service'

type Range = '7' | '28' | '90'
const RANGES: Array<{ value: Range; label: string }> = [
  { value: '7', label: 'Son 7 gün' },
  { value: '28', label: 'Son 28 gün' },
  { value: '90', label: 'Son 90 gün' },
]

const DEVICES: Record<string, string> = { MOBILE: 'Mobil', DESKTOP: 'Masaüstü', TABLET: 'Tablet' }
const KINDS = { product: 'Ürün', category: 'Kategori', collection: 'Koleksiyon', home: 'Ana sayfa', other: 'Sayfa' } as const

type Opportunities = NonNullable<NonNullable<SeoReport['gsc']>['opportunities']['data']>

const pct = (n: number, digits = 1) => `%${(n * 100).toLocaleString('tr-TR', { maximumFractionDigits: digits })}`
const pos = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })

/** "▲ %12" next to a number; for the average position a smaller number is the improvement */
function Change({ current, previous, lowerIsBetter }: { current: number; previous: number | null | undefined; lowerIsBetter?: boolean }) {
  const c = changeOf(current, previous)
  if (c === null || Math.abs(c) < 0.005) return null
  const good = lowerIsBetter ? c < 0 : c > 0
  return (
    <span className={good ? s.deltaUp : s.deltaDown} style={{ marginLeft: 6, fontSize: '0.75em' }}>
      {c > 0 ? '▲' : '▼'} {pct(Math.abs(c), 0)}
    </span>
  )
}

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
  current?: number
  previous?: number
  lowerIsBetter?: boolean
  hint?: string
}) {
  const c = current !== undefined ? changeOf(current, previous) : null
  const good = c !== null && (lowerIsBetter ? c < 0 : c > 0)
  return (
    <div className={s.kpi}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue}>{value}</span>
      {c !== null ? (
        <span className={good ? s.deltaUp : s.deltaDown}>
          {c > 0 ? '▲' : '▼'} {pct(Math.abs(c), 0)} <span className={s.deltaNote}>önceki döneme göre</span>
        </span>
      ) : (
        hint && <span className={s.kpiHint}>{hint}</span>
      )}
    </div>
  )
}

function Panel({ title, subtitle, error, children }: { title: string; subtitle?: string; error?: { message: string }; children: React.ReactNode }) {
  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>{title}</h2>
          {subtitle && <p className={s.panelSub}>{subtitle}</p>}
        </div>
      </div>
      {error ? <p className={s.note}>Bu rapor Google’dan alınamadı; biraz sonra Yenile’ye basın.</p> : children}
    </section>
  )
}

function SeoTable({
  rows,
  first,
  label,
  empty = 'Henüz veri yok.',
}: {
  rows: SeoRow[]
  first: string
  label?: (row: SeoRow) => React.ReactNode
  empty?: string
}) {
  if (rows.length === 0) return <p className={s.empty}>{empty}</p>
  return (
    <div className={s.tableScroll}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>{first}</th>
            <th className={s.num}>Tıklama</th>
            <th className={s.num}>Gösterim</th>
            <th className={s.num}>Tıklama oranı</th>
            <th className={s.num}>Sıra</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className={s.pathCell}>{label ? label(r) : r.key}</td>
              <td className={s.num}>
                {fmtInt(r.clicks)}
                <Change current={r.clicks} previous={r.previous?.clicks} />
              </td>
              <td className={s.num}>{fmtInt(r.impressions)}</td>
              <td className={s.num}>{pct(r.ctr)}</td>
              <td className={s.num}>
                {pos(r.position)}
                <Change current={r.position} previous={r.previous?.position} lowerIsBetter />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const pageLabel = (r: SeoRow) => {
  const path = pathOfUrl(r.key)
  return (
    <>
      <span style={{ opacity: 0.6 }}>{KINDS[pageKind(path)]} · </span>
      {path}
    </>
  )
}

function MoverList({ movers, empty }: { movers: Opportunities['rising']; empty: string }) {
  if (movers.length === 0) return <p className={s.empty}>{empty}</p>
  return (
    <div className={s.tableScroll}>
      <table className={s.table}>
        <tbody>
          {movers.map(({ row, clickChange }) => (
            <tr key={row.slug}>
              <td className={s.pathCell}>{row.name}</td>
              <td className={s.num}>
                <span className={clickChange > 0 ? s.deltaUp : s.deltaDown}>
                  {clickChange > 0 ? '▲ +' : '▼ '}
                  {fmtInt(clickChange)} tıklama
                </span>
              </td>
              <td className={s.num}>{fmtInt(row.clicks)} şimdi</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SeoPage() {
  const { token, canFetch } = useAuthStore()
  const [range, setRange] = useState<Range>('28')
  const [report, setReport] = useState<SeoReport | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [refreshes, setRefreshes] = useState(0)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const key = `${range}:${refreshes}`
  const loading = loadedKey !== key

  useEffect(() => {
    if (!canFetch) return
    let cancelled = false
    fetch(`/api/admin/seo?range=${range}${refreshes > 0 ? '&fresh=1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (!data.success) throw new Error(data.error || 'SEO verileri alınamadı.')
        setReport(data.report)
        setFailure(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setFailure(e.message || 'SEO verileri alınamadı.')
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(`${range}:${refreshes}`)
      })
    return () => {
      cancelled = true
    }
  }, [canFetch, token, range, refreshes])

  const gsc = report?.gsc
  const totals = gsc?.totals.data

  return (
    <div className={adminStyles.pageContainer}>
      <header className={adminStyles.pageHeader}>
        <div>
          <h1 className={adminStyles.pageTitle}>SEO</h1>
          <p className={adminStyles.pageSubtitle}>
            Google aramasından gelen trafik: hangi ürünler ve aramalar sizi getiriyor, nerede fırsat var. Her sayı bir önceki
            aynı uzunluktaki dönemle karşılaştırılır.
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
          <button type="button" className={s.refresh} onClick={() => setRefreshes((n) => n + 1)} disabled={loading} title="Google’dan yeniden çek">
            {loading ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>
      </header>

      {failure && <div className={s.alert}>{failure}</div>}
      {loading && !report && <div className={s.loadingBlock}>Veriler Google’dan alınıyor…</div>}

      {report && !gsc && (
        <div className={s.alert}>
          Search Console henüz bağlı değil. Kurulum adımları için <Link href="/analytics">Analizler</Link> sayfasının en üstüne bakın.
        </div>
      )}

      {gsc && (
        <>
          <section className={s.kpis} aria-label="Google arama özeti">
            <Kpi label="Google’dan tıklama" value={totals ? fmtInt(totals.current.clicks) : '—'} current={totals?.current.clicks} previous={totals?.previous.clicks} />
            <Kpi label="Gösterim" value={totals ? fmtInt(totals.current.impressions) : '—'} current={totals?.current.impressions} previous={totals?.previous.impressions} hint="aramalarda görünme sayısı" />
            <Kpi label="Tıklama oranı" value={totals?.current.impressions ? pct(totals.current.ctr) : '—'} current={totals?.current.ctr} previous={totals?.previous.ctr} hint="gösterimlerin kaçı tıklandı" />
            <Kpi label="Ortalama sıra" value={totals?.current.impressions ? pos(totals.current.position) : '—'} current={totals?.current.position} previous={totals?.previous.position} lowerIsBetter hint="1 = ilk sonuç" />
          </section>

          <Panel title="Google’dan gelen tıklamalar" subtitle="Günlük" error={gsc.byDate.error}>
            <LineChart points={(gsc.byDate.data ?? []).map((d: GscRow) => ({ label: dayLabel(d.key), value: d.clicks }))} valueLabel="tıklama" />
          </Panel>

          <h2 className={s.sectionTitle}>Ürünler</h2>
          <Panel title="Hangi ürün Google’dan trafik alıyor?" subtitle="Ürün sayfalarının toplamı" error={gsc.products.error}>
            <SeoTable
              rows={gsc.products.data ?? []}
              first="Ürün"
              label={(r) => (r as unknown as { name: string }).name}
              empty="Henüz Google’dan ürün sayfası trafiği yok."
            />
          </Panel>

          <h2 className={s.sectionTitle}>Fırsatlar</h2>
          <div className={s.grid2}>
            <Panel title="Yükselen ürünler" subtitle="Önceki döneme göre en çok tıklama kazanan" error={gsc.opportunities.error}>
              <MoverList movers={gsc.opportunities.data?.rising ?? []} empty="Bu dönemde belirgin bir yükseliş yok." />
            </Panel>
            <Panel title="Düşen ürünler" subtitle="Önceki döneme göre en çok tıklama kaybeden" error={gsc.opportunities.error}>
              <MoverList movers={gsc.opportunities.data?.falling ?? []} empty="Bu dönemde belirgin bir düşüş yok." />
            </Panel>
          </div>
          <div className={s.grid2}>
            <Panel title="Çok görünüyor ama az tıklanıyor" subtitle="Başlığı veya açıklamayı iyileştirmek getiri sağlayabilir" error={gsc.opportunities.error}>
              <SeoTable
                rows={gsc.opportunities.data?.lowCtrPages ?? []}
                first="Sayfa"
                label={pageLabel}
                empty="Şu an böyle bir sayfa yok ya da henüz yeterli veri birikmedi."
              />
            </Panel>
            <Panel title="İlk sayfaya yakın aramalar" subtitle="4.–20. sıradaki, görünürlüğü olan aramalar" error={gsc.opportunities.error}>
              <SeoTable
                rows={gsc.opportunities.data?.nearTopQueries ?? []}
                first="Arama"
                empty="Şu an böyle bir arama yok ya da henüz yeterli veri birikmedi."
              />
            </Panel>
          </div>

          <h2 className={s.sectionTitle}>Ayrıntılar</h2>
          <div className={s.grid2}>
            <Panel title="Arama sorguları" subtitle="Google’da hangi aramalarla bulunduğunuz" error={gsc.queries.error}>
              <SeoTable rows={(gsc.queries.data ?? []).slice(0, 25)} first="Arama" />
            </Panel>
            <Panel title="Sayfalar" subtitle="Google’da öne çıkan sayfalar" error={gsc.pages.error}>
              <SeoTable rows={(gsc.pages.data ?? []).slice(0, 25)} first="Sayfa" label={pageLabel} />
            </Panel>
          </div>
          <div className={s.grid2}>
            <Panel title="Ülkeler" error={gsc.countries.error}>
              <SeoTable rows={gsc.countries.data ?? []} first="Ülke" label={(r) => countryName(r.key)} />
            </Panel>
            <Panel title="Cihazlar" error={gsc.devices.error}>
              <SeoTable rows={gsc.devices.data ?? []} first="Cihaz" label={(r) => DEVICES[r.key] ?? r.key} />
            </Panel>
          </div>
        </>
      )}

      {report && (
        <p className={s.footnote}>
          Dönem: {report.period.start} – {report.period.end} · karşılaştırma: {report.period.previous.start} –{' '}
          {report.period.previous.end} · Son güncelleme: {new Date(report.generatedAt).toLocaleString('tr-TR')} · Search Console
          verileri 2–3 gün gecikmeli gelir, bu yüzden son günler eksik görünebilir. Veriler 15 dakikada bir yenilenir.
        </p>
      )}
    </div>
  )
}
