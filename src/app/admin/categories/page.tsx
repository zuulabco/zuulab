'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import styles from '../admin.module.css'

interface Category {
  id: string
  name: string
  slug: string
  description?: string
  imageUrl?: string
  isActive?: boolean
  seoTitle?: string
  seoDescription?: string
  productCount: number
}

export default function AdminCategoriesPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WITH_PRODUCTS' | 'EMPTY'>('ALL')

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Delete Modal State
  const [deleteModalCat, setDeleteModalCat] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadCategories = async () => {
    if (!canFetch) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/categories', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.categories)) {
        setCategories(data.categories)
      } else {
        addToast(data.error || 'Kategoriler yüklenemedi.', 'error')
      }
    } catch {
      addToast('Kategoriler alınırken bağlantı hatası oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [token, canFetch, canFetch])

  const openCreateModal = () => {
    setEditingCategory(null)
    setName('')
    setSlug('')
    setDescription('')
    setImageUrl('')
    setIsActive(true)
    setSeoTitle('')
    setSeoDescription('')
    setIsModalOpen(true)
  }

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat)
    setName(cat.name)
    setSlug(cat.slug)
    setDescription(cat.description || '')
    setImageUrl(cat.imageUrl || '')
    setIsActive(cat.isActive !== false)
    setSeoTitle(cat.seoTitle || '')
    setSeoDescription(cat.seoDescription || '')
    setIsModalOpen(true)
  }

  // Hiding a category hides it and its products from the storefront immediately.
  const handleToggleActive = async (cat: Category) => {
    if (!canFetch) return
    const next = cat.isActive === false
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: cat.id, isActive: next }),
      })
      const data = await res.json()
      if (data.success) {
        addToast(next ? `'${cat.name}' vitrinde yayında.` : `'${cat.name}' ve ürünleri vitrinden gizlendi.`, 'success')
        loadCategories()
      } else {
        addToast(data.error || 'Durum güncellenemedi.', 'error')
      }
    } catch {
      addToast('Durum güncellenirken bağlantı hatası oluştu.', 'error')
    }
  }

  const handleNameChange = (val: string) => {
    setName(val)
    if (!editingCategory) {
      setSlug(
        val
          .toLowerCase()
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch || !name.trim()) return

    setSubmitting(true)
    try {
      const url = '/api/admin/categories'
      const method = editingCategory ? 'PUT' : 'POST'
      const body: any = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        isActive,
        seoTitle: seoTitle.trim(),
        seoDescription: seoDescription.trim(),
      }
      if (editingCategory) {
        body.id = editingCategory.id
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
          editingCategory
            ? `'${name}' kategorisi güncellendi.`
            : `'${name}' yeni kategori olarak eklendi.`,
          'success'
        )
        setIsModalOpen(false)
        loadCategories()
      } else {
        addToast(data.error || 'Kategori kaydedilemedi.', 'error')
      }
    } catch {
      addToast('Kategori işlemi sırasında bağlantı hatası oluştu.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const executeDelete = async () => {
    if (!deleteModalCat || !canFetch) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/categories?id=${deleteModalCat.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        addToast(`'${deleteModalCat.name}' kategorisi silindi.`, 'success')
        setDeleteModalCat(null)
        loadCategories()
      } else {
        addToast(data.error || 'Silme işlemi başarısız oldu.', 'error')
      }
    } catch {
      addToast('Kategori silinirken bağlantı hatası oluştu.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // Filtered categories
  const filtered = useMemo(() => {
    return categories.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.slug.toLowerCase().includes(search.toLowerCase())

      if (!matchesSearch) return false

      if (statusFilter === 'WITH_PRODUCTS') return c.productCount > 0
      if (statusFilter === 'EMPTY') return c.productCount === 0
      return true
    })
  }, [categories, search, statusFilter])

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = categories.length
    const withProducts = categories.filter((c) => c.productCount > 0).length
    const empty = total - withProducts
    const totalProducts = categories.reduce((sum, c) => sum + c.productCount, 0)
    return { total, withProducts, empty, totalProducts }
  }, [categories])

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Kategori Yönetimi</h1>
          <p className={styles.subtitle}>
            Fiziksel ürün sınıflandırması, katalog hiyerarşisi ve bağlı ürün dağılımını yönetin.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className={styles.primaryButton}
        >
          + Yeni Kategori
        </button>
      </div>

      {/* ── METRIC STATS CARDS ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`${styles.selectableCard} ${statusFilter === 'ALL' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Toplam Kategori
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.total}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Aktif katalog başlıkları
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('WITH_PRODUCTS')}
          className={`${styles.selectableCard} ${statusFilter === 'WITH_PRODUCTS' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Ürün Bulunanlar
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.withProducts}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Katalogda listelenenler
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('EMPTY')}
          className={`${styles.selectableCard} ${statusFilter === 'EMPTY' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Boş Kategoriler
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: metrics.empty > 0 ? '#d97706' : 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.empty}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Ürün atanmamış alanlar
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
            Sınıflandırılmış Ürün
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.totalProducts}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Toplam aktif ürün bağı
          </div>
        </div>
      </div>

      {/* ── SEARCH & FILTER CONTROLS ─────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            placeholder="Kategori adı veya slug ile filtrele..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.input}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className={styles.select}
          style={{ width: 'auto' }}
        >
          <option value="ALL">Tüm Kategoriler ({categories.length})</option>
          <option value="WITH_PRODUCTS">Ürün Bulunanlar ({metrics.withProducts})</option>
          <option value="EMPTY">Boş Kategoriler ({metrics.empty})</option>
        </select>
      </div>

      {/* ── CATEGORIES TABLE ────────────────────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Slug</th>
              <th>Açıklama</th>
              <th style={{ textAlign: 'center' }}>Bağlı Ürünler</th>
              <th>Durum</th>
              <th style={{ textAlign: 'right' }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Katalog kategorileri yükleniyor...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateTitle}>Kategori Bulunamadı</div>
                    <div className={styles.emptyStateDesc}>
                      {search ? `"${search}" aramasına uygun kategori bulunamadı.` : 'Henüz tanımlanmış bir kategori bulunmuyor.'}
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
                        + Yeni Kategori Oluştur
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {cat.imageUrl ? (
                        <img
                          src={cat.imageUrl}
                          alt={cat.name}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 'var(--radius-xs)',
                            objectFit: 'cover',
                            border: '1px solid var(--border)',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--surface-1)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                            fontWeight: 600,
                          }}
                        >
                          {cat.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {cat.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        background: 'var(--surface-1)',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {cat.slug}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '300px' }}>
                    {cat.description || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {cat.productCount > 0 ? (
                      <Link
                        href={`/admin/products?category=${cat.id}`}
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
                        {cat.productCount} Ürün ↗
                      </Link>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeNeutral}`} style={{ fontFamily: 'var(--font-mono)' }}>
                        0 Ürün
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${cat.productCount > 0 ? styles.badgeSuccess : styles.badgeNeutral}`}
                    >
                      {cat.productCount > 0 ? 'AKTİF' : 'BOŞ'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(cat)}
                        className={styles.secondaryButton}
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        title={cat.isActive === false ? 'Vitrinde yayınla' : 'Vitrinden gizle'}
                      >
                        {cat.isActive === false ? 'Pasif · Yayınla' : 'Yayında · Gizle'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(cat)}
                        className={styles.secondaryButton}
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteModalCat(cat)}
                        className={styles.secondaryButton}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          color: cat.productCount > 0 ? 'var(--text-muted)' : '#dc2626',
                          borderColor: cat.productCount > 0 ? 'var(--border)' : '#fca5a5',
                        }}
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── CREATE / EDIT MODAL ──────────────────────────────────────────────── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        ariaLabel={editingCategory ? 'Kategori Düzenle' : 'Yeni Kategori Ekle'}
        maxWidth={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
              {editingCategory ? 'Kategori Düzenle' : 'Yeni Kategori Ekle'}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              {editingCategory ? `#${editingCategory.id} referanslı kategoriyi güncelleyin.` : 'Fiziksel ürün kataloğu için yeni bir sınıflandırma başlığı tanımlayın.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Kategori Adı *
              </label>
              <input
                type="text"
                required
                placeholder="Örn: Aydınlatmalar"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className={styles.input}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Slug (URL Yolu) *
              </label>
              <input
                type="text"
                required
                placeholder="aydinlatmalar"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className={styles.input}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Vitrin URL adresi: <code>/kategori/{slug || 'ornek'}</code>
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Açıklama
              </label>
              <textarea
                rows={3}
                placeholder="Kategori hakkında kısa operasyonel veya vitrin açıklaması..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.textarea}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Kapak Görseli URL
              </label>
              <input
                type="text"
                placeholder="https://... veya /images/categories/..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className={styles.input}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600 }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Vitrinde yayında (kapalıysa kategori ve ürünleri gizlenir)
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>SEO Başlığı</label>
              <input
                type="text"
                maxLength={70}
                placeholder="Boş bırakılırsa kategori adı kullanılır"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                className={styles.input}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>SEO Açıklaması</label>
              <textarea
                rows={2}
                maxLength={170}
                placeholder="Arama sonuçlarında görünen açıklama"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                className={styles.textarea}
              />
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
                disabled={submitting}
                className={styles.primaryButton}
              >
                {submitting ? 'Kaydediliyor...' : editingCategory ? 'Güncelle' : 'Kategori Ekle'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* ── DELETE CONFIRMATION MODAL ────────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(deleteModalCat)}
        onClose={() => setDeleteModalCat(null)}
        ariaLabel="Kategori Silme Onayı"
        maxWidth={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
              {deleteModalCat && deleteModalCat.productCount > 0
                ? 'Kategori Silinemez'
                : 'Kategoriyi Sil'}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              {deleteModalCat?.name} ({deleteModalCat?.slug})
            </p>
          </div>

          {deleteModalCat && deleteModalCat.productCount > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  padding: '12px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  color: '#991b1b',
                  lineHeight: 1.5,
                }}
              >
                Bu kategoriye bağlı <strong>{deleteModalCat.productCount} adet ürün</strong> bulunmaktadır. Katalog bütünlüğünü korumak için, kategoriyi silmeden önce lütfen bağlı ürünleri başka bir kategoriye taşıyınız.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setDeleteModalCat(null)}
                  className={styles.secondaryButton}
                >
                  Kapat
                </button>
                <Link
                  href={`/admin/products?category=${deleteModalCat.id}`}
                  className={styles.primaryButton}
                >
                  Bağlı Ürünleri İncele →
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                <strong>&quot;{deleteModalCat?.name}&quot;</strong> kategorisini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setDeleteModalCat(null)}
                  className={styles.secondaryButton}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={executeDelete}
                  className={styles.primaryButton}
                  style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                >
                  {deleting ? 'Siliniyor...' : 'Evet, Kategoriyi Sil'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
