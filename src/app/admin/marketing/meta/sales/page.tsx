'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import adminStyles from '../../../admin.module.css'
import s from '../../../analytics/Analytics.module.css'
import { fmtInt } from '../../../analytics/charts'
import type { AttributionReport } from '@/lib/services/meta-attribution.service'

type Range = 'today' | '7' | '28' | '90'
const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'today', label: 'Bugün' },
  { value: '7', label: 'Son 7 gün' },
  { value: '28', label: 'Son 28 gün' },
  { value: '90', label: 'Son 90 gün' },
]

const tl = (n: number | null, digits = 2) => (n === null ? '—' : `${n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₺`)
const roas = (n: number | null) => (n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

function verdictText(r: AttributionReport): string {
  const { verdict } = r.comparison
  const pct = r.comparison.ratio === null ? '' : ` (siz Meta'nın iddiasının %${Math.round(r.comparison.ratio * 100)}'ini görüyorsunuz)`
  switch (verdict) {
    case 'none':
      return 'Bu aralıkta ne Meta ne de siteniz reklamlardan satış kaydetti.'
    case 'close':
      return `Meta'nın iddia ettiği satış ile sizin ölçtüğünüz birbirine yakın${pct}.`
    case 'meta-higher':
      return `Meta, sizin ölçtüğünüzden daha fazla satış iddia ediyor${pct}. Bu normaldir: Meta, reklamı görüp sonra başka yoldan gelenleri de sayar.`
    default:
      return `Siz, Meta'nın saydığından fazla satış ölçtünüz${pct}. Çerez izni vermeyenler Meta'ya hiç bildirilmez.`
  }
}

export default function MetaSalesPage() {
  const { token, canFetch } = useAuthStore()
  const [range, setRange] = useState<Range>('28')
  const [report, setReport] = useState<AttributionReport | null>(null)
  const [urlTags, setUrlTags] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [loaded, setLoaded] = useState('')
  const loading = loaded !== range

  useEffect(() => {
    if (!canFetch) return
    let cancelled = false
    fetch(`/api/admin/meta/attribution?range=${range}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.success) throw new Error(d.error || 'Rapor alınamadı.')
        setReport(d.report)
        setUrlTags(d.urlTags)
        setFailure(null)
      })
      .catch((e: Error) => !cancelled && setFailure(e.message || 'Rapor alınamadı.'))
      .finally(() => !cancelled && setLoaded(range))
    return () => {
      cancelled = true
    }
  }, [canFetch, token, range])

  const t = report?.result.totals
  const u = report?.result.unassigned

  return (
    <div className={adminStyles.pageContainer}>
      <header className={adminStyles.pageHeader}>
        <div>
          <h1 className={adminStyles.pageTitle}>Reklam → gerçek satış</h1>
          <p className={adminStyles.pageSubtitle}>
            Reklama harcadığınız para ile sitenizin kendi ölçtüğü ziyaret ve siparişler yan yana. Satış rakamı <strong>sipariş kayıtlarından</strong>{' '}
            gelir; Meta’nın söylediği ayrıca gösterilir. <Link href="/marketing/meta/report">Meta raporu →</Link>
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

      {report && t && u && (
        <>
          <div className={s.kpis}>
            {[
              { label: 'Reklam harcaması', v: tl(t.spend) },
              { label: 'Reklamdan gelen ziyaretçi', v: fmtInt(t.visitors) },
              { label: 'Sepete ekleyen', v: fmtInt(t.cartAdders) },
              { label: 'Ödemeye geçen', v: fmtInt(t.checkoutStarters) },
              { label: 'Gerçek sipariş', v: fmtInt(t.orders) },
              { label: 'Gerçek satış', v: tl(t.revenue) },
              { label: 'Gerçek ROAS', v: roas(t.realRoas) },
              { label: 'Sipariş başı reklam maliyeti', v: tl(t.costPerOrder) },
              { label: 'Meta’nın iddia ettiği satış', v: tl(t.metaValue) },
              { label: 'Meta ROAS', v: roas(t.metaRoas) },
            ].map((k) => (
              <div key={k.label} className={s.kpi}>
                <span className={s.kpiLabel}>{k.label}</span>
                <span className={s.kpiValue}>{k.v}</span>
              </div>
            ))}
          </div>
          <p className={s.panelSub} style={{ marginBottom: 16 }}>
            {verdictText(report)} Sitenin bu aralıktaki toplam satışı {tl(report.shop.revenue)} ({fmtInt(report.shop.orders)} sipariş); bunun{' '}
            {tl(t.revenue)} kadarı Meta kaynaklı.
          </p>

          <section className={s.panel}>
            <div className={s.panelHead}>
              <div>
                <h2 className={s.panelTitle}>Kampanya kampanya</h2>
                <p className={s.panelSub}>En çok harcayandan başlayarak. “Meta” sütunları Meta’nın iddiası, diğerleri sitenizin ölçümüdür.</p>
              </div>
            </div>
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Kampanya</th>
                    <th className={s.num}>Harcama</th>
                    <th className={s.num}>Ziyaretçi</th>
                    <th className={s.num}>Sepet</th>
                    <th className={s.num}>Ödeme</th>
                    <th className={s.num}>Sipariş</th>
                    <th className={s.num}>Satış</th>
                    <th className={s.num}>Gerçek ROAS</th>
                    <th className={s.num}>Meta satış</th>
                    <th className={s.num}>Meta ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {report.result.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td className={s.pathCell} style={{ whiteSpace: 'normal' }}>
                        {c.name}
                      </td>
                      <td className={s.num}>{tl(c.spend)}</td>
                      <td className={s.num}>{fmtInt(c.visitors)}</td>
                      <td className={s.num}>{fmtInt(c.cartAdders)}</td>
                      <td className={s.num}>{fmtInt(c.checkoutStarters)}</td>
                      <td className={s.num}>{fmtInt(c.orders)}</td>
                      <td className={s.num}>{tl(c.revenue)}</td>
                      <td className={s.num}>{roas(c.realRoas)}</td>
                      <td className={s.num}>{tl(c.metaValue)}</td>
                      <td className={s.num}>{roas(c.metaRoas)}</td>
                    </tr>
                  ))}
                  {(u.visitors > 0 || u.orders > 0) && (
                    <tr>
                      <td className={s.pathCell} style={{ whiteSpace: 'normal' }}>
                        <em>Kampanyası belirlenemeyen Meta trafiği</em>
                        {u.tags.length > 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.8em' }}>Tanınmayan etiketler: {u.tags.join(', ')}</div>}
                      </td>
                      <td className={s.num}>—</td>
                      <td className={s.num}>{fmtInt(u.visitors)}</td>
                      <td className={s.num}>{fmtInt(u.cartAdders)}</td>
                      <td className={s.num}>{fmtInt(u.checkoutStarters)}</td>
                      <td className={s.num}>{fmtInt(u.orders)}</td>
                      <td className={s.num}>{tl(u.revenue)}</td>
                      <td className={s.num}>—</td>
                      <td className={s.num}>—</td>
                      <td className={s.num}>—</td>
                    </tr>
                  )}
                  {report.result.campaigns.length === 0 && u.visitors === 0 && u.orders === 0 && (
                    <tr>
                      <td colSpan={10} className={s.empty}>
                        Bu aralıkta reklam verisi yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={s.panel} style={{ marginTop: '1.5rem' }}>
            <div className={s.panelHead}>
              <div>
                <h2 className={s.panelTitle}>Satışlar neden “kampanyası belirlenemeyen” satırına düşüyor?</h2>
              </div>
            </div>
            <div style={{ padding: '0 1rem 1rem', fontSize: '0.85rem', lineHeight: 1.6 }}>
              <p>
                Bir siparişi kampanyaya bağlamak için ziyaretçinin geldiği bağlantıda kampanya etiketi (utm) olmalı. Bu panelden oluşturulan reklamlara
                etiket otomatik eklenir. Reklam Yöneticisi’nde elle açılmış reklamlarda yoksa, yalnızca “Meta’dan geldi” bilgisi (fbclid) kalır ve satış
                yukarıdaki ayrı satıra düşer.
              </p>
              <p>
                Eski reklamlar için Reklam Yöneticisi → reklamı düzenle → <strong>URL parametreleri</strong> alanına şunu yapıştırın:
              </p>
              <code style={{ display: 'block', padding: 8, background: 'var(--surface-1)', borderRadius: 6, wordBreak: 'break-all' }}>{urlTags}</code>
              <p style={{ marginTop: 8 }}>
                Notlar: Yalnızca çerez izni veren ziyaretçiler ölçülür. Satışlar “son tıklama”ya göre bağlanır: sipariş, ondan önceki son kampanya ziyaretine
                yazılır. Meta aynı satışı daha geniş sayabildiği için sizin rakamınızın biraz düşük çıkması beklenir.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
