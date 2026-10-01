'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import styles from '../../admin.module.css'

interface HeroContent {
  brandWorld: string
  originTag: string
  headlineMain: string
  headlineItalic: string
  leadText: string
  heroImage: string
  mobileImage?: string
  imageCaptionCode: string
  imageCaptionText: string
  primaryCtaText: string
  primaryCtaHref: string
  secondaryCtaText: string
  secondaryCtaHref: string
  active: boolean
}

interface HomepageSectionConfig {
  id: string
  type: string
  name: string
  enabled: boolean
  sortOrder: number
  customSettings?: Record<string, any>
}

export default function AdminHomepageCmsPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // Publish Modal State (UI-16 Global Modal)
  const [showPublishModal, setShowPublishModal] = useState(false)

  // CMS state
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT')
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null)
  const [hero, setHero] = useState<HeroContent>({
    brandWorld: '',
    originTag: '',
    headlineMain: '',
    headlineItalic: '',
    leadText: '',
    heroImage: '',
    mobileImage: '',
    imageCaptionCode: '',
    imageCaptionText: '',
    primaryCtaText: '',
    primaryCtaHref: '',
    secondaryCtaText: '',
    secondaryCtaHref: '',
    active: true,
  })
  const [sections, setSections] = useState<HomepageSectionConfig[]>([])

  const loadCms = () => {
    if (!canFetch) return
    setLoading(true)

    fetch('/api/admin/cms/homepage?mode=DRAFT', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.cms) {
          const cms = data.cms
          setStatus(cms.status)
          setLastPublishedAt(cms.lastPublishedAt)
          setHero(cms.hero)
          setSections(cms.sections.sort((a: any, b: any) => a.sortOrder - b.sortOrder))
        }
      })
      .catch(() => addToast('İçerik verileri yüklenirken hata oluştu.', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadCms()
  }, [token, canFetch, canFetch])

  const handleHeroChange = (field: keyof HeroContent, value: any) => {
    setHero((prev) => ({ ...prev, [field]: value }))
  }

  const handleSectionToggle = (id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    )
  }

  const handleSectionMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= sections.length) return

    const newSections = [...sections]
    const temp = newSections[index]
    newSections[index] = newSections[targetIndex]
    newSections[targetIndex] = temp

    // Reassign sortOrder
    const reordered = newSections.map((s, idx) => ({ ...s, sortOrder: idx + 1 }))
    setSections(reordered)
  }

  const handleSaveDraft = async () => {
    if (!canFetch) return
    setSaving(true)

    try {
      const res = await fetch('/api/admin/cms/homepage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          hero,
          sections,
        }),
      })

      const data = await res.json()
      if (data.success) {
        addToast('Taslak başarıyla kaydedildi. Canlı vitrine henüz yansıtılmadı.', 'success')
        setStatus('DRAFT')
      } else {
        addToast(data.error || 'Taslak kaydedilemedi.', 'error')
      }
    } catch {
      addToast('Sunucu bağlantısı sırasında hata oluştu.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handlePublishConfirm = async () => {
    if (!canFetch) return
    setPublishing(true)

    try {
      // First save draft
      await fetch('/api/admin/cms/homepage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hero, sections }),
      })

      // Then publish
      const res = await fetch('/api/admin/cms/homepage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'PUBLISH' }),
      })

      const data = await res.json()
      if (data.success) {
        addToast('Tüm ana sayfa içerikleri canlı vitrinde yayınlandı!', 'success')
        setStatus('PUBLISHED')
        setLastPublishedAt(new Date().toISOString())
        setShowPublishModal(false)
      } else {
        addToast(data.error || 'Yayınlama başarısız oldu.', 'error')
      }
    } catch {
      addToast('Yayınlama sırasında sunucu bağlantı hatası oluştu.', 'error')
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          İçerik yönetim sistemi yükleniyor...
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span
              className={`${styles.badge} ${
                status === 'PUBLISHED' ? styles.badgeSuccess : styles.badgeWarning
              }`}
            >
              {status === 'PUBLISHED' ? 'CANLI YAYINDA' : 'TASLAK MODU'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Son Yayın: {lastPublishedAt ? new Date(lastPublishedAt).toLocaleString('tr-TR') : 'Henüz yayınlanmadı'}
            </span>
          </div>

          <h1 className={styles.title}>Ana Sayfa İçerik Yönetimi (CMS)</h1>
          <p className={styles.subtitle}>
            Hero bölümü, karşılama başlıkları, görseller ve ana sayfa bölüm sıralamasını kod değiştirmeden yönetin.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link
            href="/admin/content/media"
            className={styles.secondaryButton}
          >
            Medya Kütüphanesi
          </Link>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            className={styles.secondaryButton}
          >
            {saving ? 'Kaydediliyor...' : 'Taslak Kaydet'}
          </button>

          <button
            type="button"
            onClick={() => setShowPublishModal(true)}
            disabled={publishing}
            className={styles.primaryButton}
          >
            {publishing ? 'Yayınlanıyor...' : 'Canlıya Yayınla'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* ── SECTION 1: HERO MANAGEMENT ────────────────────────────────────── */}
        <div className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                1. Dinamik Hero Bölümü
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                Vitrin ana karşılama başlıkları, koleksiyon dünyaları rozeti ve görsel assetleri.
              </p>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hero.active}
                onChange={(e) => handleHeroChange('active', e.target.checked)}
              />
              <span style={{ fontWeight: 500 }}>Hero Aktif</span>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Form inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className={styles.label}>
                    Koleksiyon Dünyaları (Eyebrow)
                  </label>
                  <input
                    type="text"
                    value={hero.brandWorld}
                    onChange={(e) => handleHeroChange('brandWorld', e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div>
                  <label className={styles.label}>
                    Atölye Menşei Etiketi
                  </label>
                  <input
                    type="text"
                    value={hero.originTag}
                    onChange={(e) => handleHeroChange('originTag', e.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className={styles.label}>
                    Ana Başlık (Normal Metin)
                  </label>
                  <input
                    type="text"
                    value={hero.headlineMain}
                    onChange={(e) => handleHeroChange('headlineMain', e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div>
                  <label className={styles.label}>
                    İtalik Vurgu Başlığı
                  </label>
                  <input
                    type="text"
                    value={hero.headlineItalic}
                    onChange={(e) => handleHeroChange('headlineItalic', e.target.value)}
                    className={styles.input}
                    style={{ fontStyle: 'italic' }}
                  />
                </div>
              </div>

              <div>
                <label className={styles.label}>
                  Açıklama / Destekleyici Metin
                </label>
                <textarea
                  rows={3}
                  value={hero.leadText}
                  onChange={(e) => handleHeroChange('leadText', e.target.value)}
                  className={styles.input}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className={styles.label}>
                    Birincil Buton (Metin / Link)
                  </label>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <input
                      type="text"
                      placeholder="Metin"
                      value={hero.primaryCtaText}
                      onChange={(e) => handleHeroChange('primaryCtaText', e.target.value)}
                      className={styles.input}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="text"
                      placeholder="URL"
                      value={hero.primaryCtaHref}
                      onChange={(e) => handleHeroChange('primaryCtaHref', e.target.value)}
                      className={styles.input}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>

                <div>
                  <label className={styles.label}>
                    İkincil Buton (Metin / Link)
                  </label>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <input
                      type="text"
                      placeholder="Metin"
                      value={hero.secondaryCtaText}
                      onChange={(e) => handleHeroChange('secondaryCtaText', e.target.value)}
                      className={styles.input}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="text"
                      placeholder="URL"
                      value={hero.secondaryCtaHref}
                      onChange={(e) => handleHeroChange('secondaryCtaHref', e.target.value)}
                      className={styles.input}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Hero Images preview & inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '180px',
                  backgroundColor: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius, 6px)',
                  overflow: 'hidden',
                }}
              >
                {hero.heroImage ? (
                  <Image src={hero.heroImage} alt="Hero preview" fill style={{ objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Görsel Belirtilmedi
                  </div>
                )}
              </div>

              <div>
                <label className={styles.label}>
                  Masaüstü Görsel URL (Desktop Asset)
                </label>
                <input
                  type="text"
                  value={hero.heroImage}
                  onChange={(e) => handleHeroChange('heroImage', e.target.value)}
                  className={styles.input}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <label className={styles.label}>
                  Mobil Görsel URL (İsteğe Bağlı)
                </label>
                <input
                  type="text"
                  value={hero.mobileImage || ''}
                  onChange={(e) => handleHeroChange('mobileImage', e.target.value)}
                  placeholder="Boşsa masaüstü görseli kullanılır"
                  className={styles.input}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem' }}>
                <div>
                  <label className={styles.label}>Etiket Kodu</label>
                  <input
                    type="text"
                    value={hero.imageCaptionCode}
                    onChange={(e) => handleHeroChange('imageCaptionCode', e.target.value)}
                    className={styles.input}
                  />
                </div>
                <div>
                  <label className={styles.label}>Etiket Açıklaması</label>
                  <input
                    type="text"
                    value={hero.imageCaptionText}
                    onChange={(e) => handleHeroChange('imageCaptionText', e.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: HOMEPAGE SECTIONS ORDERING & VISIBILITY ─────────────── */}
        <div className={styles.card}>
          <div style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              2. Vitrin Bölüm Modelleri ve Sıralama
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Her bölümün vitrindeki görünürlüğünü açıp kapatabilir veya yukarı/aşağı butonları ile hiyerarşiyi düzenleyebilirsiniz.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sections.map((sec, idx) => (
              <div
                key={sec.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  backgroundColor: sec.enabled ? 'var(--surface-0)' : 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius, 6px)',
                  opacity: sec.enabled ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      width: '28px',
                    }}
                  >
                    {String(sec.sortOrder).padStart(2, '0')}
                  </span>

                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                      {sec.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Tip: {sec.type}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {/* Move Up/Down buttons */}
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleSectionMove(idx, 'up')}
                      className={styles.secondaryButton}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      title="Yukarı Taşı"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === sections.length - 1}
                      onClick={() => handleSectionMove(idx, 'down')}
                      className={styles.secondaryButton}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      title="Aşağı Taşı"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Enable/Disable toggle */}
                  <button
                    type="button"
                    onClick={() => handleSectionToggle(sec.id)}
                    className={styles.secondaryButton}
                    style={{
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: sec.enabled ? '#10b981' : '#ef4444',
                      minWidth: '85px',
                    }}
                  >
                    {sec.enabled ? 'Aktif' : 'Devre Dışı'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── PUBLISH CONFIRMATION MODAL (UI-16 GLOBAL MODAL) ─────────────────── */}
      {showPublishModal && (
        <Modal
          isOpen={showPublishModal}
          onClose={() => !publishing && setShowPublishModal(false)}
          ariaLabel="Canlıya Yayınlama Onayı"
          maxWidth={460}
        >
          <div style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Canlı Vitrine Yayınla
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Taslak olarak hazırladığınız tüm hero içerikleri, buton linkleri ve vitrin bölüm sıralaması doğrudan tüm ziyaretçilerin gördüğü ana sayfaya uygulanacaktır. Onaylıyor musunuz?
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                disabled={publishing}
                className={styles.secondaryButton}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handlePublishConfirm}
                disabled={publishing}
                className={styles.primaryButton}
              >
                {publishing ? 'Yayınlanıyor...' : 'Evet, Canlıya Al'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
