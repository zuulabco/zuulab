'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import adminStyles from '../admin.module.css'
import s from './Analytics.module.css'
import { BarList, ColumnChart, LineChart, fmtInt, type BarRow } from './charts'

// ── Report shape (see lib/services/analytics/google-analytics.service.ts) ──

type Row = Record<string, string | number>
type ErrorCode = 'not_configured' | 'auth_failed' | 'api_disabled' | 'no_access' | 'bad_request' | 'failed'
type Result<T> = { data: T; error?: undefined } | { data: null; error: { code: ErrorCode; message: string } }
interface GscRow {
  key: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}
interface Report {
  range: 7 | 28 | 90
  generatedAt: string
  setup: { measurementId: boolean; propertyId: boolean; searchConsoleSite: string | null; serviceAccount: string | null }
  ga: Record<
    'kpis' | 'trend' | 'pages' | 'channels' | 'sources' | 'devices' | 'cities' | 'products' | 'events' | 'clicks' | 'hours' | 'visitors',
    Result<Row[]>
  > & { realtime: Result<number> } | null
  gsc: Record<'byDate' | 'queries' | 'pages' | 'devices', Result<GscRow[]>> | null
}

const RANGES = [
  { value: 7, label: 'Son 7 gün' },
  { value: 28, label: 'Son 28 gün' },
  { value: 90, label: 'Son 90 gün' },
] as const

const CHANNELS: Record<string, string> = {
  Direct: 'Doğrudan',
  'Organic Search': 'Google / arama (organik)',
  'Organic Social': 'Sosyal medya',
  Referral: 'Diğer siteler',
  'Paid Search': 'Arama reklamı',
  'Paid Social': 'Sosyal medya reklamı',
  Email: 'E-posta',
  'Organic Shopping': 'Alışveriş (organik)',
  Display: 'Görüntülü reklam',
  Unassigned: 'Belirsiz',
}
const DEVICES: Record<string, string> = { mobile: 'Mobil', desktop: 'Masaüstü', tablet: 'Tablet' }
const VISITOR_TYPES: Record<string, string> = { new: 'Yeni ziyaretçi', returning: 'Geri dönen' }
const ACTIONS: Array<{ event: string; label: string }> = [
  { event: 'whatsapp_click', label: 'WhatsApp tıklaması' },
  { event: 'add_to_wishlist', label: 'Favoriye ekleme' },
  { event: 'search', label: 'Site içi arama' },
  { event: 'generate_lead', label: 'İletişim formu' },
  { event: 'sign_up', label: 'Bülten kaydı' },
]
const FUNNEL: Array<{ event: string; label: string }> = [
  { event: 'view_item', label: 'Ürün görüntüleme' },
  { event: 'add_to_cart', label: 'Sepete ekleme' },
  { event: 'begin_checkout', label: 'Ödemeye geçiş' },
  { event: 'purchase', label: 'Satın alma' },
]

const pct = (n: number, digits = 1) => `%${(n * 100).toLocaleString('tr-TR', { maximumFractionDigits: digits })}`
const money = (n: number) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`
const duration = (sec: number) => {
  const m = Math.floor(sec / 60)
  const r = Math.round(sec % 60)
  return m > 0 ? `${m} dk ${r} sn` : `${r} sn`
}
const dayLabel = (yyyymmdd: string) => {
  const d = yyyymmdd.includes('-') ? new Date(yyyymmdd) : new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`)
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

export default function AnalyticsPage() {
  const { token, canFetch } = useAuthStore()
  const [range, setRange] = useState<7 | 28 | 90>(28)
  const [report, setReport] = useState<Report | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  /** Bumped by "Yenile": fetches again, skipping the 15-minute server cache */
  const [refreshes, setRefreshes] = useState(0)
  /** Which request the shown data answers; loading = the current one has not landed */
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const key = `${range}:${refreshes}`
  const loading = loadedKey !== key

  useEffect(() => {
    if (!canFetch) return
    let cancelled = false
    fetch(`/api/admin/analytics?range=${range}${refreshes > 0 ? '&fresh=1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (!data.success) throw new Error(data.error || 'Analiz verileri alınamadı.')
        setReport(data.report)
        setFailure(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setFailure(e.message || 'Analiz verileri alınamadı.')
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(`${range}:${refreshes}`)
      })
    return () => {
      cancelled = true
    }
  }, [canFetch, token, range, refreshes])

  const setupDone = report && report.setup.serviceAccount && report.setup.propertyId && report.setup.measurementId && report.setup.searchConsoleSite
  const setupErrors = report ? collectSetupErrors(report) : []

  return (
    <div className={adminStyles.pageContainer}>
      <header className={adminStyles.pageHeader}>
        <div>
          <h1 className={adminStyles.pageTitle}>Analizler</h1>
          <p className={adminStyles.pageSubtitle}>
            Google Analytics ve Search Console verileri: ziyaretçiler, ilgi gören ürünler, tıklamalar ve Google aramaları.
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
          <button type="button" className={s.refresh} onClick={() => setRefreshes((n) => n + 1)} disabled={loading} title="Google'dan yeniden çek">
            {loading ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>
      </header>

      {failure && <div className={s.alert}>{failure}</div>}

      {report && (!setupDone || setupErrors.length > 0) && <SetupGuide report={report} errors={setupErrors} />}

      {loading && !report && <div className={s.loadingBlock}>Veriler Google’dan alınıyor…</div>}

      {report?.ga && <GaSections ga={report.ga} range={report.range} />}
      {report?.gsc && <GscSections gsc={report.gsc} />}

      {report && (
        <p className={s.footnote}>
          Son güncelleme: {new Date(report.generatedAt).toLocaleString('tr-TR')} · Veriler 15 dakikada bir yenilenir. Google
          Analytics verileri yalnızca çerezlere izin veren ziyaretçileri kapsar; Search Console verileri 2–3 gün gecikmeli gelir.
        </p>
      )}
    </div>
  )
}

// ── Google Analytics ─────────────────────────────────────────────────

function GaSections({ ga, range }: { ga: NonNullable<Report['ga']>; range: number }) {
  const [metric, setMetric] = useState<'activeUsers' | 'sessions' | 'screenPageViews'>('activeUsers')
  const cur = ga.kpis.data?.find((r) => r.dateRange === 'current') ?? ga.kpis.data?.[0]
  const prev = ga.kpis.data?.find((r) => r.dateRange === 'previous')
  const events = new Map((ga.events.data ?? []).map((r) => [String(r.eventName), Number(r.eventCount)]))

  const metricLabels = { activeUsers: 'ziyaretçi', sessions: 'oturum', screenPageViews: 'görüntüleme' } as const
  const trend = (ga.trend.data ?? []).map((r) => ({ label: dayLabel(String(r.date)), value: Number(r[metric]) }))

  const hours = Array.from({ length: 24 }, (_, h) => Number((ga.hours.data ?? []).find((r) => Number(r.hour) === h)?.activeUsers ?? 0))
  const deviceTotal = (ga.devices.data ?? []).reduce((sum, r) => sum + Number(r.activeUsers), 0)

  return (
    <>
      <section className={s.kpis} aria-label="Özet">
        <Kpi label="Şu an sitede" value={ga.realtime.data !== null ? fmtInt(ga.realtime.data) : '—'} hint="son 30 dakika" live />
        <Kpi label="Ziyaretçi (benzersiz)" value={num(cur, 'activeUsers')} delta={delta(cur, prev, 'activeUsers')} />
        <Kpi label="Yeni ziyaretçi" value={num(cur, 'newUsers')} delta={delta(cur, prev, 'newUsers')} />
        <Kpi label="Ziyaret (oturum)" value={num(cur, 'sessions')} delta={delta(cur, prev, 'sessions')} />
        <Kpi label="Sayfa görüntüleme" value={num(cur, 'screenPageViews')} delta={delta(cur, prev, 'screenPageViews')} />
        <Kpi
          label="Etkileşim oranı"
          value={cur ? pct(Number(cur.engagementRate)) : '—'}
          delta={delta(cur, prev, 'engagementRate')}
          hint="10 sn+ kalan veya etkileşen oturumlar"
        />
        <Kpi
          label="Ort. oturum süresi"
          value={cur ? duration(Number(cur.averageSessionDuration)) : '—'}
          delta={delta(cur, prev, 'averageSessionDuration')}
        />
      </section>
      {ga.kpis.error && <ReportNote error={ga.kpis.error} />}

      <Panel
        title="Günlük trend"
        subtitle={`Son ${range} gün`}
        action={
          <div className={s.segmentedSm} role="group" aria-label="Grafik ölçüsü">
            {(Object.keys(metricLabels) as Array<keyof typeof metricLabels>).map((m) => (
              <button key={m} type="button" className={metric === m ? s.segActive : s.seg} aria-pressed={metric === m} onClick={() => setMetric(m)}>
                {metricLabels[m]}
              </button>
            ))}
          </div>
        }
        error={ga.trend.error}
      >
        <LineChart points={trend} valueLabel={metricLabels[metric]} />
      </Panel>

      <div className={s.grid2}>
        <Panel title="En çok ilgi gören ürünler" subtitle="Ürün sayfası görüntüleme, sepete ekleme ve satın alma" error={ga.products.error} wide>
          <ProductsTable rows={ga.products.data ?? []} />
        </Panel>
      </div>

      <div className={s.grid2}>
        <Panel title="Satış hunisi" subtitle="Ürünü görenlerin kaçı satın almaya ilerledi" error={ga.events.error}>
          <Funnel counts={events} />
        </Panel>
        <Panel title="Ziyaretçi eylemleri" subtitle="Seçilen aralıktaki toplamlar" error={ga.events.error}>
          <ul className={s.actions}>
            {ACTIONS.map((a) => (
              <li key={a.event}>
                <span>{a.label}</span>
                <strong>{fmtInt(events.get(a.event) ?? 0)}</strong>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className={s.grid2}>
        <Panel title="Ziyaretçiler nereden geliyor" subtitle="Kanallara göre oturum" error={ga.channels.error}>
          <BarList rows={(ga.channels.data ?? []).map((r) => ({ label: CHANNELS[String(r.sessionDefaultChannelGroup)] ?? String(r.sessionDefaultChannelGroup), value: Number(r.sessions) }))} />
        </Panel>
        <Panel title="Kaynak / araç" subtitle="İlk 10" error={ga.sources.error}>
          <BarList rows={(ga.sources.data ?? []).map((r) => ({ label: String(r.sessionSourceMedium).replace('(direct) / (none)', 'doğrudan'), value: Number(r.sessions) }))} />
        </Panel>
      </div>

      <div className={s.grid3}>
        <Panel title="Cihazlar" error={ga.devices.error}>
          <BarList
            rows={(ga.devices.data ?? []).map((r) => ({ label: DEVICES[String(r.deviceCategory)] ?? String(r.deviceCategory), value: Number(r.activeUsers) }))}
            format={(n) => (deviceTotal ? `${fmtInt(n)} · ${pct(n / deviceTotal, 0)}` : fmtInt(n))}
          />
        </Panel>
        <Panel title="Yeni / geri dönen" error={ga.visitors.error}>
          <BarList
            rows={(ga.visitors.data ?? [])
              .filter((r) => VISITOR_TYPES[String(r.newVsReturning)])
              .map((r) => ({ label: VISITOR_TYPES[String(r.newVsReturning)], value: Number(r.activeUsers) }))}
          />
        </Panel>
        <Panel title="Şehirler" subtitle="İlk 10" error={ga.cities.error}>
          <BarList rows={(ga.cities.data ?? []).map((r) => ({ label: String(r.city) === '(not set)' ? 'Bilinmiyor' : String(r.city), value: Number(r.activeUsers) }))} />
        </Panel>
      </div>

      <Panel title="Günün saatlerine göre ziyaretçi" subtitle="En yoğun saatler (Türkiye saati)" error={ga.hours.error}>
        <ColumnChart values={hours} labels={hours.map((_, h) => `${String(h).padStart(2, '0')}:00`)} unit="ziyaretçi" />
      </Panel>

      <div className={s.grid2}>
        <Panel title="En çok görüntülenen sayfalar" error={ga.pages.error}>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Sayfa</th>
                  <th className={s.num}>Görüntüleme</th>
                  <th className={s.num}>Ziyaretçi</th>
                </tr>
              </thead>
              <tbody>
                {(ga.pages.data ?? []).map((r) => (
                  <tr key={String(r.pagePath)}>
                    <td className={s.pathCell}>
                      <a href={`https://www.zuulab.com${r.pagePath}`} target="_blank" rel="noopener noreferrer">
                        {pageName(String(r.pagePath))}
                      </a>
                    </td>
                    <td className={s.num}>{fmtInt(Number(r.screenPageViews))}</td>
                    <td className={s.num}>{fmtInt(Number(r.activeUsers))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(ga.pages.data ?? []).length === 0 && <p className={s.empty}>Henüz veri yok.</p>}
        </Panel>
        <Panel title="En çok tıklananlar" subtitle="Bağlantı ve butonlar (metni ve hedefi)" error={ga.clicks.error}>
          <BarList
            rows={(ga.clicks.data ?? []).map(
              (r): BarRow => ({ label: String(r.linkText) || '(metinsiz)', value: Number(r.eventCount), hint: String(r.linkUrl) || undefined })
            )}
            empty="Tıklama verisi, ziyaretçiler çerezlere izin verdikçe birikir."
          />
        </Panel>
      </div>
    </>
  )
}

function ProductsTable({ rows }: { rows: Row[] }) {
  const named = rows.filter((r) => String(r.itemName) && String(r.itemName) !== '(not set)')
  if (named.length === 0) return <p className={s.empty}>Ürün etkileşimleri, ziyaretçiler ürün sayfalarını gezdikçe burada listelenir.</p>
  return (
    <div className={s.tableScroll}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Ürün</th>
            <th className={s.num}>Görüntüleme</th>
            <th className={s.num}>Sepete ekleme</th>
            <th className={s.num}>Satın alma</th>
            <th className={s.num}>Gelir</th>
            <th className={s.num} title="Satın alma / görüntüleme">Dönüşüm</th>
          </tr>
        </thead>
        <tbody>
          {named.map((r) => {
            const views = Number(r.itemsViewed)
            const bought = Number(r.itemsPurchased)
            return (
              <tr key={String(r.itemName)}>
                <td>{String(r.itemName)}</td>
                <td className={s.num}>{fmtInt(views)}</td>
                <td className={s.num}>{fmtInt(Number(r.itemsAddedToCart))}</td>
                <td className={s.num}>{fmtInt(bought)}</td>
                <td className={s.num}>{money(Number(r.itemRevenue))}</td>
                <td className={s.num}>{views ? pct(bought / views) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Funnel({ counts }: { counts: Map<string, number> }) {
  const first = counts.get(FUNNEL[0].event) ?? 0
  if (first === 0) return <p className={s.empty}>Huniyi oluşturacak ürün görüntülemesi henüz yok.</p>
  return (
    <ol className={s.funnel}>
      {FUNNEL.map((step, i) => {
        const n = counts.get(step.event) ?? 0
        const prevN = i === 0 ? n : counts.get(FUNNEL[i - 1].event) ?? 0
        return (
          <li key={step.event} className={s.funnelStep}>
            <div className={s.funnelHead}>
              <span>{step.label}</span>
              <span className={s.funnelNums}>
                <strong>{fmtInt(n)}</strong>
                {i > 0 && <em>{prevN ? pct(n / prevN) : '—'} önceki adımdan</em>}
              </span>
            </div>
            <div className={s.barTrack}>
              <span className={s.barFill} style={{ width: `${Math.max(2, (n / first) * 100)}%` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Search Console ───────────────────────────────────────────────────

function GscSections({ gsc }: { gsc: NonNullable<Report['gsc']> }) {
  const days = gsc.byDate.data ?? []
  const clicks = days.reduce((sum, d) => sum + d.clicks, 0)
  const impressions = days.reduce((sum, d) => sum + d.impressions, 0)
  const position = impressions ? days.reduce((sum, d) => sum + d.position * d.impressions, 0) / impressions : 0

  return (
    <>
      <h2 className={s.sectionTitle}>Google arama performansı</h2>
      <section className={s.kpis} aria-label="Google arama özeti">
        <Kpi label="Google’dan tıklama" value={gsc.byDate.data ? fmtInt(clicks) : '—'} />
        <Kpi label="Gösterim" value={gsc.byDate.data ? fmtInt(impressions) : '—'} hint="aramalarda görünme sayısı" />
        <Kpi label="Tıklama oranı" value={impressions ? pct(clicks / impressions) : '—'} />
        <Kpi label="Ortalama sıra" value={impressions ? position.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '—'} hint="1 = ilk sonuç" />
      </section>
      {gsc.byDate.error && <ReportNote error={gsc.byDate.error} />}

      <Panel title="Google’dan gelen tıklamalar" subtitle="Günlük">
        <LineChart points={days.map((d) => ({ label: dayLabel(d.key), value: d.clicks }))} valueLabel="tıklama" />
      </Panel>

      <div className={s.grid2}>
        <Panel title="Arama sorguları" subtitle="Google’da hangi aramalarla bulunduğunuz" error={gsc.queries.error}>
          <GscTable rows={gsc.queries.data ?? []} first="Sorgu" />
        </Panel>
        <Panel title="Google’da öne çıkan sayfalar" error={gsc.pages.error}>
          <GscTable rows={gsc.pages.data ?? []} first="Sayfa" />
        </Panel>
      </div>
    </>
  )
}

function GscTable({ rows, first }: { rows: GscRow[]; first: string }) {
  if (rows.length === 0) return <p className={s.empty}>Henüz veri yok. Search Console verileri site eklendikten birkaç gün sonra gelir.</p>
  return (
    <div className={s.tableScroll}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>{first}</th>
            <th className={s.num}>Tıklama</th>
            <th className={s.num}>Gösterim</th>
            <th className={s.num}>Sıra</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className={s.pathCell}>{r.key}</td>
              <td className={s.num}>{fmtInt(r.clicks)}</td>
              <td className={s.num}>{fmtInt(r.impressions)}</td>
              <td className={s.num}>{r.position.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Building blocks ──────────────────────────────────────────────────

function Kpi({ label, value, delta, hint, live }: { label: string; value: string; delta?: number | null; hint?: string; live?: boolean }) {
  return (
    <div className={s.kpi}>
      <span className={s.kpiLabel}>
        {live && <span className={s.liveDot} aria-hidden />}
        {label}
      </span>
      <span className={s.kpiValue}>{value}</span>
      {delta !== undefined && delta !== null ? (
        <span className={delta >= 0 ? s.deltaUp : s.deltaDown}>
          {delta >= 0 ? '▲' : '▼'} {pct(Math.abs(delta), 0)} <span className={s.deltaNote}>önceki döneme göre</span>
        </span>
      ) : (
        hint && <span className={s.kpiHint}>{hint}</span>
      )}
    </div>
  )
}

function Panel({
  title,
  subtitle,
  action,
  error,
  wide,
  children,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  error?: { code: ErrorCode; message: string }
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={`${s.panel} ${wide ? s.panelWide : ''}`}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>{title}</h2>
          {subtitle && <p className={s.panelSub}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {error ? <ReportNote error={error} /> : children}
    </section>
  )
}

function ReportNote({ error }: { error: { code: ErrorCode; message: string } }) {
  return <p className={s.note}>{ERROR_TEXT[error.code] ?? 'Bu rapor alınamadı.'}</p>
}

const ERROR_TEXT: Record<ErrorCode, string> = {
  not_configured: 'Google bağlantısı henüz kurulmadı (yukarıdaki adımlar).',
  auth_failed: 'Servis hesabıyla Google’a giriş yapılamadı. Anahtar bilgilerini kontrol edin.',
  api_disabled: 'Bu Google API’si projede kapalı. Yukarıdaki adımdaki bağlantıdan açın.',
  no_access: 'Servis hesabının bu mülke erişimi yok. Yukarıdaki adımda verilen e-postayı kullanıcı olarak ekleyin.',
  bad_request: 'Google bu raporu henüz üretemedi (genellikle yeterli veri olmadığında görülür).',
  failed: 'Google şu an yanıt vermedi; biraz sonra Yenile’ye basın.',
}

// ── Setup guide ──────────────────────────────────────────────────────

interface SetupError {
  source: 'ga' | 'gsc'
  code: ErrorCode
  message: string
}

function collectSetupErrors(report: Report): SetupError[] {
  const out: SetupError[] = []
  const scan = (source: 'ga' | 'gsc', part: Record<string, Result<unknown>> | null) => {
    if (!part) return
    const err = Object.values(part).find((r) => r.error && ['auth_failed', 'api_disabled', 'no_access'].includes(r.error.code))?.error
    if (err) out.push({ source, code: err.code, message: err.message })
  }
  scan('ga', report.ga as Record<string, Result<unknown>> | null)
  scan('gsc', report.gsc as Record<string, Result<unknown>> | null)
  return out
}

function SetupGuide({ report, errors }: { report: Report; errors: SetupError[] }) {
  const { setup } = report
  const gaErr = errors.find((e) => e.source === 'ga')
  const gscErr = errors.find((e) => e.source === 'gsc')
  const steps = [
    { done: setup.measurementId, title: 'Google Analytics ölçüm kimliği', text: 'Vercel’de NEXT_PUBLIC_GA_MEASUREMENT_ID (G-… ile başlar) tanımlı olmalı. Siteye ziyaretçi verisi bununla gelir.' },
    { done: setup.propertyId, title: 'Google Analytics mülk kimliği', text: 'Vercel’de GA4_PROPERTY_ID (yalnızca rakamlar) tanımlı olmalı. Bu sayfa raporları bununla okur.' },
    { done: Boolean(setup.searchConsoleSite), title: 'Search Console mülkü', text: 'Vercel’de GSC_SITE_URL tanımlı olmalı (ör. sc-domain:zuulab.com).' },
    {
      done: Boolean(setup.serviceAccount) && !gaErr && !gscErr,
      title: 'Servis hesabına erişim',
      text: setup.serviceAccount
        ? `Bu e-postayı Google Analytics’te (Yönetici → Mülk erişim yönetimi → Görüntüleyen) ve Search Console’da (Ayarlar → Kullanıcılar ve izinler → Kısıtlı) kullanıcı olarak ekleyin: ${setup.serviceAccount}`
        : 'Servis hesabı bilgileri (Firebase Admin) bulunamadı.',
    },
  ]
  return (
    <section className={s.setup}>
      <h2 className={s.panelTitle}>Kurulum</h2>
      <p className={s.panelSub}>Aşağıdaki adımlar tamamlanınca raporlar burada görünür.</p>
      <ol className={s.steps}>
        {steps.map((st) => (
          <li key={st.title} className={st.done ? s.stepDone : s.step}>
            <span className={s.stepMark} aria-hidden>
              {st.done ? '✓' : ''}
            </span>
            <div>
              <strong>{st.title}</strong>
              <p>{st.text}</p>
            </div>
          </li>
        ))}
      </ol>
      {[gaErr, gscErr].filter(Boolean).map((e) => (
        <p key={e!.source} className={s.note}>
          <strong>{e!.source === 'ga' ? 'Google Analytics' : 'Search Console'}:</strong> {ERROR_TEXT[e!.code]}
          {e!.code === 'api_disabled' && (
            <>
              {' '}
              <a href={apiLink(e!.message, e!.source)} target="_blank" rel="noopener noreferrer">
                API’yi açmak için tıklayın →
              </a>
            </>
          )}
        </p>
      ))}
    </section>
  )
}

/** The "enable this API" link Google puts in its error, or the console page */
function apiLink(message: string, source: 'ga' | 'gsc'): string {
  const found = message.match(/https:\/\/console\.developers\.google\.com\/\S+/)?.[0]
  if (found) return found.replace(/[.,)]+$/, '')
  return source === 'ga'
    ? 'https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com'
    : 'https://console.cloud.google.com/apis/library/searchconsole.googleapis.com'
}

// ── helpers ──────────────────────────────────────────────────────────

function num(row: Row | undefined, key: string): string {
  return row ? fmtInt(Number(row[key])) : '—'
}

function delta(cur: Row | undefined, prev: Row | undefined, key: string): number | null {
  if (!cur || !prev) return null
  const a = Number(cur[key])
  const b = Number(prev[key])
  if (!b) return null
  return (a - b) / b
}

/** "/urun/zuulight-muse" → "Ürün: zuulight-muse"; keeps paths readable */
function pageName(path: string): string {
  if (path === '/') return 'Ana sayfa'
  const map: Array<[RegExp, string]> = [
    [/^\/urun\/(.+)/, 'Ürün: $1'],
    [/^\/kategori\/(.+)/, 'Kategori: $1'],
    [/^\/koleksiyon\/(.+)/, 'Koleksiyon: $1'],
  ]
  for (const [re, label] of map) if (re.test(path)) return path.replace(re, label).replace(/-/g, ' ')
  return path
}

