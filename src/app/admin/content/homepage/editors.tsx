'use client'

import { useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import {
  SECTION_TEMPLATES,
  type BannerSettings,
  type HeroSlide,
  type HomeSection,
  type ProductRailSettings,
  type SectionType,
  type SpotlightSettings,
  type TextCtaSettings,
} from '@/lib/cms/homepage'
import styles from '../../admin.module.css'
import h from './Homepage.module.css'

export interface Option {
  value: string
  label: string
}

export interface CatalogOptions {
  products: Option[]
  collections: Option[]
  categories: Option[]
}

// ── Small building blocks ──────────────────────────────────

export function Field({ label, htmlFor, help, children }: { label: string; htmlFor?: string; help?: string; children: React.ReactNode }) {
  return (
    <div className={styles.formGroup}>
      <label className={styles.formLabel} htmlFor={htmlFor}>{label}</label>
      {children}
      {help && <span className={styles.formHelp}>{help}</span>}
    </div>
  )
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return <input id={id} className={styles.formInput} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className={h.segment} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={h.switch} title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  )
}

/** Image URL with an upload button and a thumbnail */
export function ImageField({ id, label, value, onChange, help }: { id: string; label: string; value: string; onChange: (url: string) => void; help?: string }) {
  const { token } = useAuthStore()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File) => {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/admin/media/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
      const d = await res.json()
      if (d.success && d.url) {
        onChange(d.url)
        toast.success('Görsel yüklendi.')
      } else toast.error(d.error || 'Görsel yüklenemedi.')
    } catch {
      toast.error('Görsel yüklenemedi.')
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Field label={label} htmlFor={id} help={help}>
      <div className={h.imageField}>
        <button type="button" className={h.thumb} onClick={() => input.current?.click()} disabled={uploading} aria-label={`${label}: dosya seç`}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" />
          ) : (
            <span>{uploading ? '…' : 'Yükle'}</span>
          )}
        </button>
        <div className={h.imageFieldSide}>
          <input id={id} className={styles.formInput} value={value} placeholder="https://… ya da dosya yükleyin" onChange={(e) => onChange(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={() => input.current?.click()} disabled={uploading}>
              {uploading ? 'Yükleniyor…' : 'Dosyadan yükle'}
            </button>
            {value && (
              <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => onChange('')}>
                Kaldır
              </button>
            )}
          </div>
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
    </Field>
  )
}

function Select({ id, value, options, onChange, empty }: { id: string; value: string; options: Option[]; onChange: (v: string) => void; empty?: string }) {
  return (
    <select id={id} className={styles.formSelect} value={value} onChange={(e) => onChange(e.target.value)}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ── Hero slide editor ──────────────────────────────────────

export function SlidePreview({ slide, productName }: { slide: HeroSlide; productName?: string }) {
  const dark = slide.theme === 'dark'
  const secondary =
    slide.secondaryMode === 'product' ? slide.secondaryLabel || productName : slide.secondaryMode === 'link' ? slide.secondaryLabel : ''
  return (
    <div className={`${h.slidePreview} ${dark ? h.slidePreviewDark : ''}`}>
      {slide.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slide.imageUrl} alt="" style={{ objectPosition: slide.focus === 'left' ? '22% 40%' : slide.focus === 'right' ? '78% 40%' : 'center 38%' }} />
      )}
      <div className={h.slidePreviewScrim} />
      <div className={h.slidePreviewText}>
        <span className={h.slidePreviewBadge}>
          <i style={{ background: slide.accent === 'yellow' ? 'var(--zuu-yellow)' : 'var(--zuu-blue)' }} />
          {slide.badge || 'rozet'}
        </span>
        <strong>{slide.headline || 'başlık'}</strong>
        {slide.headlineAccent && <em>{slide.headlineAccent}</em>}
        {slide.description && <p>{slide.description}</p>}
        <div className={h.slidePreviewCtas}>
          <span>{slide.primaryLabel || 'ana buton'} →</span>
          {secondary && <span className={h.ghost}>{secondary}</span>}
        </div>
      </div>
    </div>
  )
}

export function SlideEditor({ slide, onChange, catalog }: { slide: HeroSlide; onChange: (s: HeroSlide) => void; catalog: CatalogOptions }) {
  const set = <K extends keyof HeroSlide>(k: K, v: HeroSlide[K]) => onChange({ ...slide, [k]: v })
  const productName = catalog.products.find((p) => p.value === slide.secondaryProductSlug)?.label

  return (
    <div className={h.editorPanel}>
      <SlidePreview slide={slide} productName={productName?.toLocaleLowerCase('tr-TR')} />

      <section className={h.group}>
        <h4>Görsel</h4>
        <ImageField id={`img-${slide.id}`} label="Geniş görsel (masaüstü)" value={slide.imageUrl} onChange={(v) => set('imageUrl', v)} help="En az 1920×1080. Metin solda durur; ürün sağda olsun." />
        <ImageField id={`mimg-${slide.id}`} label="Telefon görseli (isteğe bağlı)" value={slide.mobileImageUrl} onChange={(v) => set('mobileImageUrl', v)} help="Telefonda metnin üstünde, 5:4 oranında görünür. Boşsa geniş görsel kırpılır." />
        <div className={h.row2}>
          <Field label="Görselin odak noktası">
            <Segmented label="Odak" value={slide.focus} onChange={(v) => set('focus', v)} options={[{ value: 'left', label: 'Sol' }, { value: 'center', label: 'Orta' }, { value: 'right', label: 'Sağ' }]} />
          </Field>
          <Field label="Renk teması">
            <Segmented label="Tema" value={slide.theme} onChange={(v) => set('theme', v)} options={[{ value: 'light', label: 'Açık' }, { value: 'dark', label: 'Koyu' }]} />
          </Field>
        </div>
      </section>

      <section className={h.group}>
        <h4>Metin</h4>
        <div className={h.row2}>
          <Field label="Sekme adı" htmlFor={`lbl-${slide.id}`} help="Slaytın altındaki gezinme sekmesinde görünür.">
            <TextInput id={`lbl-${slide.id}`} value={slide.label} onChange={(v) => set('label', v)} maxLength={24} />
          </Field>
          <Field label="Rozet" htmlFor={`badge-${slide.id}`}>
            <TextInput id={`badge-${slide.id}`} value={slide.badge} onChange={(v) => set('badge', v)} maxLength={48} />
          </Field>
        </div>
        <Field label="Başlık" htmlFor={`h-${slide.id}`}>
          <TextInput id={`h-${slide.id}`} value={slide.headline} onChange={(v) => set('headline', v)} maxLength={48} />
        </Field>
        <Field label="Başlığın ikinci satırı (eğik)" htmlFor={`ha-${slide.id}`}>
          <TextInput id={`ha-${slide.id}`} value={slide.headlineAccent} onChange={(v) => set('headlineAccent', v)} maxLength={48} />
        </Field>
        <Field label="Açıklama" htmlFor={`d-${slide.id}`} help={`${slide.description.length}/180 · Telefonda en fazla üç satır görünür.`}>
          <textarea id={`d-${slide.id}`} rows={3} maxLength={180} className={styles.formTextarea} value={slide.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Rozet noktası rengi">
          <Segmented label="Vurgu rengi" value={slide.accent} onChange={(v) => set('accent', v)} options={[{ value: 'blue', label: 'Mavi' }, { value: 'yellow', label: 'Sarı' }]} />
        </Field>
      </section>

      <section className={h.group}>
        <h4>Butonlar</h4>
        <div className={h.row2}>
          <Field label="Ana buton yazısı" htmlFor={`pl-${slide.id}`}>
            <TextInput id={`pl-${slide.id}`} value={slide.primaryLabel} onChange={(v) => set('primaryLabel', v)} maxLength={32} />
          </Field>
          <Field label="Ana buton bağlantısı" htmlFor={`ph-${slide.id}`}>
            <TextInput id={`ph-${slide.id}`} value={slide.primaryHref} onChange={(v) => set('primaryHref', v)} placeholder="/koleksiyon/zuukids" />
          </Field>
        </div>
        <Field label="İkinci buton">
          <Segmented
            label="İkinci buton"
            value={slide.secondaryMode}
            onChange={(v) => set('secondaryMode', v)}
            options={[{ value: 'product', label: 'Bir ürün' }, { value: 'link', label: 'Bağlantı' }, { value: 'none', label: 'Yok' }]}
          />
        </Field>
        {slide.secondaryMode === 'product' && (
          <div className={h.row2}>
            <Field label="Ürün" htmlFor={`sp-${slide.id}`}>
              <Select id={`sp-${slide.id}`} value={slide.secondaryProductSlug} options={catalog.products} onChange={(v) => set('secondaryProductSlug', v)} empty="Ürün seçin" />
            </Field>
            <Field label="Buton yazısı" htmlFor={`sl-${slide.id}`} help="Boşsa ürünün adı yazar.">
              <TextInput id={`sl-${slide.id}`} value={slide.secondaryLabel} onChange={(v) => set('secondaryLabel', v)} maxLength={40} />
            </Field>
          </div>
        )}
        {slide.secondaryMode === 'link' && (
          <div className={h.row2}>
            <Field label="Buton yazısı" htmlFor={`sl2-${slide.id}`}>
              <TextInput id={`sl2-${slide.id}`} value={slide.secondaryLabel} onChange={(v) => set('secondaryLabel', v)} maxLength={40} />
            </Field>
            <Field label="Bağlantı" htmlFor={`sh-${slide.id}`}>
              <TextInput id={`sh-${slide.id}`} value={slide.secondaryHref} onChange={(v) => set('secondaryHref', v)} placeholder="/urunler" />
            </Field>
          </div>
        )}
      </section>
    </div>
  )
}

// ── Section editors ────────────────────────────────────────

function RailEditor({ s, set, catalog, id }: { s: ProductRailSettings; set: (s: ProductRailSettings) => void; catalog: CatalogOptions; id: string }) {
  const u = <K extends keyof ProductRailSettings>(k: K, v: ProductRailSettings[K]) => set({ ...s, [k]: v })
  return (
    <>
      <div className={h.row2}>
        <Field label="Üst etiket" htmlFor={`${id}-e`}><TextInput id={`${id}-e`} value={s.eyebrow} onChange={(v) => u('eyebrow', v)} /></Field>
        <Field label="Başlık" htmlFor={`${id}-t`}><TextInput id={`${id}-t`} value={s.title} onChange={(v) => u('title', v)} /></Field>
      </div>
      <Field label="Hangi ürünler?" htmlFor={`${id}-src`}>
        <select id={`${id}-src`} className={styles.formSelect} value={s.source} onChange={(e) => u('source', e.target.value as ProductRailSettings['source'])}>
          <option value="bestsellers">En çok satanlar</option>
          <option value="newest">En yeniler</option>
          <option value="favorites">En çok favorilenenler</option>
          <option value="collection">Bir koleksiyon</option>
          <option value="category">Bir kategori</option>
          <option value="manual">Seçtiğim ürünler</option>
        </select>
      </Field>
      {s.source === 'collection' && (
        <Field label="Koleksiyon" htmlFor={`${id}-col`}>
          <Select id={`${id}-col`} value={s.collectionSlug} options={catalog.collections} onChange={(v) => u('collectionSlug', v)} empty="Seçin" />
        </Field>
      )}
      {s.source === 'category' && (
        <Field label="Kategori" htmlFor={`${id}-cat`}>
          <Select id={`${id}-cat`} value={s.categorySlug} options={catalog.categories} onChange={(v) => u('categorySlug', v)} empty="Seçin" />
        </Field>
      )}
      {s.source === 'manual' && (
        <Field label="Ürünler (sırası korunur)">
          <div className={h.pickList}>
            {s.productSlugs.map((slug, i) => (
              <span key={slug} className={h.pick}>
                {catalog.products.find((p) => p.value === slug)?.label ?? slug}
                <button type="button" aria-label="Çıkar" onClick={() => u('productSlugs', s.productSlugs.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>
          <select
            className={styles.formSelect}
            value=""
            aria-label="Ürün ekle"
            onChange={(e) => e.target.value && u('productSlugs', [...s.productSlugs, e.target.value])}
          >
            <option value="">+ ürün ekle</option>
            {catalog.products.filter((p) => !s.productSlugs.includes(p.value)).map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>
      )}
      <div className={h.row2}>
        <Field label="Kart sayısı">
          <Segmented label="Kart sayısı" value={String(s.limit) as '4' | '8'} onChange={(v) => u('limit', Number(v) as 4 | 8)} options={[{ value: '4', label: '4 ürün' }, { value: '8', label: '8 ürün' }]} />
        </Field>
        <Field label="Arka plan">
          <Segmented label="Arka plan" value={s.tone} onChange={(v) => u('tone', v)} options={[{ value: 'plain', label: 'Beyaz' }, { value: 'muted', label: 'Gri' }]} />
        </Field>
      </div>
      <div className={h.row2}>
        <Field label="'Tümünü gör' yazısı" htmlFor={`${id}-va`}><TextInput id={`${id}-va`} value={s.viewAllLabel} onChange={(v) => u('viewAllLabel', v)} /></Field>
        <Field label="'Tümünü gör' bağlantısı" htmlFor={`${id}-vh`} help="Boşsa seçilen ürün kaynağına gider."><TextInput id={`${id}-vh`} value={s.viewAllHref} onChange={(v) => u('viewAllHref', v)} /></Field>
      </div>
    </>
  )
}

function SpotlightEditor({ s, set, catalog, id }: { s: SpotlightSettings; set: (s: SpotlightSettings) => void; catalog: CatalogOptions; id: string }) {
  const u = <K extends keyof SpotlightSettings>(k: K, v: SpotlightSettings[K]) => set({ ...s, [k]: v })
  return (
    <>
      <div className={h.row2}>
        <Field label="Koleksiyon" htmlFor={`${id}-col`}><Select id={`${id}-col`} value={s.collectionSlug} options={catalog.collections} onChange={(v) => u('collectionSlug', v)} /></Field>
        <Field label="Öne çıkan ürün" htmlFor={`${id}-p`} help="Boşsa koleksiyonun en çok satanı.">
          <Select id={`${id}-p`} value={s.productSlug} options={catalog.products} onChange={(v) => u('productSlug', v)} empty="Otomatik" />
        </Field>
      </div>
      <div className={h.row2}>
        <Field label="Üst etiket" htmlFor={`${id}-e`}><TextInput id={`${id}-e`} value={s.eyebrow} onChange={(v) => u('eyebrow', v)} /></Field>
        <Field label="Etiket notu" htmlFor={`${id}-en`}><TextInput id={`${id}-en`} value={s.eyebrowNote} onChange={(v) => u('eyebrowNote', v)} /></Field>
      </div>
      <div className={h.row2}>
        <Field label="Başlık" htmlFor={`${id}-h`}><TextInput id={`${id}-h`} value={s.headline} onChange={(v) => u('headline', v)} /></Field>
        <Field label="Başlık ikinci satır" htmlFor={`${id}-ha`}><TextInput id={`${id}-ha`} value={s.headlineAccent} onChange={(v) => u('headlineAccent', v)} /></Field>
      </div>
      <Field label="Giriş metni" htmlFor={`${id}-l`}>
        <textarea id={`${id}-l`} rows={3} className={styles.formTextarea} value={s.lead} onChange={(e) => u('lead', e.target.value)} />
      </Field>
      <Field label="Özellikler (en fazla 4)">
        <div className={h.pillars}>
          {s.pillars.map((p, i) => (
            <div key={i} className={h.pillarRow}>
              <input className={styles.formInput} value={p.title} placeholder="Başlık" aria-label={`Özellik ${i + 1} başlık`} onChange={(e) => u('pillars', s.pillars.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <input className={styles.formInput} value={p.desc} placeholder="Kısa açıklama" aria-label={`Özellik ${i + 1} açıklama`} onChange={(e) => u('pillars', s.pillars.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} />
              <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => u('pillars', s.pillars.filter((_, j) => j !== i))}>Sil</button>
            </div>
          ))}
          {s.pillars.length < 4 && (
            <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={() => u('pillars', [...s.pillars, { title: '', desc: '' }])}>
              Özellik ekle
            </button>
          )}
        </div>
      </Field>
      <div className={h.row2}>
        <Field label="Alt bağlantı yazısı" htmlFor={`${id}-ll`}><TextInput id={`${id}-ll`} value={s.linkLabel} onChange={(v) => u('linkLabel', v)} /></Field>
        <Field label="Alt bağlantı" htmlFor={`${id}-lh`}><TextInput id={`${id}-lh`} value={s.linkHref} onChange={(v) => u('linkHref', v)} /></Field>
      </div>
    </>
  )
}

function BannerEditor({ s, set, id }: { s: BannerSettings; set: (s: BannerSettings) => void; id: string }) {
  const u = <K extends keyof BannerSettings>(k: K, v: BannerSettings[K]) => set({ ...s, [k]: v })
  return (
    <>
      <ImageField id={`${id}-img`} label="Görsel" value={s.imageUrl} onChange={(v) => u('imageUrl', v)} />
      <div className={h.row2}>
        <Field label="Görsel hangi tarafta">
          <Segmented label="Hizalama" value={s.align} onChange={(v) => u('align', v)} options={[{ value: 'left', label: 'Solda' }, { value: 'right', label: 'Sağda' }]} />
        </Field>
        <Field label="Tema">
          <Segmented label="Tema" value={s.theme} onChange={(v) => u('theme', v)} options={[{ value: 'dark', label: 'Koyu' }, { value: 'light', label: 'Açık' }]} />
        </Field>
      </div>
      <div className={h.row2}>
        <Field label="Üst etiket" htmlFor={`${id}-e`}><TextInput id={`${id}-e`} value={s.eyebrow} onChange={(v) => u('eyebrow', v)} /></Field>
        <Field label="Başlık" htmlFor={`${id}-t`}><TextInput id={`${id}-t`} value={s.title} onChange={(v) => u('title', v)} /></Field>
      </div>
      <Field label="Alt başlık" htmlFor={`${id}-s`}><TextInput id={`${id}-s`} value={s.subtitle} onChange={(v) => u('subtitle', v)} /></Field>
      <Field label="Açıklama" htmlFor={`${id}-d`}>
        <textarea id={`${id}-d`} rows={3} className={styles.formTextarea} value={s.description} onChange={(e) => u('description', e.target.value)} />
      </Field>
      <div className={h.row2}>
        <Field label="Buton yazısı" htmlFor={`${id}-c`}><TextInput id={`${id}-c`} value={s.ctaText} onChange={(v) => u('ctaText', v)} /></Field>
        <Field label="Buton bağlantısı" htmlFor={`${id}-h`}><TextInput id={`${id}-h`} value={s.ctaHref} onChange={(v) => u('ctaHref', v)} /></Field>
      </div>
      <Field label="Görsel açıklaması (erişilebilirlik)" htmlFor={`${id}-alt`}><TextInput id={`${id}-alt`} value={s.imageAlt} onChange={(v) => u('imageAlt', v)} /></Field>
    </>
  )
}

function TextCtaEditor({ s, set, id }: { s: TextCtaSettings; set: (s: TextCtaSettings) => void; id: string }) {
  const u = <K extends keyof TextCtaSettings>(k: K, v: TextCtaSettings[K]) => set({ ...s, [k]: v })
  return (
    <>
      <Field label="Üst etiket (isteğe bağlı)" htmlFor={`${id}-e`}><TextInput id={`${id}-e`} value={s.eyebrow} onChange={(v) => u('eyebrow', v)} /></Field>
      <Field label="Başlık" htmlFor={`${id}-t`}><TextInput id={`${id}-t`} value={s.title} onChange={(v) => u('title', v)} /></Field>
      <Field label="Metin (isteğe bağlı)" htmlFor={`${id}-b`}>
        <textarea id={`${id}-b`} rows={3} className={styles.formTextarea} value={s.body} onChange={(e) => u('body', e.target.value)} />
      </Field>
      <div className={h.row2}>
        <Field label="Buton yazısı" htmlFor={`${id}-c`}><TextInput id={`${id}-c`} value={s.ctaLabel} onChange={(v) => u('ctaLabel', v)} /></Field>
        <Field label="Buton bağlantısı" htmlFor={`${id}-h`}><TextInput id={`${id}-h`} value={s.ctaHref} onChange={(v) => u('ctaHref', v)} /></Field>
      </div>
      <div className={h.row2}>
        <Field label="Hizalama">
          <Segmented label="Hizalama" value={s.align} onChange={(v) => u('align', v)} options={[{ value: 'left', label: 'Sola' }, { value: 'center', label: 'Ortaya' }]} />
        </Field>
        <Field label="Arka plan">
          <Segmented label="Arka plan" value={s.tone} onChange={(v) => u('tone', v)} options={[{ value: 'plain', label: 'Beyaz' }, { value: 'muted', label: 'Gri' }, { value: 'dark', label: 'Koyu' }]} />
        </Field>
      </div>
    </>
  )
}

export function SectionEditor({ section, onChange, catalog }: { section: HomeSection; onChange: (s: HomeSection) => void; catalog: CatalogOptions }) {
  const id = section.id
  const tpl = SECTION_TEMPLATES[section.type]
  let body: React.ReactNode
  switch (section.type) {
    case 'product_rail':
      body = <RailEditor id={id} s={section.settings} catalog={catalog} set={(settings) => onChange({ ...section, settings })} />
      break
    case 'product_spotlight':
      body = <SpotlightEditor id={id} s={section.settings} catalog={catalog} set={(settings) => onChange({ ...section, settings })} />
      break
    case 'banner':
      body = <BannerEditor id={id} s={section.settings} set={(settings) => onChange({ ...section, settings })} />
      break
    case 'text_cta':
      body = <TextCtaEditor id={id} s={section.settings} set={(settings) => onChange({ ...section, settings })} />
      break
    default:
      body = <p className={h.note}>Bu bölümün ayarı yok; içeriği katalogdan ve sabit tasarımdan gelir. Sırasını değiştirebilir ya da gizleyebilirsiniz.</p>
  }
  return (
    <div className={h.editorPanel}>
      <p className={h.note}>{tpl.description}</p>
      <section className={h.group}>{body}</section>
    </div>
  )
}

// ── "Add section" gallery ──────────────────────────────────

const PREVIEW_SHAPES: Record<SectionType, React.ReactNode> = {
  product_rail: (<><i className={h.sCard} /><i className={h.sCard} /><i className={h.sCard} /><i className={h.sCard} /></>),
  banner: (<><i className={h.sImg} /><i className={h.sText} /></>),
  product_spotlight: (<><i className={h.sImgTall} /><i className={h.sText} /></>),
  text_cta: <i className={h.sCenter} />,
  category_strip: <i className={h.sStrip} />,
  collections_grid: (<><i className={h.sImg} /><i className={h.sImg} /></>),
  process: (<><i className={h.sCol} /><i className={h.sCol} /><i className={h.sCol} /><i className={h.sCol} /></>),
  lifestyle: (<><i className={h.sImg} /><i className={h.sImgTall} /></>),
  final_discovery: <i className={h.sCenter} />,
  newsletter: (<><i className={h.sText} /><i className={h.sCol} /></>),
}

export function TemplateGallery({ existing, onPick }: { existing: SectionType[]; onPick: (type: SectionType) => void }) {
  const all = Object.values(SECTION_TEMPLATES)
  return (
    <div className={h.gallery}>
      {all.map((t) => {
        const used = !t.repeatable && existing.includes(t.type)
        return (
          <button key={t.type} type="button" className={h.galleryItem} disabled={used} onClick={() => onPick(t.type)}>
            <span className={h.galleryShape} aria-hidden="true">{PREVIEW_SHAPES[t.type]}</span>
            <span className={h.galleryName}>{t.name}</span>
            <span className={h.galleryDesc}>{used ? 'Sayfada zaten var.' : t.description}</span>
          </button>
        )
      })}
    </div>
  )
}
