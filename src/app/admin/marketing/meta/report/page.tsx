'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import adminStyles from '../../../admin.module.css'
import s from '../../../analytics/Analytics.module.css'
import { LineChart, fmtInt } from '../../../analytics/charts'
import { changeOf } from '@/lib/analytics/seo'
import type { InsightLevel } from '@/lib/meta-ads/insights'
import type { InsightsReport } from '@/lib/services/meta-ads.service'
import SectionTabs from '@/app/admin/SectionTabs'

type Range = 'today' | '7' | '28' | '90'
const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'today', label: 'Bugün' },
  { value: '7', label: 'Son 7 gün' },
  { value: '28', label: 'Son 28 gün' },
  { value: '90', label: 'Son 90 gün' },
]
const LEVELS: Array<{ value: InsightLevel; label: string }> = [
  { value: 'campaign', label: 'Kampanyalar' },
  { value: 'adset', label: 'Reklam setleri' },
  { value: 'ad', label: 'Reklamlar' },
]

const tl = (n: number | null, digits = 2) => (n === null ? '—' : `${n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₺`)
const pct = (n: number | null) => (n === null ? '—' : `%${(n * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`)
const roas = (n: number | null) => (n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

/** `lowerBetter`: a rise is bad news (costs), so it is shown red */
function Change({ current, previous, lowerBetter = false }: { current: number | null; previous: number | null; lowerBetter?: boolean }) {
  if (current === null || previous === null) return null
  const c = changeOf(current, previous)
  if (c === null || Math.abs(c) < 0.005) return null
  return (
    <span className={(c > 0) !== lowerBetter ? s.deltaUp : s.deltaDown} style={{ marginLeft: 6 }}>
      {c > 0 ? '▲' : '▼'} %{(Math.abs(c) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
    </span>
  )
}

type M = InsightsReport['current']
interface Kpi {
  label: string
  hint: string
  lowerBetter?: boolean
  read: (c: M, p: M) => [string, number | null, number | null]
}
const GROUPS: Array<{ title: string; sub: string; items: Kpi[] }> = [
  {
    title: 'Ne kadar harcandı, kime ulaştı?',
    sub: 'Reklamlara giden para ve reklamı gören kişiler.',
    items: [
      { label: 'Harcama', hint: 'Seçilen aralıkta reklama giden toplam para', read: (c, p) => [tl(c.spend), c.spend, p.spend] },
      { label: 'Gösterim', hint: 'Reklamın toplam kaç kez ekrana geldiği', read: (c, p) => [fmtInt(c.impressions), c.impressions, p.impressions] },
      { label: 'Erişim', hint: 'Reklamı gören farklı kişi sayısı', read: (c, p) => [fmtInt(c.reach), c.reach, p.reach] },
    ],
  },
  {
    title: 'Ne kadar ilgi çekti?',
    sub: 'Reklamı görenlerin sitenize gelmesi ve bunun maliyeti.',
    items: [
      { label: 'Siteye tıklama', hint: 'Reklamdan sitenize giden tıklama sayısı', read: (c, p) => [fmtInt(c.linkClicks), c.linkClicks, p.linkClicks] },
      { label: 'Tıklama oranı (CTR)', hint: 'Reklamı görenlerin yüzde kaçı tıkladı', read: (c, p) => [pct(c.ctr), c.ctr, p.ctr] },
      { label: 'Tıklama başına maliyet (CPC)', hint: 'Bir tıklama için ödediğiniz ortalama tutar (düşük iyi)', lowerBetter: true, read: (c, p) => [tl(c.cpc), c.cpc, p.cpc] },
      { label: '1000 gösterim maliyeti (CPM)', hint: 'Reklamı 1000 kez göstermenin maliyeti (düşük iyi)', lowerBetter: true, read: (c, p) => [tl(c.cpm), c.cpm, p.cpm] },
    ],
  },
  {
    title: 'Ne sattı? (Meta’ya göre)',
    sub: 'Bu rakamlar Meta’nın kendi hesabıdır. Siparişlerinizle karşılaştırması “Gerçek satış” sekmesinde.',
    items: [
      { label: 'Sepete ekleme', hint: 'Reklamdan gelenlerin sepete attığı ürün sayısı', read: (c, p) => [fmtInt(c.addToCart), c.addToCart, p.addToCart] },
      { label: 'Ödemeye başlama', hint: 'Ödeme sayfasına geçenler', read: (c, p) => [fmtInt(c.initiateCheckout), c.initiateCheckout, p.initiateCheckout] },
      { label: 'Satın alma', hint: 'Meta’nın reklama bağladığı sipariş sayısı', read: (c, p) => [fmtInt(c.purchases), c.purchases, p.purchases] },
      { label: 'Satış tutarı', hint: 'Bu siparişlerin toplam tutarı', read: (c, p) => [tl(c.purchaseValue), c.purchaseValue, p.purchaseValue] },
      { label: 'ROAS', hint: 'Harcanan her 1 ₺ için getirilen satış (3 = 1 ₺ ile 3 ₺ satış)', read: (c, p) => [roas(c.roas), c.roas, p.roas] },
    ],
  },
]

export default function MetaReportPage() {
  const { token, canFetch } = useAuthStore()
  const [range, setRange] = useState<Range>('28')
  const [level, setLevel] = useState<InsightLevel>('campaign')
  const [report, setReport] = useState<InsightsReport | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [loaded, setLoaded] = useState('')
  const key = `${range}|${level}`
  const loading = loaded !== key

  useEffect(() => {
    if (!canFetch) return
    let cancelled = false
    fetch(`/api/admin/meta/insights?range=${range}&level=${level}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.success) throw new Error(d.error || 'Reklam raporu alınamadı.')
        setReport(d.report)
        setFailure(null)
      })
      .catch((e: Error) => !cancelled && setFailure(e.message || 'Reklam raporu alınamadı.'))
      .finally(() => !cancelled && setLoaded(key))
    return () => {
      cancelled = true
    }
  }, [canFetch, token, range, level, key])

  const cur = report?.current
  const prev = report?.previous

  return (
    <div className={adminStyles.pageContainer}>
      <SectionTabs />
      <header className={adminStyles.pageHeader}>
        <div>
          <h1 className={adminStyles.pageTitle}>Meta reklam raporu</h1>
          <p className={adminStyles.pageSubtitle}>
            Reklamlarınız ne kadar harcadı, kaç kişiye ulaştı, kaç tıklama aldı. Sağ üstten tarih aralığını değiştirebilirsiniz; oklar bir önceki aynı uzunluktaki dönemle karşılaştırır.
          </p>
        </div>
        <div className={s.toolbar}>
          <div className={s.segmented} role="group" aria-label="Tarih aralığı">
            {RANGES.map((r) => (
              <button key={r.value} type="button" className={range === r.value ? s.segActive : s.seg} aria-pressed={range === r.value} onClick={() => setRange(r.value)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {failure && <div className={s.alert}>{failure}</div>}
      {loading && !report && <div className={s.loadingBlock}>Veriler yükleniyor…</div>}

      {cur && prev && report && (
        <>
          {GROUPS.map((g) => (
            <div key={g.title} style={{ marginBottom: 8 }}>
              <h2 className={s.panelTitle} style={{ margin: '0 0 2px' }}>{g.title}</h2>
              <p className={s.panelSub} style={{ margin: '0 0 10px' }}>{g.sub}</p>
              <div className={s.kpis}>
                {g.items.map((k) => {
                  const [value, a, b] = k.read(cur, prev)
                  return (
                    <div key={k.label} className={s.kpi}>
                      <span className={s.kpiLabel}>{k.label}</span>
                      <span className={s.kpiValue}>
                        {value}
                        <Change current={a} previous={b} lowerBetter={k.lowerBetter} />
                      </span>
                      <span className={s.kpiHint}>{k.hint}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <section className={s.panel}>
            <div className={s.panelHead}>
              <div>
                <h2 className={s.panelTitle}>Günlük harcama</h2>
                <p className={s.panelSub}>Seçilen aralıktaki her gün için toplam reklam harcaması.</p>
              </div>
            </div>
            <LineChart points={report.daily.map((d) => ({ label: d.day, value: d.spend }))} valueLabel="Harcama (₺)" format={(n) => tl(n, 0)} />
          </section>

          <section className={s.panel} style={{ marginTop: '1.5rem' }}>
            <div className={s.panelHead}>
              <div>
                <h2 className={s.panelTitle}>Ayrıntı</h2>
                <p className={s.panelSub}>En çok harcayandan başlayarak.</p>
              </div>
              <div className={s.segmented} role="group" aria-label="Düzey">
                {LEVELS.map((l) => (
                  <button key={l.value} type="button" className={level === l.value ? s.segActive : s.seg} aria-pressed={level === l.value} onClick={() => setLevel(l.value)}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            {report.rows.length === 0 ? (
              <p className={s.empty}>Bu aralıkta gösterim alan reklam yok.</p>
            ) : (
              <div className={s.tableScroll}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Ad</th>
                      <th className={s.num}>Harcama</th>
                      <th className={s.num}>Gösterim</th>
                      <th className={s.num}>Tıklama</th>
                      <th className={s.num}>CTR</th>
                      <th className={s.num}>CPC</th>
                      <th className={s.num}>Sepet</th>
                      <th className={s.num}>Ödeme</th>
                      <th className={s.num}>Satın alma</th>
                      <th className={s.num}>Değer</th>
                      <th className={s.num}>ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.id}>
                        <td className={s.pathCell} style={{ whiteSpace: 'normal' }}>
                          {r.name}
                        </td>
                        <td className={s.num}>{tl(r.metrics.spend)}</td>
                        <td className={s.num}>{fmtInt(r.metrics.impressions)}</td>
                        <td className={s.num}>{fmtInt(r.metrics.linkClicks)}</td>
                        <td className={s.num}>{pct(r.metrics.ctr)}</td>
                        <td className={s.num}>{tl(r.metrics.cpc)}</td>
                        <td className={s.num}>{fmtInt(r.metrics.addToCart)}</td>
                        <td className={s.num}>{fmtInt(r.metrics.initiateCheckout)}</td>
                        <td className={s.num}>{fmtInt(r.metrics.purchases)}</td>
                        <td className={s.num}>{tl(r.metrics.purchaseValue)}</td>
                        <td className={s.num}>{roas(r.metrics.roas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className={s.panelSub} style={{ marginTop: 12 }}>
            Tıklama: siteye giden bağlantı tıklamaları. Veriler Meta’dan alınır ve yaklaşık 5 dakika önbellekte tutulur; Meta rakamları
            birkaç saat gecikmeyle oturabilir.
          </p>
        </>
      )}
    </div>
  )
}
