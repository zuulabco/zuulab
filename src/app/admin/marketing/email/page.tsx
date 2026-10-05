'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import adminStyles from '../../admin.module.css'
import s from '../../analytics/Analytics.module.css'
import { fmtInt } from '../../analytics/charts'
import type { EmailOverview, CampaignSummary } from '@/lib/services/email-campaign.service'
import type { AutomationSummary } from '@/lib/services/email-automation.service'

type Overview = EmailOverview & { automations: AutomationSummary[]; consents: { active: number; withdrawn: number; declined: number }; setup: { provider: string; webhookConfigured: boolean } }

interface Form {
  id?: string
  name: string
  subject: string
  preheader: string
  heading: string
  body: string
  ctaLabel: string
  ctaUrl: string
}

const EMPTY: Form = { name: '', subject: '', preheader: '', heading: '', body: '', ctaLabel: '', ctaUrl: '' }

const STATUS: Record<CampaignSummary['status'], string> = { DRAFT: 'Taslak', SENDING: 'Gönderiliyor', SENT: 'Gönderildi' }

const pct = (n: number | null, digits = 0) => (n === null ? '—' : `%${(n * 100).toLocaleString('tr-TR', { maximumFractionDigits: digits })}`)
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

/** Paragraphs are typed as text separated by a blank line */
const toPayload = (f: Form) => ({
  name: f.name,
  subject: f.subject,
  preheader: f.preheader || undefined,
  content: {
    heading: f.heading,
    paragraphs: f.body.split(/\n\s*\n/),
    ctaLabel: f.ctaLabel || undefined,
    ctaUrl: f.ctaUrl || undefined,
  },
})

const fromCampaign = (c: CampaignSummary): Form => ({
  id: c.id,
  name: c.name,
  subject: c.subject,
  preheader: c.preheader ?? '',
  heading: c.content.heading,
  body: c.content.paragraphs.join('\n\n'),
  ctaLabel: c.content.ctaLabel ?? '',
  ctaUrl: c.content.ctaUrl ?? '',
})

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={s.kpi}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue}>{value}</span>
      {hint && <span className={s.kpiHint}>{hint}</span>}
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

const fieldStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border, #ccc)', borderRadius: 6, background: 'transparent', color: 'inherit', font: 'inherit' }
const labelStyle: React.CSSProperties = { display: 'grid', gap: 4, fontSize: '0.85em' }

export default function EmailCenterPage() {
  const { token, canFetch, user } = useAuthStore()
  const [data, setData] = useState<Overview | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  // the test address defaults to the signed-in admin's own until they type another
  const [typedTestTo, setTestTo] = useState<string | null>(null)
  const testTo = typedTestTo ?? user?.email ?? ''
  const [confirmSend, setConfirmSend] = useState<{ id: string; recipients: number } | null>(null)
  /** Automations: how many people each rule would mail right now, and which switch is waiting for a confirmation */
  const [eligible, setEligible] = useState<Record<string, number>>({})
  const [confirmOn, setConfirmOn] = useState<string | null>(null)

  const headers = useCallback(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  )

  /** Bumped to fetch the overview again (after saving, sending or deleting) */
  const [reloads, setReloads] = useState(0)
  const load = useCallback(() => setReloads((n) => n + 1), [])

  useEffect(() => {
    if (!canFetch) return
    let cancelled = false
    fetch('/api/admin/email', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((res) => res.json())
      .then((d) => {
        if (cancelled) return
        if (!d.success) throw new Error(d.error || 'E-posta verileri alınamadı.')
        setData(d)
        setFailure(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setFailure(e.message || 'E-posta verileri alınamadı.')
      })
    return () => {
      cancelled = true
    }
  }, [canFetch, token, reloads])

  async function act(action: string, payload: Record<string, unknown>, label: string) {
    setBusy(label)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/email', { method: 'POST', headers: headers(), body: JSON.stringify({ action, ...payload }) })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'İşlem tamamlanamadı.')
      return d
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
      return null
    } finally {
      setBusy(null)
    }
  }

  async function save(): Promise<string | null> {
    if (!form) return null
    const d = await act('save', { id: form.id, campaign: toPayload(form) }, 'save')
    if (!d) return null
    setForm({ ...form, id: d.id })
    load()
    return d.id as string
  }

  async function onSave() {
    if (await save()) setMessage({ kind: 'ok', text: 'Taslak kaydedildi.' })
  }

  async function onPreview() {
    if (!form) return
    const d = await act('preview', { campaign: toPayload(form) }, 'preview')
    if (d) setPreview(d.html)
  }

  async function onTest() {
    const id = await save()
    if (!id) return
    const d = await act('test', { id, to: testTo }, 'test')
    if (d) setMessage({ kind: 'ok', text: `Test e-postası ${testTo} adresine gönderildi.` })
  }

  async function onAskSend() {
    const id = await save()
    if (!id) return
    const d = await act('audience', {}, 'audience')
    if (d) setConfirmSend({ id, recipients: d.recipients })
  }

  async function onSend() {
    if (!confirmSend) return
    const d = await act('send', { id: confirmSend.id, recipients: confirmSend.recipients }, 'send')
    setConfirmSend(null)
    if (d) {
      setMessage({ kind: 'ok', text: `${d.sent} kişiye gönderildi${d.failed ? `, ${d.failed} gönderim başarısız oldu` : ''}.` })
      setForm(null)
      setPreview(null)
      load()
    }
  }

  async function onDelete(id: string) {
    const d = await act('delete', { id }, 'delete')
    if (d) {
      if (form?.id === id) setForm(null)
      load()
    }
  }

  async function onToggle(key: string, active: boolean) {
    const d = await act('automation-toggle', { key, active }, `toggle-${key}`)
    setConfirmOn(null)
    if (d) {
      setMessage({ kind: 'ok', text: active ? 'Otomasyon açıldı. Zamanlanmış görev çalıştıkça uygun müşterilere e-posta gidecek.' : 'Otomasyon kapatıldı. Artık e-posta gitmeyecek.' })
      load()
    }
  }

  async function onEligible(key: string) {
    const d = await act('automation-preview', { key }, `preview-${key}`)
    if (d) setEligible((e) => ({ ...e, [key]: d.eligible }))
  }

  async function onAutomationTest(key: string) {
    const d = await act('automation-test', { key, to: testTo }, `atest-${key}`)
    if (d) setMessage({ kind: 'ok', text: `Örnek e-posta ${testTo} adresine gönderildi.` })
  }

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f))
  const editable = !form?.id || data?.campaigns.find((c) => c.id === form.id)?.status === 'DRAFT'

  return (
    <div className={adminStyles.pageContainer}>
      <header className={adminStyles.pageHeader}>
        <div>
          <h1 className={adminStyles.pageTitle}>E-posta</h1>
          <p className={adminStyles.pageSubtitle}>
            Bülten kampanyalarını yazın, gönderin ve sonuçlarını görün. Yalnızca e-postasını onaylamış bülten abonelerine gider.
          </p>
        </div>
        <div className={s.toolbar}>
          <button type="button" className={s.refresh} onClick={() => { setForm({ ...EMPTY }); setPreview(null); setMessage(null) }}>
            Yeni kampanya
          </button>
        </div>
      </header>

      {failure && <div className={s.alert}>{failure}</div>}
      {message && <div className={message.kind === 'ok' ? s.note : s.alert}>{message.text}</div>}

      {data && data.setup.provider !== 'RESEND' && (
        <div className={s.alert}>E-posta sağlayıcısı “{data.setup.provider}”: bu modda hiçbir e-posta gerçekten gönderilmez. Canlıda EMAIL_PROVIDER=RESEND olmalıdır.</div>
      )}
      {data && data.setup.provider === 'RESEND' && !data.setup.webhookConfigured && (
        <div className={s.note}>
          Açılma, tıklama ve ulaşma rakamları henüz toplanmıyor: Resend’de bir webhook oluşturup adresini{' '}
          <code>/api/webhooks/resend</code> olarak, imza anahtarını da Vercel’de <code>RESEND_WEBHOOK_SECRET</code> olarak ekleyin.
          Gönderim bu ayar olmadan da çalışır.
        </div>
      )}

      {data && (
        <section className={s.kpis} aria-label="E-posta özeti">
          <Kpi label="Gönderilen e-posta" value={fmtInt(data.totals.sent)} hint="tüm kampanyalar" />
          <Kpi label="Ulaşan" value={pct(data.totalRates.deliveryRate)} hint="gelen kutusuna ulaşan" />
          <Kpi label="Açılma" value={pct(data.totalRates.openRate)} hint="tahmini, aşağıya bakın" />
          <Kpi label="Tıklama" value={pct(data.totalRates.clickRate)} hint="bağlantıya tıklayan" />
          <Kpi label="Abonelikten çıkan" value={fmtInt(data.totals.unsubscribed)} hint="kampanya e-postalarından" />
          <Kpi label="Bülten abonesi" value={fmtInt(data.subscribers.active)} hint={`${fmtInt(data.subscribers.pending)} onay bekliyor · kampanyalar bunlara gider`} />
          <Kpi label="E-posta izni verenler" value={fmtInt(data.consents.active)} hint={`otomatik e-postalar bunlara gider · ${fmtInt(data.consents.declined)} kişi hayır dedi`} />
        </section>
      )}

      {form && (
        <Panel title={form.id ? 'Kampanyayı düzenle' : 'Yeni kampanya'} subtitle="Metin düz yazıdır; e-posta zuulab şablonuyla, abonelikten çıkış bağlantısıyla birlikte gönderilir.">
          <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
            <label style={labelStyle}>Kampanya adı (yalnızca sizin göreceğiniz)
              <input style={fieldStyle} value={form.name} onChange={(e) => set({ name: e.target.value })} disabled={!editable} maxLength={120} />
            </label>
            <label style={labelStyle}>E-posta konusu
              <input style={fieldStyle} value={form.subject} onChange={(e) => set({ subject: e.target.value })} disabled={!editable} maxLength={150} />
            </label>
            <label style={labelStyle}>Ön izleme yazısı (gelen kutusunda konunun yanında görünür, isteğe bağlı)
              <input style={fieldStyle} value={form.preheader} onChange={(e) => set({ preheader: e.target.value })} disabled={!editable} maxLength={150} />
            </label>
            <label style={labelStyle}>Başlık
              <input style={fieldStyle} value={form.heading} onChange={(e) => set({ heading: e.target.value })} disabled={!editable} maxLength={120} />
            </label>
            <label style={labelStyle}>Metin (paragrafları boş satırla ayırın)
              <textarea style={{ ...fieldStyle, minHeight: 160, resize: 'vertical' }} value={form.body} onChange={(e) => set({ body: e.target.value })} disabled={!editable} />
            </label>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={labelStyle}>Buton yazısı (isteğe bağlı)
                <input style={fieldStyle} value={form.ctaLabel} onChange={(e) => set({ ctaLabel: e.target.value })} disabled={!editable} maxLength={40} />
              </label>
              <label style={labelStyle}>Buton bağlantısı (https://…)
                <input style={fieldStyle} value={form.ctaUrl} onChange={(e) => set({ ctaUrl: e.target.value })} disabled={!editable} placeholder="https://www.zuulab.com/urunler" />
              </label>
            </div>

            {editable ? (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className={s.refresh} onClick={onSave} disabled={busy !== null}>{busy === 'save' ? 'Kaydediliyor…' : 'Taslağı kaydet'}</button>
                  <button type="button" className={s.refresh} onClick={onPreview} disabled={busy !== null}>Önizle</button>
                  <button type="button" className={s.refresh} onClick={() => { setForm(null); setPreview(null); setConfirmSend(null) }}>Kapat</button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input style={{ ...fieldStyle, width: 260 }} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="test e-posta adresi" />
                  <button type="button" className={s.refresh} onClick={onTest} disabled={busy !== null || !testTo}>{busy === 'test' ? 'Gönderiliyor…' : 'Bana test gönder'}</button>
                </div>

                {confirmSend ? (
                  <div className={s.alert} role="alertdialog" aria-label="Gönderim onayı">
                    <strong>{fmtInt(confirmSend.recipients)} kişiye</strong> gönderilecek. Gönderilen e-posta geri alınamaz. Test e-postasını kontrol ettiniz mi?
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" className={s.refresh} onClick={onSend} disabled={busy !== null}>{busy === 'send' ? 'Gönderiliyor…' : `Evet, ${fmtInt(confirmSend.recipients)} kişiye gönder`}</button>
                      <button type="button" className={s.refresh} onClick={() => setConfirmSend(null)} disabled={busy === 'send'}>Vazgeç</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button type="button" className={s.refresh} onClick={onAskSend} disabled={busy !== null} style={{ fontWeight: 600 }}>
                      {busy === 'audience' ? 'Hazırlanıyor…' : 'Abonelere gönder…'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className={s.kpiHint}>Gönderilmiş kampanyalar değiştirilemez; sonuçları aşağıdaki tabloda.</p>
            )}

            {preview && (
              <iframe title="E-posta önizlemesi" srcDoc={preview} sandbox="" style={{ width: '100%', height: 560, border: '1px solid var(--border, #ccc)', borderRadius: 8, background: '#fff' }} />
            )}
          </div>
        </Panel>
      )}

      <h2 className={s.sectionTitle}>Otomatik e-postalar</h2>
      <p className={s.kpiHint} style={{ margin: '0 0 8px' }}>
        Müşteri bir şey yaptığında kendiliğinden giden e-postalar. Kapalı başlar; açana kadar kimseye e-posta gitmez. Bir kişiye 3 günde en
        fazla 1 otomatik e-posta gider, her sipariş için bir kez, gece 21:00 – 09:00 arası gönderilmez.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {(data?.automations ?? []).map((a) => (
          <section key={a.key} className={s.panel}>
            <div className={s.panelHead}>
              <div>
                <h3 className={s.panelTitle}>
                  {a.name} <span className={s.kpiHint}>· {a.active ? 'açık' : 'kapalı'}</span>
                </h3>
                <p className={s.panelSub}>{a.rule}</p>
                <p className={s.panelSub}>{a.audience}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              {a.active ? (
                <button type="button" className={s.refresh} onClick={() => onToggle(a.key, false)} disabled={busy !== null}>Kapat</button>
              ) : confirmOn === a.key ? (
                <span className={s.alert} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  Açılınca uygun müşterilere gerçekten e-posta gider.
                  <button type="button" className={s.refresh} onClick={() => onToggle(a.key, true)} disabled={busy !== null}>Evet, aç</button>
                  <button type="button" className={s.refresh} onClick={() => setConfirmOn(null)}>Vazgeç</button>
                </span>
              ) : (
                <button type="button" className={s.refresh} onClick={() => setConfirmOn(a.key)} disabled={busy !== null} style={{ fontWeight: 600 }}>Aç…</button>
              )}
              <button type="button" className={s.refresh} onClick={() => onEligible(a.key)} disabled={busy !== null}>
                {busy === `preview-${a.key}` ? 'Hesaplanıyor…' : 'Şu an kaç kişiye gider?'}
              </button>
              {eligible[a.key] !== undefined && <strong>{fmtInt(eligible[a.key])} kişi</strong>}
              <button type="button" className={s.refresh} onClick={() => onAutomationTest(a.key)} disabled={busy !== null || !testTo}>
                {busy === `atest-${a.key}` ? 'Gönderiliyor…' : `Bana örnek gönder (${testTo || '—'})`}
              </button>
            </div>
            <p className={s.kpiHint} style={{ margin: 0 }}>
              Gönderilen {fmtInt(a.counts.sent)}
              {a.counts.failed ? ` (+${a.counts.failed} hata)` : ''} · ulaşan {pct(a.rates.deliveryRate)} · açılma {pct(a.rates.openRate)} · tıklama {pct(a.rates.clickRate, 1)} ·
              {' '}çıkan {fmtInt(a.counts.unsubscribed)}
              {a.lastSentAt ? ` · son gönderim ${date(a.lastSentAt)}` : ''}
            </p>
          </section>
        ))}
      </div>

      <h2 className={s.sectionTitle}>Kampanyalar</h2>
      {data && data.campaigns.length === 0 ? (
        <p className={s.empty}>Henüz kampanya yok. “Yeni kampanya” ile ilkini yazın.</p>
      ) : (
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Kampanya</th>
                <th>Durum</th>
                <th className={s.num}>Gönderilen</th>
                <th className={s.num}>Ulaşan</th>
                <th className={s.num}>Açılma</th>
                <th className={s.num}>Tıklama</th>
                <th className={s.num}>Geri dönen</th>
                <th className={s.num}>Çıkan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.campaigns ?? []).map((c) => (
                <tr key={c.id}>
                  <td className={s.pathCell}>
                    {c.name}
                    <div className={s.kpiHint}>{c.subject}{c.sentAt ? ` · ${date(c.sentAt)}` : ''}</div>
                  </td>
                  <td>{STATUS[c.status]}</td>
                  <td className={s.num}>{c.status === 'DRAFT' ? '—' : `${fmtInt(c.counts.sent)}${c.counts.failed ? ` (+${c.counts.failed} hata)` : ''}`}</td>
                  <td className={s.num}>{pct(c.rates.deliveryRate)}</td>
                  <td className={s.num}>{pct(c.rates.openRate)}</td>
                  <td className={s.num}>{pct(c.rates.clickRate, 1)}</td>
                  <td className={s.num}>{fmtInt(c.counts.bounced)}</td>
                  <td className={s.num}>{fmtInt(c.counts.unsubscribed)}</td>
                  <td className={s.num} style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className={s.refresh} onClick={() => { setForm(fromCampaign(c)); setPreview(null); setMessage(null); setConfirmSend(null) }}>
                      {c.status === 'DRAFT' ? 'Düzenle' : 'Görüntüle'}
                    </button>{' '}
                    {c.status === 'DRAFT' && (
                      <button type="button" className={s.refresh} onClick={() => onDelete(c.id)} disabled={busy !== null}>Sil</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={s.footnote}>
        Açılma oranı tahminidir: bazı e-posta uygulamaları (ör. Apple Mail gizlilik koruması) görselleri önceden yükleyip e-postayı
        açılmış gösterir, görselleri kapatanlar ise hiç sayılmaz. Tıklama daha güvenilir bir göstergedir. Aboneleri görmek, dışa aktarmak
        veya silmek için <Link href="/content/newsletter">Bülten</Link> sayfasına bakın.
      </p>
    </div>
  )
}
