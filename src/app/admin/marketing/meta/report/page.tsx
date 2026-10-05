'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import adminStyles from '../../../admin.module.css'
import s from '../../../analytics/Analytics.module.css'
import { LineChart, fmtInt } from '../../../analytics/charts'
import { changeOf } from '@/lib/analytics/seo'
import type { InsightLevel } from '@/lib/meta-ads/insights'
import type { InsightsReport } from '@/lib/services/meta-ads.service'

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

function Change({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return null
  const c = changeOf(current, previous)
  if (c === null || Math.abs(c) < 0.005) return null
  return (
    <span className={c > 0 ? s.deltaUp : s.deltaDown} style={{ marginLeft: 6 }}>
      {c > 0 ? '▲' : '▼'} %{(Math.abs(c) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
    </span>
  )
}

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
      <header className={adminStyles.pageHeader}>
        <div>
          <h1 className={adminStyles.pageTitle}>Meta reklam raporu</h1>
          <p className={adminStyles.pageSubtitle}>
            Reklamlarınızın harcaması ve sonuçları. Satış ve ROAS rakamları <strong>Meta’nın kendi hesabıdır</strong>; gerçek siparişlerinizle
            birebir aynı olmayabilir. <Link href="/marketing/meta">Reklamları yönet →</Link> · <Link href="/marketing/meta/sales">Gerçek satış →</Link>
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
          <div className={s.kpis}>
            {[
              { label: 'Harcama', v: tl(cur.spend), c: [cur.spend, prev.spend] as const },
              { label: 'Gösterim', v: fmtInt(cur.impressions), c: [cur.impressions, prev.impressions] as const },
              { label: 'Erişim', v: fmtInt(cur.reach), c: [cur.reach, prev.reach] as const },
              { label: 'Bağlantı tıklaması', v: fmtInt(cur.linkClicks), c: [cur.linkClicks, prev.linkClicks] as const },
              { label: 'Tıklama oranı (CTR)', v: pct(cur.ctr), c: [cur.ctr, prev.ctr] as const },
              { label: 'Tıklama başı maliyet (CPC)', v: tl(cur.cpc), c: [cur.cpc, prev.cpc] as const },
              { label: '1000 gösterim maliyeti (CPM)', v: tl(cur.cpm), c: [cur.cpm, prev.cpm] as const },
              { label: 'Sepete ekleme', v: fmtInt(cur.addToCart), c: [cur.addToCart, prev.addToCart] as const },
              { label: 'Ödemeye başlama', v: fmtInt(cur.initiateCheckout), c: [cur.initiateCheckout, prev.initiateCheckout] as const },
              { label: 'Satın alma', v: fmtInt(cur.purchases), c: [cur.purchases, prev.purchases] as const },
              { label: 'Dönüşüm değeri', v: tl(cur.purchaseValue), c: [cur.purchaseValue, prev.purchaseValue] as const },
              { label: 'ROAS', v: roas(cur.roas), c: [cur.roas, prev.roas] as const },
            ].map((k) => (
              <div key={k.label} className={s.kpi}>
                <span className={s.kpiLabel}>{k.label}</span>
                <span className={s.kpiValue}>
                  {k.v}
                  <Change current={k.c[0]} previous={k.c[1]} />
                </span>
              </div>
            ))}
          </div>

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
