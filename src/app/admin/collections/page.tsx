'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import styles from '../admin.module.css'

interface Collection {
  id: string
  name: string
  slug: string
  sortOrder: number
  description: string
  accentColor?: string
  logoSvg?: string
  heroImage?: string
  productCount: number
}

export default function AdminCollectionsPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [sortOrder, setSortOrder] = useState<number>(1)
  const [description, setDescription] = useState('')
  const [accentColor, setAccentColor] = useState('#0080c4')
  const [heroImage, setHeroImage] = useState('')
  const [saving, setSaving] = useState(false)

  const loadCollections = async () => {
    if (!canFetch) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/collections', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.collections)) {
        setCollections(data.collections)
      } else {
        addToast(data.error || 'Koleksiyonlar yüklenemedi.', 'error')
      }
    } catch {
      addToast('Koleksiyonlar alınırken bağlantı hatası oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCollections()
  }, [token, canFetch, canFetch])

  const openCreateModal = () => {
    setEditingCollection(null)
    setName('')
    setSlug('')
    setSortOrder(collections.length + 1)
    setDescription('')
    setAccentColor('#0080c4')
    setHeroImage('')
    setIsModalOpen(true)
  }

  const openEditModal = (col: Collection) => {
    setEditingCollection(col)
    setName(col.name)
    setSlug(col.slug)
    setSortOrder(col.sortOrder)
    setDescription(col.description || '')
    setAccentColor(col.accentColor || '#0080c4')
    setHeroImage(col.heroImage || '')
    setIsModalOpen(true)
  }

  const handleNameChange = (val: string) => {
    const lower = val.toLowerCase()
    setName(lower)
    if (!editingCollection) {
      setSlug(
        lower
          .replace(/ğ/g, 'g')
          .replace(/ü/g, 'u')
          .replace(/ş/g, 's')
          .replace(/ı/g, 'i')
          .replace(/ö/g, 'o')
          .replace(/ç/g, 'c')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      )
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch || !name.trim()) return

    setSaving(true)
    try {
      const url = '/api/admin/collections'
      const method = editingCollection ? 'PUT' : 'POST'
      const body: any = {
        name: name.trim().toLowerCase(),
        slug: slug.trim().toLowerCase() || undefined,
        sortOrder: Number(sortOrder),
        description: description.trim(),
        accentColor,
        heroImage: heroImage.trim() || undefined,
      }
      if (editingCollection) {
        body.id = editingCollection.id
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (data.success) {
        addToast(
          editingCollection
            ? `'${name}' koleksiyonu başarıyla güncellendi.`
            : `'${name}' yeni koleksiyon olarak oluşturuldu.`,
          'success'
        )
        setIsModalOpen(false)
        loadCollections()
      } else {
        addToast(data.error || 'İşlem başarısız oldu.', 'error')
      }
    } catch {
      addToast('Koleksiyon kaydedilirken bağlantı hatası oluştu.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleQuickSort = async (col: Collection, newOrder: number) => {
    if (!canFetch || newOrder < 1) return
    try {
      const res = await fetch('/api/admin/collections', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: col.id,
          sortOrder: newOrder,
        }),
      })
      const data = await res.json()
      if (data.success) {
        addToast(`'${col.name}' sırası güncellendi (${newOrder}).`, 'success')
        loadCollections()
      }
    } catch {
      addToast('Sıralama güncellenemedi.', 'error')
    }
  }

  const filtered = useMemo(() => {
    return collections.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.slug.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase())
    )
  }, [collections, search])

  const totalProducts = useMemo(() => {
    return collections.reduce((sum, c) => sum + c.productCount, 0)
  }, [collections])

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Koleksiyon Yönetimi</h1>
          <p className={styles.subtitle}>
            ZUULAB serilerini ve marka dünyalarını (zuukids, zuulife, zuulight, zuutoptan) yönetin. Ürünlerin marka kimliğini belirler.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className={styles.primaryButton}
        >
          + Yeni Koleksiyon
        </button>
      </div>

      {/* ── METRIC STATS CARDS ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Toplam Koleksiyon
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {collections.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Aktif ZUULAB marka dünyası
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Koleksiyon Ürünleri
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {totalProducts}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Serilere bağlı toplam ürün
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Koleksiyon & Kategori Ayrımı
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
            Kategori <em>&quot;ürün tipini&quot;</em>, koleksiyon ise <em>&quot;ait olduğu marka dünyasını&quot;</em> ifade eder.
          </div>
        </div>
      </div>

      {/* ── SEARCH BAR ──────────────────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            placeholder="Koleksiyon adı veya slug ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.input}
          />
        </div>
      </div>

      {/* ── COLLECTIONS EDITORIAL CARDS ─────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Koleksiyon dünyaları yükleniyor...
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>Koleksiyon Bulunamadı</div>
          <div className={styles.emptyStateDesc}>
            {search ? `"${search}" aramasına uygun bir koleksiyon bulunamadı.` : 'Tanımlanmış aktif koleksiyon bulunmuyor.'}
          </div>
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className={styles.secondaryButton}
            >
              Aramayı Temizle
            </button>
          ) : (
            <button
              type="button"
              onClick={openCreateModal}
              className={styles.primaryButton}
            >
              + Yeni Koleksiyon Ekle
            </button>
          )}
        </div>
      ) : (
        <div className={styles.collectionGrid}>
          {filtered.map((col) => {
            const accent = col.accentColor || 'var(--text-primary)'
            return (
              <div key={col.id} className={styles.collectionCard}>
                {/* Accent Color Indicator Bar */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: accent,
                    borderTopLeftRadius: 'var(--radius-sm, 6px)',
                    borderTopRightRadius: 'var(--radius-sm, 6px)',
                  }}
                />

                {/* Card Top: Identity, Sort, and Status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        background: 'var(--surface-1)',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Sıra #{col.sortOrder}
                    </span>
                    <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                      AKTİF
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => handleQuickSort(col, col.sortOrder - 1)}
                      disabled={col.sortOrder <= 1}
                      className={styles.secondaryButton}
                      style={{ padding: '2px 6px', fontSize: '11px' }}
                      title="Sıralamayı Öne Al"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickSort(col, col.sortOrder + 1)}
                      className={styles.secondaryButton}
                      style={{ padding: '2px 6px', fontSize: '11px' }}
                      title="Sıralamayı Arkaya Al"
                    >
                      ▼
                    </button>
                  </div>
                </div>

                {/* Brand Name & Slug */}
                <div>
                  <h2
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      margin: '0 0 2px',
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {col.name}
                  </h2>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
                    /koleksiyon/{col.slug}
                  </div>
                </div>

                {/* Description */}
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {col.description || 'Bu koleksiyon için henüz açıklama girilmemiş.'}
                </p>

                {/* Image Preview if available */}
                {col.heroImage && (
                  <div
                    style={{
                      height: 100,
                      borderRadius: 'var(--radius-xs)',
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                      position: 'relative',
                    }}
                  >
                    <img
                      src={col.heroImage}
                      alt={col.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}

                {/* Footer: Products Count Link and Edit Action */}
                <div
                  style={{
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Link
                    href={`/admin/products?collection=${col.slug}`}
                    className={styles.badge}
                    style={{
                      background: 'rgba(0, 128, 196, 0.08)',
                      color: 'var(--brand-blue, #0080c4)',
                      border: '1px solid rgba(0, 128, 196, 0.2)',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {col.productCount} Ürün ↗
                  </Link>

                  <button
                    type="button"
                    onClick={() => openEditModal(col)}
                    className={styles.secondaryButton}
                    style={{ padding: '4px 12px', fontSize: '12px' }}
                  >
                    Düzenle
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── CREATE / EDIT MODAL ──────────────────────────────────────────────── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        ariaLabel={editingCollection ? 'Koleksiyon Düzenle' : 'Yeni Koleksiyon Ekle'}
        maxWidth={500}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
              {editingCollection ? 'Koleksiyonu Düzenle' : 'Yeni Koleksiyon Tanımla'}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              {editingCollection ? `${editingCollection.name} marka dünyasını güncelleyin.` : 'ZUULAB için yeni bir seri veya marka dünyası ekleyin.'}
            </p>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Koleksiyon Adı (Küçük Harf) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="örn: zuukids"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Sıra No
                </label>
                <input
                  type="number"
                  min="1"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className={styles.input}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Slug (URL Yolu) *
              </label>
              <input
                type="text"
                required
                placeholder="zuukids"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className={styles.input}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Vitrin linki: <code>/koleksiyon/{slug || 'ornek'}</code>
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Açıklama & Manifesto
              </label>
              <textarea
                rows={3}
                placeholder="Bu koleksiyonun tasarım felsefesi ve hedef kitlesi..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.textarea}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Vurgu Rengi
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{
                      width: 36,
                      height: 36,
                      padding: 0,
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-xs)',
                      cursor: 'pointer',
                    }}
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className={styles.input}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Kapak Görseli URL
                </label>
                <input
                  type="text"
                  placeholder="https://... veya /images/..."
                  value={heroImage}
                  onChange={(e) => setHeroImage(e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className={styles.secondaryButton}
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={saving}
                className={styles.primaryButton}
              >
                {saving ? 'Kaydediliyor...' : editingCollection ? 'Güncelle' : 'Koleksiyon Oluştur'}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  )
}
