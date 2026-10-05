'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import adminStyles from '../../admin.module.css'
import s from '../../analytics/Analytics.module.css'
import type { MetaCampaign, MetaSetup } from '@/lib/services/meta-ads.service'
import type { CtaValue, Gender, Objective, PlacementValue } from '@/lib/meta-ads/builders'

interface Data {
  setup: MetaSetup
  campaigns: MetaCampaign[]
  audiences: Array<{ id: string; name: string; size: number | null }>
  images: Array<{ hash: string; name: string; url: string }>
  options?: {
    objectives: ReadonlyArray<{ value: Objective; label: string }>
    placements: ReadonlyArray<{ value: PlacementValue; label: string }>
    ctas: ReadonlyArray<{ value: CtaValue; label: string }>
  }
}

const money = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`)
const STATUS_TR: Record<string, string> = {
  ACTIVE: 'Yayında',
  PAUSED: 'Duraklatıldı',
  CAMPAIGN_PAUSED: 'Kampanya duraklatıldı',
  ADSET_PAUSED: 'Reklam seti duraklatıldı',
  IN_PROCESS: 'İnceleniyor',
  WITH_ISSUES: 'Sorunlu',
  PENDING_REVIEW: 'İnceleme bekliyor',
  DISAPPROVED: 'Reddedildi',
  ARCHIVED: 'Arşivde',
  DELETED: 'Silindi',
}
const statusText = (v: string) => STATUS_TR[v] ?? v
const OBJECTIVE_TR: Record<string, string> = { OUTCOME_TRAFFIC: 'Trafik', OUTCOME_SALES: 'Satış', OUTCOME_AWARENESS: 'Bilinirlik', OUTCOME_ENGAGEMENT: 'Etkileşim', OUTCOME_LEADS: 'Potansiyel müşteri' }

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', minWidth: 160 }
const row: React.CSSProperties = { display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0 1rem 1rem' }

export default function MetaAdsPage() {
  const { token, canFetch } = useAuthStore()
  const [data, setData] = useState<Data | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!canFetch) return
    let cancelled = false
    fetch('/api/admin/meta', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.success) throw new Error(d.error || 'Meta verileri alınamadı.')
        setData(d)
        setFailure(null)
      })
      .catch((e: Error) => !cancelled && setFailure(e.message || 'Meta verileri alınamadı.'))
    return () => {
      cancelled = true
    }
  }, [canFetch, token, tick])

  const post = useCallback(
    async (body: Record<string, unknown>, success: string): Promise<boolean> => {
      setBusy(true)
      setNotice(null)
      setFailure(null)
      try {
        const res = await fetch('/api/admin/meta', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await res.json()
        if (!d.success) throw new Error(d.error || 'İşlem tamamlanamadı.')
        setNotice(success)
        if (!body.validateOnly) setTick((t) => t + 1)
        return true
      } catch (e) {
        setFailure((e as Error).message)
        return false
      } finally {
        setBusy(false)
      }
    },
    [token]
  )

  const goLive = (id: string, name: string) => {
    const typed = window.prompt(`"${name}" yayına alınacak ve para harcamaya başlayabilir.\nOnaylamak için YAYINLA yazın:`)
    if (typed?.trim().toLocaleUpperCase('tr-TR') !== 'YAYINLA') return
    void post({ action: 'set-status', id, status: 'ACTIVE', confirm: true }, 'Yayına alındı.')
  }
  const pause = (id: string) => void post({ action: 'set-status', id, status: 'PAUSED' }, 'Duraklatıldı.')

  const setup = data?.setup

  return (
    <div className={adminStyles.pageContainer}>
      <header className={adminStyles.pageHeader}>
        <div>
          <h1 className={adminStyles.pageTitle}>Meta reklamları</h1>
          <p className={adminStyles.pageSubtitle}>
            Facebook ve Instagram reklamlarını buradan oluşturun. Her yeni kampanya, reklam seti ve reklam <strong>duraklatılmış</strong> açılır;
            yayına almak ayrı bir onay ister.
          </p>
        </div>
      </header>

      {failure && <div className={s.alert}>{failure}</div>}
      {notice && <div className={s.alert} style={{ background: 'var(--surface-1)', color: 'var(--text-primary)' }}>{notice}</div>}
      {!data && !failure && <div className={s.loadingBlock}>Veriler yükleniyor…</div>}

      {setup && (
        <section className={s.panel}>
          <div className={s.panelHead}>
            <div>
              <h2 className={s.panelTitle}>Bağlantı</h2>
              <p className={s.panelSub}>
                {!setup.configured
                  ? 'Meta reklam hesabı bağlı değil (META_ADS_ACCESS_TOKEN, META_AD_ACCOUNT_ID).'
                  : setup.problem
                    ? setup.problem
                    : `${setup.account?.name} · ${setup.account?.status} · ${setup.account?.currency} · bugüne kadar harcanan ${money(setup.account?.spentToDate ?? 0)}`}
              </p>
            </div>
          </div>
          <ul style={{ padding: '0 1rem 1rem', margin: 0, fontSize: '0.85rem', listStyle: 'none' }}>
            <li>{setup.pixel.configured ? (setup.pixel.inAccount === false ? '⚠️ Pixel kimliği bu reklam hesabında bulunamadı.' : '✓ Pixel bağlı.') : '⚠️ Pixel kimliği tanımlı değil.'}</li>
            <li>{setup.pageConfigured ? '✓ Facebook sayfası tanımlı.' : '⚠️ Reklam oluşturmak için META_PAGE_ID (Facebook sayfa kimliği) eklenmeli.'}</li>
            <li>✓ Günlük bütçe güvenlik sınırı: {money(setup.maxDailyBudget)}</li>
          </ul>
        </section>
      )}

      {data && data.setup.configured && !data.setup.problem && (
        <>
          <section className={s.panel} style={{ marginTop: '1.5rem' }}>
            <div className={s.panelHead}>
              <div>
                <h2 className={s.panelTitle}>Kampanyalar</h2>
                <p className={s.panelSub}>Yayındaki bir öğeyi buradan duraklatabilirsiniz. Yayına almak için onay yazmanız gerekir.</p>
              </div>
            </div>
            {data.campaigns.length === 0 ? (
              <p className={s.empty}>Henüz kampanya yok.</p>
            ) : (
              <div className={s.tableScroll}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Ad</th>
                      <th>Durum</th>
                      <th className={s.num}>Günlük bütçe</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns.map((c) => (
                      <CampaignRows key={c.id} c={c} busy={busy} onLive={goLive} onPause={pause} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <CampaignForm busy={busy} data={data} post={post} />
          <AdSetForm busy={busy} data={data} post={post} />
          <AdForm busy={busy} data={data} post={post} />
        </>
      )}
    </div>
  )
}

function CampaignRows({ c, busy, onLive, onPause }: { c: MetaCampaign; busy: boolean; onLive: (id: string, name: string) => void; onPause: (id: string) => void }) {
  const Actions = ({ id, name, status }: { id: string; name: string; status: string }) =>
    status === 'ACTIVE' ? (
      <button type="button" className={s.seg} disabled={busy} onClick={() => onPause(id)}>
        Duraklat
      </button>
    ) : status === 'PAUSED' ? (
      <button type="button" className={s.seg} disabled={busy} onClick={() => onLive(id, name)}>
        Yayına al
      </button>
    ) : null
  return (
    <>
      <tr>
        <td className={s.pathCell} style={{ whiteSpace: 'normal' }}>
          <strong>{c.name}</strong> <span style={{ color: 'var(--text-muted)' }}>· {OBJECTIVE_TR[c.objective] ?? c.objective}</span>
        </td>
        <td>{statusText(c.effectiveStatus)}</td>
        <td className={s.num}>{money(c.dailyBudget)}</td>
        <td className={s.num}>
          <Actions id={c.id} name={c.name} status={c.status} />
        </td>
      </tr>
      {c.adSets.map((set) => (
        <FragmentRows key={set.id}>
          <tr>
            <td className={s.pathCell} style={{ paddingLeft: 24, whiteSpace: 'normal' }}>
              ↳ {set.name}
            </td>
            <td>{statusText(set.effectiveStatus)}</td>
            <td className={s.num}>{set.dailyBudget !== null ? money(set.dailyBudget) : set.lifetimeBudget !== null ? `${money(set.lifetimeBudget)} (toplam)` : '—'}</td>
            <td className={s.num}>
              <Actions id={set.id} name={set.name} status={set.status} />
            </td>
          </tr>
          {set.ads.map((ad) => (
            <tr key={ad.id}>
              <td className={s.pathCell} style={{ paddingLeft: 48, whiteSpace: 'normal' }}>
                ↳ {ad.name}
              </td>
              <td>{statusText(ad.effectiveStatus)}</td>
              <td />
              <td className={s.num}>
                <Actions id={ad.id} name={ad.name} status={ad.status} />
              </td>
            </tr>
          ))}
        </FragmentRows>
      ))}
    </>
  )
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

type Post = (body: Record<string, unknown>, success: string) => Promise<boolean>

function Buttons({ busy, onValidate, onCreate }: { busy: boolean; onValidate: () => void; onCreate: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '0 1rem 1rem' }}>
      <button type="button" className={s.seg} disabled={busy} onClick={onValidate}>
        Meta’ya doğrulat (oluşturmaz)
      </button>
      <button type="button" className={s.segActive} disabled={busy} onClick={onCreate}>
        Duraklatılmış oluştur
      </button>
    </div>
  )
}

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

function CampaignForm({ busy, data, post }: { busy: boolean; data: Data; post: Post }) {
  const [name, setName] = useState('')
  const [objective, setObjective] = useState<Objective>('OUTCOME_TRAFFIC')
  const [budget, setBudget] = useState('')
  const body = (validateOnly: boolean) => ({ action: 'create-campaign', validateOnly, name, objective, dailyBudget: num(budget) })
  return (
    <section className={s.panel} style={{ marginTop: '1.5rem' }}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>1. Yeni kampanya</h2>
          <p className={s.panelSub}>Bütçeyi burada girerseniz tüm reklam setleri paylaşır; boş bırakırsanız her reklam setine ayrı bütçe girersiniz.</p>
        </div>
      </div>
      <div style={row}>
        <label style={field}>
          Kampanya adı
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>
        <label style={field}>
          Amaç
          <select value={objective} onChange={(e) => setObjective(e.target.value as Objective)}>
            {data.options?.objectives.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={field}>
          Günlük bütçe (₺, isteğe bağlı)
          <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="250" />
        </label>
      </div>
      <Buttons
        busy={busy}
        onValidate={() => void post(body(true), 'Meta isteği geçerli buldu. Hiçbir şey oluşturulmadı.')}
        onCreate={() => void post(body(false), 'Kampanya duraklatılmış olarak oluşturuldu.').then((ok) => ok && setName(''))}
      />
    </section>
  )
}

function AdSetForm({ busy, data, post }: { busy: boolean; data: Data; post: Post }) {
  const [campaignId, setCampaignId] = useState('')
  const [name, setName] = useState('')
  const [budgetKind, setBudgetKind] = useState<'daily' | 'lifetime'>('daily')
  const [budget, setBudget] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [countries, setCountries] = useState('TR')
  const [ageMin, setAgeMin] = useState('18')
  const [ageMax, setAgeMax] = useState('65')
  const [gender, setGender] = useState<Gender>('all')
  const [placements, setPlacements] = useState<PlacementValue[]>([])
  const [audiences, setAudiences] = useState<string[]>([])
  const [advantage, setAdvantage] = useState(false)

  const campaign = data.campaigns.find((c) => c.id === campaignId)
  const hasBudget = campaign?.dailyBudget != null
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const body = (validateOnly: boolean) => ({
    action: 'create-adset',
    validateOnly,
    campaignId,
    objective: campaign?.objective,
    campaignHasBudget: hasBudget,
    name,
    dailyBudget: !hasBudget && budgetKind === 'daily' ? num(budget) : null,
    lifetimeBudget: !hasBudget && budgetKind === 'lifetime' ? num(budget) : null,
    startTime: start ? new Date(start).toISOString() : null,
    endTime: end ? new Date(end).toISOString() : null,
    countries: countries.split(/[,\s]+/).filter(Boolean),
    ageMin: Number(ageMin),
    ageMax: Number(ageMax),
    gender,
    placements,
    customAudienceIds: audiences,
    advantageAudience: advantage,
  })

  return (
    <section className={s.panel} style={{ marginTop: '1.5rem' }}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>2. Yeni reklam seti</h2>
          <p className={s.panelSub}>Kime, nerede ve ne kadar bütçeyle gösterileceği.</p>
        </div>
      </div>
      <div style={row}>
        <label style={field}>
          Kampanya
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">Seçin…</option>
            {data.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label style={field}>
          Reklam seti adı
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>
        {campaign && hasBudget ? (
          <p style={{ ...field, alignSelf: 'end' }}>Bütçe kampanyada tanımlı ({money(campaign.dailyBudget)} / gün).</p>
        ) : (
          <>
            <label style={field}>
              Bütçe türü
              <select value={budgetKind} onChange={(e) => setBudgetKind(e.target.value as 'daily' | 'lifetime')}>
                <option value="daily">Günlük</option>
                <option value="lifetime">Toplam (bitiş tarihi ister)</option>
              </select>
            </label>
            <label style={field}>
              Bütçe (₺)
              <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="250" />
            </label>
          </>
        )}
        <label style={field}>
          Başlangıç (boşsa hemen)
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label style={field}>
          Bitiş (isteğe bağlı)
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div style={row}>
        <label style={field}>
          Ülkeler (kod, virgülle)
          <input value={countries} onChange={(e) => setCountries(e.target.value)} />
        </label>
        <label style={{ ...field, minWidth: 80 }}>
          En küçük yaş
          <input inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
        </label>
        <label style={{ ...field, minWidth: 80 }}>
          En büyük yaş
          <input inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
        </label>
        <label style={field}>
          Cinsiyet
          <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="all">Hepsi</option>
            <option value="female">Kadın</option>
            <option value="male">Erkek</option>
          </select>
        </label>
      </div>
      <fieldset style={{ ...row, border: 0, margin: 0 }}>
        <legend style={{ fontSize: '0.8rem', padding: '0 1rem 4px' }}>Yerleşimler (hiçbiri seçili değilse Meta otomatik seçer — Advantage+)</legend>
        {data.options?.placements.map((p) => (
          <label key={p.value} style={{ fontSize: '0.85rem' }}>
            <input type="checkbox" checked={placements.includes(p.value)} onChange={() => setPlacements(toggle(placements, p.value))} /> {p.label}
          </label>
        ))}
      </fieldset>
      <fieldset style={{ ...row, border: 0, margin: 0 }}>
        <legend style={{ fontSize: '0.8rem', padding: '0 1rem 4px' }}>Hedef kitle (hesabınızdaki kayıtlı kitleler; hiçbiri seçili değilse yaş/cinsiyet/ülkeye göre)</legend>
        {data.audiences.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Kayıtlı kitle yok.</span>}
        {data.audiences.map((a) => (
          <label key={a.id} style={{ fontSize: '0.85rem' }}>
            <input type="checkbox" checked={audiences.includes(a.id)} onChange={() => setAudiences(toggle(audiences, a.id))} /> {a.name}
            {a.size ? ` (~${a.size.toLocaleString('tr-TR')})` : ''}
          </label>
        ))}
        <label style={{ fontSize: '0.85rem' }}>
          <input type="checkbox" checked={advantage} onChange={(e) => setAdvantage(e.target.checked)} /> Meta daha iyi kişi bulursa kitleyi genişletebilsin
        </label>
      </fieldset>
      <Buttons
        busy={busy || !campaign}
        onValidate={() => void post(body(true), 'Meta isteği geçerli buldu. Hiçbir şey oluşturulmadı.')}
        onCreate={() => void post(body(false), 'Reklam seti duraklatılmış olarak oluşturuldu.').then((ok) => ok && setName(''))}
      />
    </section>
  )
}

function AdForm({ busy, data, post }: { busy: boolean; data: Data; post: Post }) {
  const [adSetId, setAdSetId] = useState('')
  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageHash, setImageHash] = useState('')
  const [primaryText, setPrimaryText] = useState('')
  const [headline, setHeadline] = useState('')
  const [description, setDescription] = useState('')
  const [cta, setCta] = useState<CtaValue>('SHOP_NOW')
  const [landingUrl, setLandingUrl] = useState('https://www.zuulab.com/')
  const sets = data.campaigns.flatMap((c) => c.adSets.map((a) => ({ id: a.id, label: `${c.name} › ${a.name}` })))
  const body = (validateOnly: boolean) => ({
    action: 'create-ad',
    validateOnly,
    adSetId,
    name,
    imageUrl: imageHash ? null : imageUrl || null,
    imageHash: imageHash || null,
    primaryText,
    headline,
    description: description || null,
    cta,
    landingUrl,
  })
  return (
    <section className={s.panel} style={{ marginTop: '1.5rem' }}>
      <div className={s.panelHead}>
        <div>
          <h2 className={s.panelTitle}>3. Yeni reklam</h2>
          <p className={s.panelSub}>
            Açılış adresine kampanya takip parametreleri (utm) Meta tarafından otomatik eklenir; satışlar böylece reklamla eşleşir.
          </p>
        </div>
      </div>
      <div style={row}>
        <label style={field}>
          Reklam seti
          <select value={adSetId} onChange={(e) => setAdSetId(e.target.value)}>
            <option value="">Seçin…</option>
            {sets.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label style={field}>
          Reklam adı
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>
        <label style={field}>
          Eylem düğmesi
          <select value={cta} onChange={(e) => setCta(e.target.value as CtaValue)}>
            {data.options?.ctas.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={row}>
        <label style={{ ...field, flex: 1, minWidth: 260 }}>
          Görsel adresi (https)
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://res.cloudinary.com/…" disabled={Boolean(imageHash)} />
        </label>
        <label style={field}>
          …veya hesaptaki görsel
          <select value={imageHash} onChange={(e) => setImageHash(e.target.value)}>
            <option value="">Seçmeyin</option>
            {data.images.map((i) => (
              <option key={i.hash} value={i.hash}>
                {i.name || i.hash.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={row}>
        <label style={{ ...field, flex: 1, minWidth: 260 }}>
          Ana metin
          <textarea value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} rows={3} maxLength={2000} />
        </label>
        <label style={field}>
          Başlık
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={100} />
        </label>
        <label style={field}>
          Açıklama (isteğe bağlı)
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </label>
      </div>
      <div style={row}>
        <label style={{ ...field, flex: 1 }}>
          Açılış adresi
          <input value={landingUrl} onChange={(e) => setLandingUrl(e.target.value)} />
        </label>
      </div>
      <Buttons
        busy={busy || !adSetId}
        onValidate={() => void post(body(true), 'Meta isteği geçerli buldu. Hiçbir şey oluşturulmadı.')}
        onCreate={() => void post(body(false), 'Reklam duraklatılmış olarak oluşturuldu.').then((ok) => ok && setName(''))}
      />
    </section>
  )
}
