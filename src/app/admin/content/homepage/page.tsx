'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { SkeletonPage } from '@/components/common/Skeleton'
import {
  DEFAULT_SLIDES,
  newSection,
  sectionTitle,
  SECTION_TEMPLATES,
  type HeroConfig,
  type HeroSlide,
  type HomeSection,
  type SectionType,
} from '@/lib/cms/homepage'
import SortableList from '../../SortableList'
import { SectionEditor, SlideEditor, Switch, TemplateGallery, type CatalogOptions } from './editors'
import styles from '../../admin.module.css'
import h from './Homepage.module.css'

type Tab = 'hero' | 'sections'

export default function AdminHomepageEditor() {
  const { token, canFetch } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('hero')
  const [hero, setHero] = useState<HeroConfig | null>(null)
  const [sections, setSections] = useState<HomeSection[]>([])
  const [dirty, setDirty] = useState(false)
  const [unpublished, setUnpublished] = useState(false)
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null)
  const [selectedSlide, setSelectedSlide] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [catalog, setCatalog] = useState<CatalogOptions>({ products: [], collections: [], categories: [] })

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  // All state is set once the requests settle, so this can run straight from an effect
  const load = useCallback(() => {
    if (!canFetch) return
    Promise.all([
      fetch('/api/admin/cms/homepage?mode=DRAFT', { headers, cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/admin/products?limit=500&status=ACTIVE', { headers }).then((r) => r.json()),
      fetch('/api/admin/collections', { headers }).then((r) => r.json()),
      fetch('/api/admin/categories', { headers }).then((r) => r.json()),
    ])
      .then(([cms, products, cols, cats]) => {
        if (!cms.success) throw new Error(cms.error)
        setHero(cms.cms.hero)
        setSections(cms.cms.sections)
        setUnpublished(Boolean(cms.cms.hasUnpublishedChanges))
        setLastPublishedAt(cms.cms.lastPublishedAt)
        setSelectedSlide((s) => s ?? cms.cms.hero.slides[0]?.id ?? null)
        setCatalog({
          products: (products.products ?? []).map((p: { slug: string; name: string }) => ({ value: p.slug, label: p.name })),
          collections: (cols.collections ?? []).map((c: { slug: string; name: string }) => ({ value: c.slug, label: c.name })),
          categories: (cats.categories ?? []).map((c: { slug: string; name: string }) => ({ value: c.slug, label: c.name })),
        })
      })
      .catch((e) => toast.error((e as Error).message || 'Ana sayfa içeriği yüklenemedi.'))
      .finally(() => setLoading(false))
  }, [canFetch, headers])

  useEffect(() => {
    load()
  }, [load])

  // Leaving with unsaved edits asks first
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const changeHero = (next: HeroConfig) => {
    setHero(next)
    setDirty(true)
  }
  const changeSections = (next: HomeSection[]) => {
    setSections(next)
    setDirty(true)
  }

  const submit = async (action: 'save' | 'publish') => {
    if (!hero) return
    setBusy(action)
    try {
      const res = await fetch('/api/admin/cms/homepage', {
        method: 'POST',
        headers,
        body: JSON.stringify({ hero, sections, action: action === 'publish' ? 'PUBLISH' : undefined }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error)
      setDirty(false)
      setUnpublished(action === 'save')
      if (action === 'publish') setLastPublishedAt(new Date().toISOString())
      toast.success(action === 'publish' ? 'Ana sayfa yayınlandı.' : 'Taslak kaydedildi. Sitede görünmesi için yayınlayın.')
    } catch (e) {
      toast.error((e as Error).message || 'Kaydedilemedi.')
    } finally {
      setBusy(null)
    }
  }

  if (loading || !hero) {
    return (
      <div className={styles.pageContainer}>
        <SkeletonPage />
      </div>
    )
  }

  const slide = hero.slides.find((s) => s.id === selectedSlide) ?? null
  const section = sections.find((s) => s.id === selectedSection) ?? null

  const updateSlide = (next: HeroSlide) => changeHero({ ...hero, slides: hero.slides.map((s) => (s.id === next.id ? next : s)) })

  const addSlide = () => {
    const id = `slide-${Date.now().toString(36)}`
    const blank: HeroSlide = {
      ...DEFAULT_SLIDES[3],
      id,
      label: 'yeni slayt',
      badge: '',
      headline: 'yeni başlık',
      headlineAccent: '',
      description: '',
      imageUrl: '',
      mobileImageUrl: '',
      secondaryMode: 'none',
      secondaryProductSlug: '',
      secondaryLabel: '',
      secondaryHref: '',
    }
    changeHero({ ...hero, slides: [...hero.slides, blank] })
    setSelectedSlide(id)
  }

  const duplicateSlide = (s: HeroSlide) => {
    const id = `slide-${Date.now().toString(36)}`
    const index = hero.slides.findIndex((x) => x.id === s.id)
    const slides = [...hero.slides]
    slides.splice(index + 1, 0, { ...s, id, label: `${s.label} (kopya)` })
    changeHero({ ...hero, slides })
    setSelectedSlide(id)
  }

  const removeSlide = (s: HeroSlide) => {
    const slides = hero.slides.filter((x) => x.id !== s.id)
    changeHero({ ...hero, slides })
    if (selectedSlide === s.id) setSelectedSlide(slides[0]?.id ?? null)
  }

  const addSection = (type: SectionType) => {
    const created = newSection(type)
    changeSections([...sections, created])
    setGalleryOpen(false)
    setSelectedSection(created.id)
    toast.success(`${SECTION_TEMPLATES[type].name} sayfanın sonuna eklendi; sürükleyerek yerini değiştirin.`)
  }

  const activeSlides = hero.slides.filter((s) => s.enabled).length

  return (
    <div className={styles.pageContainer} style={{ maxWidth: 1280 }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ana sayfa</h1>
          <p className={styles.pageSubtitle}>
            {dirty
              ? 'Kaydedilmemiş değişiklikler var.'
              : unpublished
                ? 'Taslakta yayınlanmamış değişiklikler var.'
                : lastPublishedAt
                  ? `Sitedeki hali ile aynı · son yayın ${new Date(lastPublishedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}`
                  : 'Henüz yayınlanmadı; site varsayılan düzeni gösteriyor.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href="https://www.zuulab.com" target="_blank" rel="noopener noreferrer" className={`${styles.btn} ${styles.btnGhost}`}>
            Siteyi aç ↗
          </a>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => submit('save')} disabled={busy !== null || !dirty}>
            {busy === 'save' ? 'Kaydediliyor…' : 'Taslağı kaydet'}
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => submit('publish')} disabled={busy !== null || (!dirty && !unpublished)}>
            {busy === 'publish' ? 'Yayınlanıyor…' : 'Yayınla'}
          </button>
        </div>
      </div>

      <div className={h.tabs} role="tablist" aria-label="Ana sayfa bölümleri">
        <button type="button" role="tab" aria-selected={tab === 'hero'} onClick={() => setTab('hero')}>
          Kapak slaytları <span>{activeSlides}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'sections'} onClick={() => setTab('sections')}>
          Sayfa bölümleri <span>{sections.filter((s) => s.enabled).length}</span>
        </button>
      </div>

      {tab === 'hero' && (
        <div className={h.split}>
          <div className={h.listCol}>
            <div className={h.heroSettings}>
              <label className={h.inline}>
                <Switch checked={hero.active} onChange={(v) => changeHero({ ...hero, active: v })} label="Kapak alanı açık" />
                Kapak alanı sitede görünsün
              </label>
              <label className={h.inline}>
                <Switch checked={hero.autoplay} onChange={(v) => changeHero({ ...hero, autoplay: v })} label="Otomatik geçiş" />
                Otomatik geçiş
              </label>
              {hero.autoplay && (
                <label className={h.inline}>
                  Her slayt
                  <input
                    type="number"
                    min={3}
                    max={15}
                    value={hero.interval}
                    onChange={(e) => changeHero({ ...hero, interval: Number(e.target.value) || 6 })}
                    className={`${styles.formInput} ${h.tinyInput}`}
                    aria-label="Saniye"
                  />
                  sn
                </label>
              )}
            </div>

            <SortableList
              items={hero.slides}
              getId={(s) => s.id}
              getLabel={(s) => s.label || s.headline}
              onReorder={(slides) => changeHero({ ...hero, slides })}
              renderItem={(s, i) => (
                <div
                  className={`${h.slideRow} ${selectedSlide === s.id ? h.selected : ''} ${s.enabled ? '' : h.off}`}
                  onClick={() => setSelectedSlide(s.id)}
                >
                  <span className={h.slideThumb}>
                    {s.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.imageUrl} alt="" />
                    ) : (
                      <em>görsel yok</em>
                    )}
                  </span>
                  <span className={h.rowText}>
                    <strong>
                      {i + 1}. {s.label || 'slayt'}
                    </strong>
                    <small>
                      {s.headline} {s.headlineAccent}
                    </small>
                  </span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Switch checked={s.enabled} onChange={(v) => updateSlide({ ...s, enabled: v })} label={`${s.label} görünsün`} />
                  </span>
                </div>
              )}
            />
            <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${h.addBtn}`} onClick={addSlide}>
              Slayt ekle
            </button>
          </div>

          <div className={h.editCol}>
            {slide ? (
              <>
                <div className={h.editHead}>
                  <h3>{slide.label || 'Slayt'}</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => duplicateSlide(slide)}>Kopyala</button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                      onClick={() => removeSlide(slide)}
                      disabled={hero.slides.length <= 1}
                    >
                      Sil
                    </button>
                  </div>
                </div>
                <SlideEditor slide={slide} onChange={updateSlide} catalog={catalog} />
              </>
            ) : (
              <p className={h.note}>Düzenlemek için soldan bir slayt seçin.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'sections' && (
        <div className={h.split}>
          <div className={h.listCol}>
            <p className={h.note}>Kapak slaytlarının altında, bu sırayla görünür. Sırayı tutamaktan sürükleyerek değiştirin.</p>
            <SortableList
              items={sections}
              getId={(s) => s.id}
              getLabel={(s) => sectionTitle(s)}
              onReorder={changeSections}
              renderItem={(s) => (
                <div
                  className={`${h.sectionRow} ${selectedSection === s.id ? h.selected : ''} ${s.enabled ? '' : h.off}`}
                  onClick={() => setSelectedSection(s.id)}
                >
                  <span className={h.rowText}>
                    <strong>{SECTION_TEMPLATES[s.type].name}</strong>
                    <small>{sectionTitle(s).replace(`${SECTION_TEMPLATES[s.type].name}: `, '')}</small>
                  </span>
                  <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Switch
                      checked={s.enabled}
                      onChange={(v) => changeSections(sections.map((x) => (x.id === s.id ? ({ ...x, enabled: v } as HomeSection) : x)))}
                      label={`${sectionTitle(s)} görünsün`}
                    />
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                      onClick={() => {
                        changeSections(sections.filter((x) => x.id !== s.id))
                        if (selectedSection === s.id) setSelectedSection(null)
                      }}
                      aria-label={`${sectionTitle(s)} kaldır`}
                    >
                      Kaldır
                    </button>
                  </span>
                </div>
              )}
            />
            <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${h.addBtn}`} onClick={() => setGalleryOpen(true)}>
              Bölüm ekle
            </button>
          </div>

          <div className={h.editCol}>
            {section ? (
              <>
                <div className={h.editHead}>
                  <h3>{SECTION_TEMPLATES[section.type].name}</h3>
                </div>
                <SectionEditor
                  section={section}
                  catalog={catalog}
                  onChange={(next) => changeSections(sections.map((x) => (x.id === next.id ? next : x)))}
                />
              </>
            ) : (
              <p className={h.note}>Ayarlarını görmek için soldan bir bölüm seçin ya da yeni bölüm ekleyin.</p>
            )}
          </div>
        </div>
      )}

      <Modal isOpen={galleryOpen} onClose={() => setGalleryOpen(false)} maxWidth="900px" ariaLabel="Bölüm ekle">
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>Bölüm ekle</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>Bir şablon seçin; ayarlarını eklendikten sonra düzenleyebilirsiniz.</p>
        <TemplateGallery existing={sections.map((s) => s.type)} onPick={addSection} />
      </Modal>
    </div>
  )
}
