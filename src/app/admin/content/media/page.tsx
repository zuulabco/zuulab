'use client'

import React, { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { uploadAdminImage } from '@/lib/media/admin-upload'
import Modal from '@/components/common/Modal'
import styles from '../../admin.module.css'
import { SkeletonList } from '@/components/common/Skeleton'

interface MediaAsset {
  id: string
  name: string
  url: string
  size: string
  type: string
  dimensions?: string
  createdAt: string
  references: number
}

export default function AdminMediaPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [media, setMedia] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add / Upload Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [uploadMode, setUploadMode] = useState<'FILE' | 'URL'>('FILE')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [customName, setCustomName] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [dimensions, setDimensions] = useState('1200x800')
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Preview Modal
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null)

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadMedia = () => {
    if (!canFetch) return
    setLoading(true)

    fetch('/api/admin/cms/media', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.media)) {
          setMedia(data.media)
        }
      })
      .catch(() => addToast('Medya dosyaları yüklenemedi.', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadMedia()
  }, [token, canFetch, canFetch])

  const handleCopyUrl = (urlStr: string) => {
    navigator.clipboard.writeText(urlStr)
    addToast('Görsel URL adresi panoya kopyalandı.', 'success')
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !canFetch) return

    if (deleteTarget.references > 0) {
      addToast(`Bu görsel ${deleteTarget.references} aktif vitrin içeriğinde kullanıldığı için silinemez.`, 'warning')
      setDeleteTarget(null)
      return
    }

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/cms/media?id=${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        addToast('Görsel kütüphaneden başarıyla silindi.', 'success')
        setDeleteTarget(null)
        loadMedia()
      } else {
        addToast(data.error || 'Silme işlemi gerçekleştirilemedi.', 'error')
      }
    } catch {
      addToast('Sunucu bağlantısı sağlanamadı.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch) return

    setSubmitting(true)
    try {
      if (uploadMode === 'FILE') {
        if (!selectedFile) {
          addToast('Lütfen yüklenecek bir dosya seçin.', 'warning')
          setSubmitting(false)
          return
        }

        try {
          await uploadAdminImage(selectedFile, token)
          addToast('Dosya Cloudinary deposuna başarıyla yüklendi.', 'success')
          setIsModalOpen(false)
          setSelectedFile(null)
          loadMedia()
        } catch (err) {
          addToast((err as Error).message || 'Dosya yüklenemedi.', 'error')
        }
      } else {
        // URL Mode
        if (!customName.trim() || !urlInput.trim()) {
          addToast('Dosya adı ve geçerli URL adresi gereklidir.', 'warning')
          setSubmitting(false)
          return
        }

        const res = await fetch('/api/admin/cms/media', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: customName.trim(),
            url: urlInput.trim(),
            dimensions: dimensions.trim() || '1200x800',
            size: '120 KB',
            type: 'image/webp',
          }),
        })

        const data = await res.json()
        if (data.success) {
          addToast('Medya bağlantısı kütüphaneye kaydedildi.', 'success')
          setIsModalOpen(false)
          setCustomName('')
          setUrlInput('')
          loadMedia()
        } else {
          addToast(data.error || 'Medya kaydedilemedi.', 'error')
        }
      }
    } catch {
      addToast('Sunucu işlemi sırasında bağlantı hatası oluştu.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredMedia = media.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Medya Kütüphanesi</h1>
          <p className={styles.subtitle}>
            Cloudinary tabanlı optimize edilmiş vitrin, ürün ve banner görselleri, dosya boyutları ve kullanım takibi.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectedFile(null)
            setCustomName('')
            setUrlInput('')
            setIsModalOpen(true)
          }}
          className={styles.primaryButton}
        >
          + Medya Ekle / Yükle
        </button>
      </div>

      {/* ── TOOLBAR ─────────────────────────────────────────────────────────── */}
      <div className={styles.filterBar} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <input
          type="text"
          placeholder="Dosya adına göre filtrele..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.input}
          style={{ maxWidth: '320px', flex: '1 1 200px' }}
        />

        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Toplam: <strong>{filteredMedia.length}</strong> medya varlığı
        </div>
      </div>

      {/* ── MEDIA GRID ──────────────────────────────────────────────────────── */}
      {loading ? (
        <SkeletonList rows={5} />
      ) : filteredMedia.length === 0 ? (
        <div className={styles.card} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Kütüphanede arama kriterlerine uygun medya dosyası bulunamadı.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '1rem',
          }}
        >
          {filteredMedia.map((asset) => (
            <div
              key={asset.id}
              className={styles.card}
              style={{
                padding: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Image Preview Container */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '160px',
                  backgroundColor: 'var(--surface-1)',
                  cursor: 'pointer',
                }}
                onClick={() => setPreviewAsset(asset)}
                title="Büyük önizleme için tıklayın"
              >
                <Image src={asset.url} alt={asset.name} fill style={{ objectFit: 'cover' }} />
                {asset.references > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      backgroundColor: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(4px)',
                      color: '#34d399',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid rgba(52, 211, 153, 0.4)',
                    }}
                  >
                    {asset.references} İçerikte Aktif
                  </div>
                )}
              </div>

              {/* Asset Info */}
              <div style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontFamily: 'var(--font-mono)',
                  }}
                  title={asset.name}
                >
                  {asset.name}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>{asset.dimensions || '—'}</span>
                  <span>{asset.size}</span>
                </div>

                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {new Date(asset.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(asset.url)}
                    className={styles.secondaryButton}
                    style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    URL Kopyala
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(asset)}
                    className={styles.secondaryButton}
                    style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', color: '#ef4444' }}
                  >
                    Sil
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ADD / UPLOAD MODAL (UI-16 GLOBAL MODAL) ─────────────────────────── */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => !submitting && setIsModalOpen(false)}
          ariaLabel="Medya Yükleme Modalı"
          maxWidth={480}
        >
          <div style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Yeni Medya Dosyası Ekle
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Cihazınızdan dosya yükleyebilir veya harici bir CDN/Cloudinary URL adresi tanımlayabilirsiniz.
            </p>

            {/* Mode Selector */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={() => setUploadMode('FILE')}
                className={uploadMode === 'FILE' ? styles.primaryButton : styles.secondaryButton}
                style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
              >
                Cihazdan Yükle
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('URL')}
                className={uploadMode === 'URL' ? styles.primaryButton : styles.secondaryButton}
                style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
              >
                URL ile Tanımla
              </button>
            </div>

            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {uploadMode === 'FILE' ? (
                <div>
                  <label className={styles.label}>Dosya Seçin (WebP, PNG, JPEG - Maks 5MB) *</label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/webp,image/png,image/jpeg"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0])
                      }
                    }}
                    className={styles.input}
                    style={{ padding: '0.4rem' }}
                  />
                  {selectedFile && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                      Seçilen: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label className={styles.label}>Dosya Adı *</label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: zuukids_dino_banner.webp"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className={styles.input}
                      style={{ fontFamily: 'var(--font-mono)' }}
                    />
                  </div>

                  <div>
                    <label className={styles.label}>Görsel URL Adresi (Cloudinary / CDN) *</label>
                    <input
                      type="text"
                      required
                      placeholder="https://images.unsplash.com/... veya Cloudinary URL"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className={styles.input}
                    />
                  </div>

                  <div>
                    <label className={styles.label}>Ölçüler (px)</label>
                    <input
                      type="text"
                      value={dimensions}
                      onChange={(e) => setDimensions(e.target.value)}
                      placeholder="1200x800"
                      className={styles.input}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className={styles.secondaryButton}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={styles.primaryButton}
                >
                  {submitting ? 'Yükleniyor...' : uploadMode === 'FILE' ? 'Yükle & Kaydet' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ── IMAGE PREVIEW MODAL (UI-16 GLOBAL MODAL) ────────────────────────── */}
      {previewAsset && (
        <Modal
          isOpen={Boolean(previewAsset)}
          onClose={() => setPreviewAsset(null)}
          ariaLabel="Medya Önizleme Modalı"
          maxWidth={700}
        >
          <div style={{ padding: '1.5rem' }}>
            <div style={{ position: 'relative', width: '100%', height: '360px', backgroundColor: 'var(--surface-1)', borderRadius: '6px', overflow: 'hidden', marginBottom: '1rem' }}>
              <Image src={previewAsset.url} alt={previewAsset.name} fill style={{ objectFit: 'contain' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{previewAsset.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {previewAsset.dimensions || 'Boyutsuz'} • {previewAsset.size} • {previewAsset.type}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleCopyUrl(previewAsset.url)}
                  className={styles.secondaryButton}
                >
                  URL Kopyala
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  className={styles.primaryButton}
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── DELETE CONFIRMATION MODAL (UI-16 GLOBAL MODAL) ──────────────────── */}
      {deleteTarget && (
        <Modal
          isOpen={Boolean(deleteTarget)}
          onClose={() => !isDeleting && setDeleteTarget(null)}
          ariaLabel="Medya Silme Onayı"
          maxWidth={440}
        >
          <div style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Medya Dosyasını Sil
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              <strong>{deleteTarget.name}</strong> dosyasını kütüphaneden silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className={styles.secondaryButton}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className={styles.dangerButton}
                style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
              >
                {isDeleting ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
