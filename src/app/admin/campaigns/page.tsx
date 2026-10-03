'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { SkeletonRows } from '@/components/common/Skeleton'
import { useAdminCatalogOptions } from '@/hooks/useAdminCatalogOptions'
import styles from '../admin.module.css'
import c from './Campaigns.module.css'

type Kind = 'DISCOUNT' | 'ANNOUNCEMENT'
type DType = 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'
type Audience = 'ALL' | 'FIRST_ORDER'
type Display = 'NONE' | 'MODAL' | 'RIBBON'

interface Campaign {
  id: string
  name: string
  description: string | null
  kind: Kind
  type: DType
  discountValue: number
  maxDiscount: number | null
  minSubtotal: number | null
  audience: Audience
  categoryIds: string[]
  couponCode: string | null
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  display: Display
  headline: string | null
  message: string | null
  ctaLabel: string | null
  ctaHref: string | null
  imageUrl: string | null
  priority: number
  orderCount: number
}

type Draft = Omit<Campaign, 'id' | 'orderCount'> & { id?: string }

const TEMPLATES: Array<{ key: string; title: string; desc: string; draft: Partial<Draft> }> = [
  {
    key: 'cart',
    title: 'Sepet indirimi',
    desc: 'Belirli tutarın üzerindeki sepetlere otomatik indirim.',
    draft: { kind: 'DISCOUNT', type: 'PERCENTAGE', discountValue: 10, minSubtotal: 1000, audience: 'ALL', name: 'Sepette %10', headline: '1000 ₺ üzeri sepette %10 indirim', display: 'RIBBON' },
  },
  {
    key: 'welcome',
    title: 'Üyelik / ilk sipariş',
    desc: 'Üye olup ilk siparişini veren müşteriye indirim.',
    draft: { kind: 'DISCOUNT', type: 'FIXED', discountValue: 100, audience: 'FIRST_ORDER', name: 'Hoş geldin indirimi', headline: 'İlk siparişine 100 ₺ indirim', message: 'Üye ol, ilk siparişinde indirim sepette otomatik uygulanır.', ctaLabel: 'Alışverişe başla', ctaHref: '/urunler', display: 'MODAL' },
  },
  {
    key: 'freeship',
    title: 'Ücretsiz kargo',
    desc: 'Bir dönem için kargoyu bedava yapın.',
    draft: { kind: 'DISCOUNT', type: 'FREE_SHIPPING', discountValue: 0, audience: 'ALL', name: 'Kargo bedava haftası', headline: 'Bu hafta tüm siparişlerde kargo bedava', display: 'RIBBON' },
  },
  {
    key: 'season',
    title: 'Dönemsel duyuru',
    desc: 'Fiyatı değiştirmeden bir dönemi, koleksiyonu ya da kupon kodunu duyurun.',
    draft: { kind: 'ANNOUNCEMENT', type: 'PERCENTAGE', discountValue: 0, audience: 'ALL', name: 'Yılbaşı', headline: 'Yılbaşı hediyeleri burada', message: 'Sevdiklerine tasarım hediye et.', ctaLabel: 'Hediyeleri gör', ctaHref: '/urunler', display: 'MODAL' },
  },
]

function emptyDraft(): Draft {
  return {
    name: '',
    description: null,
    kind: 'DISCOUNT',
    type: 'PERCENTAGE',
    discountValue: 10,
    maxDiscount: null,
    minSubtotal: null,
    audience: 'ALL',
    categoryIds: [],
    couponCode: null,
    isActive: true,
    startsAt: null,
    endsAt: null,
    display: 'NONE',
    headline: null,
    message: null,
    ctaLabel: null,
    ctaHref: null,
    imageUrl: null,
    priority: 0,
  }
}

/** ISO → value for <input type="datetime-local"> in local time */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function statusOf(x: Campaign): { label: string; tone: 'live' | 'planned' | 'ended' | 'off' } {
  const now = Date.now()
  if (!x.isActive) return { label: 'Kapalı', tone: 'off' }
  if (x.endsAt && new Date(x.endsAt).getTime() < now) return { label: 'Sona erdi', tone: 'ended' }
  if (x.startsAt && new Date(x.startsAt).getTime() > now) return { label: 'Planlandı', tone: 'planned' }
  return { label: 'Yayında', tone: 'live' }
}

function summary(x: Pick<Campaign, 'kind' | 'type' | 'discountValue' | 'minSubtotal' | 'audience' | 'maxDiscount'>): string {
  if (x.kind === 'ANNOUNCEMENT') return 'Sadece duyuru — fiyat değişmez'
  const what =
    x.type === 'FREE_SHIPPING' ? 'Ücretsiz kargo' : x.type === 'PERCENTAGE' ? `%${x.discountValue} indirim` : `${x.discountValue} ₺ indirim`
  const parts = [what]
  if (x.type === 'PERCENTAGE' && x.maxDiscount) parts.push(`en fazla ${x.maxDiscount} ₺`)
  if (x.minSubtotal) parts.push(`${x.minSubtotal} ₺ üzeri sepet`)
  if (x.audience === 'FIRST_ORDER') parts.push('ilk sipariş')
  return parts.join(' · ')
}

const DISPLAY_LABEL: Record<Display, string> = { NONE: 'Sitede gösterilmez', MODAL: 'Açılır pencere', RIBBON: 'Üst şerit' }

export default function AdminCampaignsPage() {
  const { token, canFetch } = useAuthStore()
  const { categories } = useAdminCatalogOptions()
  const [list, setList] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Campaign | null>(null)

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const load = useCallback(() => {
    if (!canFetch) return
    fetch('/api/admin/campaigns', { headers, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setList(d.campaigns)
        else toast.error(d.error || 'Kampanyalar alınamadı.')
      })
      .catch(() => toast.error('Kampanyalar alınamadı.'))
      .finally(() => setLoading(false))
  }, [canFetch, headers])

  useEffect(() => {
    load()
  }, [load])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))

  const save = async () => {
    if (!draft) return
    setSaving(true)
    const body = { ...draft, startsAt: draft.startsAt || null, endsAt: draft.endsAt || null }
    const res = await fetch(draft.id ? `/api/admin/campaigns/${draft.id}` : '/api/admin/campaigns', {
      method: draft.id ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!d.success) return toast.error(d.error || 'Kampanya kaydedilemedi.')
    toast.success(draft.id ? 'Kampanya güncellendi.' : 'Kampanya oluşturuldu.')
    setDraft(null)
    load()
  }

  const toggle = async (x: Campaign) => {
    setList((l) => l.map((i) => (i.id === x.id ? { ...i, isActive: !x.isActive } : i)))
    const res = await fetch(`/api/admin/campaigns/${x.id}`, { method: 'PATCH', headers, body: JSON.stringify({ isActive: !x.isActive }) })
    const d = await res.json().catch(() => ({}))
    if (!d.success) {
      toast.error(d.error || 'Değiştirilemedi.')
      load()
    }
  }

  const remove = async () => {
    if (!deleting) return
    const res = await fetch(`/api/admin/campaigns/${deleting.id}`, { method: 'DELETE', headers })
    const d = await res.json().catch(() => ({}))
    if (!d.success) return toast.error(d.error || 'Silinemedi.')
    toast.success('Kampanya silindi.')
    setDeleting(null)
    load()
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Kampanyalar</h1>
          <p className={styles.pageSubtitle}>
            Kod gerektirmeyen, sepette kendiliğinden uygulanan indirimler ve sitede gösterilen duyurular. Kodla kullanılan indirimler için Kuponlar sayfası.
          </p>
        </div>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setDraft(emptyDraft())}>
          Yeni kampanya
        </button>
      </div>

      <section className={c.templates} aria-label="Hızlı başlangıç">
        {TEMPLATES.map((t) => (
          <button key={t.key} type="button" className={c.template} onClick={() => setDraft({ ...emptyDraft(), ...t.draft })}>
            <span className={c.templateTitle}>{t.title}</span>
            <span className={c.templateDesc}>{t.desc}</span>
          </button>
        ))}
      </section>

      {loading ? (
        <SkeletonRows rows={3} />
      ) : list.length === 0 ? (
        <div className={styles.emptyState}>Henüz kampanya yok. Yukarıdaki şablonlardan biriyle başlayabilirsiniz.</div>
      ) : (
        <div className={c.list}>
          {list.map((x) => {
            const st = statusOf(x)
            return (
              <article key={x.id} className={c.card}>
                <div className={c.cardMain}>
                  <div className={c.cardTop}>
                    <span className={`${c.status} ${c[st.tone]}`}>{st.label}</span>
                    <span className={c.kind}>{x.kind === 'DISCOUNT' ? 'Otomatik indirim' : 'Duyuru'}</span>
                  </div>
                  <h3 className={c.cardTitle}>{x.name}</h3>
                  <p className={c.cardSummary}>{summary(x)}</p>
                  <p className={c.cardMeta}>
                    {x.startsAt || x.endsAt
                      ? `${x.startsAt ? new Date(x.startsAt).toLocaleDateString('tr-TR') : 'Şimdi'} → ${x.endsAt ? new Date(x.endsAt).toLocaleDateString('tr-TR') : 'süresiz'}`
                      : 'Süresiz'}
                    {' · '}
                    {DISPLAY_LABEL[x.display]}
                    {x.kind === 'DISCOUNT' && ` · ${x.orderCount} siparişte kullanıldı`}
                  </p>
                </div>
                <div className={c.cardActions}>
                  <label className={c.switch} title={x.isActive ? 'Kapat' : 'Aç'}>
                    <input type="checkbox" checked={x.isActive} onChange={() => toggle(x)} aria-label={`${x.name} açık`} />
                    <span />
                  </label>
                  <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={() => setDraft({ ...x })}>
                    Düzenle
                  </button>
                  <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => setDeleting(x)}>
                    Sil
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal isOpen={Boolean(draft)} onClose={() => setDraft(null)} maxWidth="860px" ariaLabel="Kampanya düzenle">
        {draft && (
          <div className={c.editor}>
            <div className={c.editorForm}>
              <h3 className={c.editorTitle}>{draft.id ? 'Kampanyayı düzenle' : 'Yeni kampanya'}</h3>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="cmp-name">Kampanya adı (müşteri sepette görür)</label>
                <input id="cmp-name" className={styles.formInput} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Örn: Sepette %10" />
              </div>

              <fieldset className={c.fieldset}>
                <legend className={styles.formLabel}>Ne yapsın?</legend>
                <div className={c.segment}>
                  <button type="button" aria-pressed={draft.kind === 'DISCOUNT'} onClick={() => set('kind', 'DISCOUNT')}>Sepette indirim</button>
                  <button type="button" aria-pressed={draft.kind === 'ANNOUNCEMENT'} onClick={() => set('kind', 'ANNOUNCEMENT')}>Sadece duyuru</button>
                </div>
              </fieldset>

              {draft.kind === 'DISCOUNT' && (
                <>
                  <div className={c.grid2}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="cmp-type">İndirim türü</label>
                      <select id="cmp-type" className={styles.formSelect} value={draft.type} onChange={(e) => set('type', e.target.value as DType)}>
                        <option value="PERCENTAGE">Yüzde (%)</option>
                        <option value="FIXED">Tutar (₺)</option>
                        <option value="FREE_SHIPPING">Ücretsiz kargo</option>
                      </select>
                    </div>
                    {draft.type !== 'FREE_SHIPPING' && (
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel} htmlFor="cmp-value">{draft.type === 'PERCENTAGE' ? 'Yüzde' : 'Tutar (₺)'}</label>
                        <input id="cmp-value" type="number" min="0" step="0.01" className={styles.formInput} value={draft.discountValue} onChange={(e) => set('discountValue', Number(e.target.value))} />
                      </div>
                    )}
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="cmp-min">En az sepet tutarı (₺)</label>
                      <input id="cmp-min" type="number" min="0" className={styles.formInput} value={draft.minSubtotal ?? ''} placeholder="Sınır yok" onChange={(e) => set('minSubtotal', e.target.value === '' ? null : Number(e.target.value))} />
                    </div>
                    {draft.type === 'PERCENTAGE' && (
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel} htmlFor="cmp-max">En fazla indirim (₺)</label>
                        <input id="cmp-max" type="number" min="0" className={styles.formInput} value={draft.maxDiscount ?? ''} placeholder="Sınır yok" onChange={(e) => set('maxDiscount', e.target.value === '' ? null : Number(e.target.value))} />
                      </div>
                    )}
                  </div>

                  <fieldset className={c.fieldset}>
                    <legend className={styles.formLabel}>Kimler için?</legend>
                    <div className={c.segment}>
                      <button type="button" aria-pressed={draft.audience === 'ALL'} onClick={() => set('audience', 'ALL')}>Herkes</button>
                      <button type="button" aria-pressed={draft.audience === 'FIRST_ORDER'} onClick={() => set('audience', 'FIRST_ORDER')}>Üye, ilk siparişi</button>
                    </div>
                  </fieldset>

                  {draft.type !== 'FREE_SHIPPING' && categories.length > 0 && (
                    <fieldset className={c.fieldset}>
                      <legend className={styles.formLabel}>Hangi ürünlerde? (seçilmezse tüm ürünler)</legend>
                      <div className={c.chips}>
                        {categories.map((cat) => {
                          const on = draft.categoryIds.includes(cat.id)
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              aria-pressed={on}
                              className={`${c.chip} ${on ? c.chipOn : ''}`}
                              onClick={() => set('categoryIds', on ? draft.categoryIds.filter((i) => i !== cat.id) : [...draft.categoryIds, cat.id])}
                            >
                              {cat.name}
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>
                  )}
                </>
              )}

              {draft.kind === 'ANNOUNCEMENT' && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="cmp-code">Duyurulacak kupon kodu (isteğe bağlı)</label>
                  <input id="cmp-code" className={`${styles.formInput} ${c.mono}`} value={draft.couponCode ?? ''} placeholder="Örn: YILBASI15" onChange={(e) => set('couponCode', e.target.value.toUpperCase() || null)} />
                  <span className={styles.formHelp}>Kodu Kuponlar sayfasında da oluşturmayı unutmayın; burada yalnızca gösterilir.</span>
                </div>
              )}

              <div className={c.grid2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="cmp-start">Başlangıç</label>
                  <input id="cmp-start" type="datetime-local" className={styles.formInput} value={toLocalInput(draft.startsAt)} onChange={(e) => set('startsAt', e.target.value ? new Date(e.target.value).toISOString() : null)} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="cmp-end">Bitiş</label>
                  <input id="cmp-end" type="datetime-local" className={styles.formInput} value={toLocalInput(draft.endsAt)} onChange={(e) => set('endsAt', e.target.value ? new Date(e.target.value).toISOString() : null)} />
                </div>
              </div>

              <fieldset className={c.fieldset}>
                <legend className={styles.formLabel}>Sitede nasıl duyurulsun?</legend>
                <div className={c.segment}>
                  {(['NONE', 'RIBBON', 'MODAL'] as Display[]).map((dv) => (
                    <button
                      key={dv}
                      type="button"
                      aria-pressed={draft.display === dv}
                      onClick={() => setDraft((d) => (d ? { ...d, display: dv, headline: d.headline || (dv !== 'NONE' ? d.name : d.headline) } : d))}
                    >
                      {DISPLAY_LABEL[dv]}
                    </button>
                  ))}
                </div>
              </fieldset>

              {draft.display !== 'NONE' && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="cmp-headline">Başlık</label>
                    <input id="cmp-headline" className={styles.formInput} value={draft.headline ?? ''} onChange={(e) => set('headline', e.target.value)} />
                  </div>
                  {draft.display === 'MODAL' && (
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="cmp-message">Açıklama</label>
                      <textarea id="cmp-message" rows={2} className={styles.formTextarea} value={draft.message ?? ''} onChange={(e) => set('message', e.target.value)} />
                    </div>
                  )}
                  <div className={c.grid2}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="cmp-cta">Buton yazısı</label>
                      <input id="cmp-cta" className={styles.formInput} value={draft.ctaLabel ?? ''} placeholder="Örn: Ürünleri gör" onChange={(e) => set('ctaLabel', e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="cmp-href">Buton bağlantısı</label>
                      <input id="cmp-href" className={styles.formInput} value={draft.ctaHref ?? ''} placeholder="/urunler" onChange={(e) => set('ctaHref', e.target.value)} />
                    </div>
                  </div>
                  {draft.display === 'MODAL' && (
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="cmp-img">Görsel adresi (isteğe bağlı)</label>
                      <input id="cmp-img" className={styles.formInput} value={draft.imageUrl ?? ''} placeholder="https://…" onChange={(e) => set('imageUrl', e.target.value)} />
                    </div>
                  )}
                </>
              )}

              <div className={c.editorActions}>
                <label className={c.inlineCheck}>
                  <input type="checkbox" checked={draft.isActive} onChange={(e) => set('isActive', e.target.checked)} />
                  Açık
                </label>
                <span style={{ flex: 1 }} />
                <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setDraft(null)}>Vazgeç</button>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving}>
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>

            {/* Live preview: a small mock of the site showing where the campaign appears */}
            <aside className={c.preview} aria-label="Önizleme">
              <span className={c.previewLabel}>Sitede görünüşü</span>
              <div className={c.mock}>
                {draft.display === 'RIBBON' && (
                  <div className={c.mockRibbon}>
                    <span>{draft.headline || draft.name || 'Başlık'}</span>
                    {draft.ctaLabel && <u>{draft.ctaLabel} →</u>}
                  </div>
                )}
                <div className={c.mockHeader}>
                  <b>zuulab.</b>
                  <i />
                  <i />
                  <i />
                </div>
                <div className={c.mockPage}>
                  <i className={c.mockHero} />
                  <div className={c.mockRow}>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                {draft.display === 'MODAL' && (
                  <div className={c.mockOverlay}>
                    <div className={c.mockModal}>
                      {draft.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={draft.imageUrl} alt="" />
                      )}
                      {draft.kind === 'DISCOUNT' && <span className={c.mockLabel}>{summary(draft).split(' · ')[0]}</span>}
                      <strong>{draft.headline || draft.name || 'Başlık'}</strong>
                      {draft.message && <p>{draft.message}</p>}
                      {draft.couponCode && <code>{draft.couponCode}</code>}
                      <div className={c.mockActions}>
                        {draft.ctaLabel && <span className={c.previewBtn}>{draft.ctaLabel}</span>}
                        <span className={c.mockGhost}>Kapat</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <p className={c.previewNote}>
                {draft.display === 'NONE'
                  ? 'Sitede ayrıca duyurulmaz. İndirim yine sepette kendiliğinden uygulanır.'
                  : draft.display === 'RIBBON'
                    ? 'Sayfanın en üstündeki kayan duyuru bandında, diğer duyurulardan önce gösterilir.'
                    : 'Ziyaretçi siteye girdikten birkaç saniye sonra bir kez açılır. Sepet, ödeme ve hesap sayfalarında açılmaz.'}
              </p>
              <p className={c.previewSummary}>{summary(draft)}</p>
            </aside>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} ariaLabel="Kampanyayı sil">
        {deleting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>&ldquo;{deleting.name}&rdquo; silinsin mi?</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
              Geçmiş siparişlerdeki indirim tutarları korunur. Geçici olarak durdurmak için silmek yerine kapatabilirsiniz.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setDeleting(null)}>Vazgeç</button>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={remove}>Sil</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
