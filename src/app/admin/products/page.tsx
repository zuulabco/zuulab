'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { formatPrice } from '@/lib/utils'
import { useAdminCatalogOptions } from '@/hooks/useAdminCatalogOptions'
import styles from '../admin.module.css'
import { SkeletonRows } from '@/components/common/Skeleton'

const PAGE_SIZE = 50

interface ProductItem {
  id: string
  name: string
  slug: string
  sku: string
  price: number
  oldPrice?: number | null
  costPrice?: number | null
  cost?: number | null
  stock: number
  lowStockThreshold?: number
  categoryId?: string
  categoryName?: string
  collectionId?: string
  collectionWorld?: string
  collections?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  isActive?: boolean
  isFeatured?: boolean
  isBestSeller?: boolean
  primaryImage?: { url: string; alt?: string }
  images?: { url: string; alt?: string }[]
  updatedAt?: string
}

export default function AdminProductsPage() {
  const { categories: ALL_CATEGORIES, collections: ALL_COLLECTIONS } = useAdminCatalogOptions()
  const { token, canFetch } = useAuthStore()
  const [products, setProducts] = useState<ProductItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters & Pagination
  const [search, setSearch] = useState('')
  const [collection, setCollection] = useState('ALL')
  const [category, setCategory] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [stockLevel, setStockLevel] = useState('all')
  // The list grows by PAGE_SIZE as the admin scrolls to the bottom.
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Bulk stock count
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({})
  const [stockAll, setStockAll] = useState('')
  const [stockReason, setStockReason] = useState('Stok sayımı')
  const [stockSaving, setStockSaving] = useState(false)
  const [stockMessages, setStockMessages] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [actionLoading, setActionLoading] = useState(false)

  // UI-16 Global Modal State
  const [archiveModal, setArchiveModal] = useState<{ isOpen: boolean; product: ProductItem | null }>({
    isOpen: false,
    product: null,
  })
  const [duplicateModal, setDuplicateModal] = useState<{ isOpen: boolean; product: ProductItem | null }>({
    isOpen: false,
    product: null,
  })
  const [bulkModal, setBulkModal] = useState<{ isOpen: boolean; action: string | null }>({
    isOpen: false,
    action: null,
  })

  const loadProducts = useCallback(() => {
    if (!canFetch) return
    if (limit === PAGE_SIZE) setLoading(true)
    else setLoadingMore(true)

    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (collection !== 'ALL') params.set('collection', collection)
    if (category !== 'ALL') params.set('category', category)
    if (status !== 'ALL') params.set('status', status)
    if (stockLevel !== 'all') params.set('stockLevel', stockLevel)
    params.set('limit', String(limit))
    params.set('offset', '0')

    fetch(`/api/admin/products?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products)
          setTotal(data.total !== undefined ? data.total : data.products.length)
        } else {
          toast.error(data.error || 'Ürünler yüklenirken hata oluştu.')
        }
      })
      .catch((err) => {
        console.error(err)
        toast.error('Bağlantı hatası: Ürün listesi alınamadı.')
      })
      .finally(() => {
        setLoading(false)
        setLoadingMore(false)
      })
  }, [token, canFetch, search, collection, category, status, stockLevel, limit])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLimit(PAGE_SIZE)
    loadProducts()
  }

  const handleResetFilters = () => {
    setSearch('')
    setCollection('ALL')
    setCategory('ALL')
    setStatus('ALL')
    setStockLevel('all')
    setLimit(PAGE_SIZE)
  }

  // Duplicate product via Modal
  const confirmDuplicate = async () => {
    if (!duplicateModal.product || !canFetch) return
    const prod = duplicateModal.product
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/products/${prod.id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`'${prod.name}' başarıyla çoğaltıldı. Yeni SKU: ${data.product?.sku || 'oluşturuldu'}`)
        setDuplicateModal({ isOpen: false, product: null })
        loadProducts()
      } else {
        toast.error(data.error || 'Ürün çoğaltılamadı.')
      }
    } catch {
      toast.error('Çoğaltma işlemi başarısız oldu.')
    } finally {
      setActionLoading(false)
    }
  }

  // Archive / Restore product via Modal
  const confirmArchive = async () => {
    if (!archiveModal.product || !canFetch) return
    const prod = archiveModal.product
    const isCurrentlyArchived = ((prod as any).status === 'ARCHIVED') || (!prod.isActive && (prod as any).status !== 'DRAFT')
    const targetStatus = isCurrentlyArchived ? 'ACTIVE' : 'ARCHIVED'

    setActionLoading(true)
    try {
      let res
      if (!isCurrentlyArchived) {
        // DELETE endpoint safely archives
        res = await fetch(`/api/admin/products/${prod.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      } else {
        // Restore via PUT
        res = await fetch(`/api/admin/products/${prod.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: targetStatus, isActive: true }),
        })
      }
      const data = await res.json()
      if (data.success) {
        toast.success(
          isCurrentlyArchived
            ? `'${prod.name}' tekrar yayına alındı.`
            : `'${prod.name}' güvenli şekilde arşivlendi.`
        )
        setArchiveModal({ isOpen: false, product: null })
        loadProducts()
      } else {
        toast.error(data.error || 'İşlem tamamlanamadı.')
      }
    } catch {
      toast.error('İşlem sırasında bağlantı hatası oluştu.')
    } finally {
      setActionLoading(false)
    }
  }

  // Bulk actions via Modal
  const confirmBulkAction = async () => {
    if (!bulkModal.action || selectedIds.length === 0 || !canFetch) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: selectedIds, action: bulkModal.action }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${data.result?.count || selectedIds.length} ürün başarıyla güncellendi.`)
        setSelectedIds([])
        setBulkModal({ isOpen: false, action: null })
        loadProducts()
      } else {
        toast.error(data.error || 'Toplu işlem başarısız oldu.')
      }
    } catch {
      toast.error('Toplu işlem sırasında hata oluştu.')
    } finally {
      setActionLoading(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(products.map((p) => p.id))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const hasMore = products.length < total

  // Load the next PAGE_SIZE rows when the bottom of the list comes into view.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loading || loadingMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE_SIZE)
      },
      { rootMargin: '200px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore])
  const isFiltered = search !== '' || collection !== 'ALL' || category !== 'ALL' || status !== 'ALL' || stockLevel !== 'all'

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ürün Kataloğu Yönetimi</h1>
          <p className={styles.pageSubtitle}>
            Tüm 3D baskı tasarımları, fiyatlandırma, üretim maliyetleri, stok seviyeleri ve vitrin görünürlüğü.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="/api/admin/export?type=products"
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            <span>↓</span>
            <span>CSV Dışa Aktar</span>
          </a>

          <Link
            href="/admin/products/new"
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            <span>+</span>
            <span>Yeni Ürün Ekle</span>
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className={styles.filterCard}>
        <div className={styles.filterRow}>
          <form onSubmit={handleSearchSubmit} style={{ flex: 2, minWidth: 260, display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Ürün adı, SKU veya model ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.filterInput}
            />
            <button type="submit" className={`${styles.btn} ${styles.btnSecondary}`}>
              Ara
            </button>
          </form>

          <select
            value={collection}
            onChange={(e) => {
              setCollection(e.target.value)
              setLimit(PAGE_SIZE)
            }}
            className={styles.filterSelect}
            style={{ flex: 1, minWidth: 160 }}
          >
            <option value="ALL">Tüm Koleksiyonlar</option>
            {ALL_COLLECTIONS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setLimit(PAGE_SIZE)
            }}
            className={styles.filterSelect}
            style={{ flex: 1, minWidth: 160 }}
          >
            <option value="ALL">Tüm Kategoriler</option>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat.slug} value={cat.slug}>
                {cat.name}
              </option>
            ))}
          </select>

          <select
            value={stockLevel}
            onChange={(e) => {
              setStockLevel(e.target.value)
              setLimit(PAGE_SIZE)
            }}
            className={styles.filterSelect}
            style={{ minWidth: 150 }}
          >
            <option value="all">Tüm Stok Durumları</option>
            <option value="in_stock">Stokta Var (&gt;10)</option>
            <option value="low_stock">Kritik Stok (≤10)</option>
            <option value="out_of_stock">Tükenenler (0)</option>
          </select>

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setLimit(PAGE_SIZE)
            }}
            className={styles.filterSelect}
            style={{ minWidth: 130 }}
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="ACTIVE">Aktif (Yayında)</option>
            <option value="DRAFT">Taslak</option>
            <option value="ARCHIVED">Arşivlenmiş</option>
          </select>

          {isFiltered && (
            <button
              type="button"
              onClick={handleResetFilters}
              className={`${styles.btn} ${styles.btnGhost}`}
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              Filtreleri Sıfırla
            </button>
          )}
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.length > 0 && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong>{selectedIds.length}</strong> ürün seçildi
            </span>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  setStockDrafts({})
                  setStockAll('')
                  setStockMessages({})
                  setStockModalOpen(true)
                }}
                className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
              >
                Stok Güncelle
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setBulkModal({ isOpen: true, action: 'activate' })}
                className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              >
                Aktife Al
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setBulkModal({ isOpen: true, action: 'set_featured' })}
                className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              >
                Öne Çıkar
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setBulkModal({ isOpen: true, action: 'archive' })}
                className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
              >
                Toplu Arşivle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Products Table Card */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={products.length > 0 && selectedIds.length === products.length}
                    onChange={toggleSelectAll}
                    aria-label="Tümünü seç"
                  />
                </th>
                <th style={{ width: 56 }}>Görsel</th>
                <th>Ürün & SKU</th>
                <th>Kategori</th>
                <th>Koleksiyon</th>
                <th style={{ textAlign: 'right' }}>Fiyat</th>
                <th style={{ textAlign: 'right' }}>Maliyet (Admin)</th>
                <th style={{ textAlign: 'center' }}>Stok</th>
                <th style={{ textAlign: 'center' }}>Durum</th>
                <th style={{ textAlign: 'right' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={6} cols={10} />
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Kriterlere uygun ürün bulunamadı.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isSelected = selectedIds.includes(p.id)
                  const img = p.primaryImage?.url || p.images?.[0]?.url || '/placeholder.png'
                  const cost = p.costPrice || p.cost || Math.round(p.price * 0.35)
                  const prodStatus = p.status || (p.isActive ? 'ACTIVE' : 'ARCHIVED')

                  return (
                    <tr key={p.id} className={isSelected ? styles.tableRowSelected : undefined}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`${p.name} seç`}
                        />
                      </td>
                      <td>
                        <div
                          style={{
                            position: 'relative',
                            width: 44,
                            height: 44,
                            borderRadius: 'var(--radius-xs)',
                            overflow: 'hidden',
                            backgroundColor: 'var(--surface-2)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <Image src={img} alt={p.name} fill style={{ objectFit: 'cover' }} sizes="44px" />
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {p.sku}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {p.categoryName || p.categoryId || '—'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ textTransform: 'lowercase', fontWeight: 500 }}>
                          {p.collectionWorld || p.collectionId || p.collections?.[0] || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(p.price)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
                        ₺{Number(cost).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {p.stock <= 0 ? (
                          <span className={`${styles.badge} ${styles.badgeDanger}`}>Tükendi (0)</span>
                        ) : p.stock <= 10 ? (
                          <span className={`${styles.badge} ${styles.badgeWarning}`}>Kritik ({p.stock})</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeSuccess}`}>{p.stock} adet</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {prodStatus === 'ACTIVE' ? (
                          <span className={`${styles.badge} ${styles.badgeActive}`}>Aktif</span>
                        ) : prodStatus === 'DRAFT' ? (
                          <span className={`${styles.badge} ${styles.badgeDraft}`}>Taslak</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeArchived}`}>Arşiv</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <Link
                            href={`/admin/products/${p.id}`}
                            className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                          >
                            Düzenle
                          </Link>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => setDuplicateModal({ isOpen: true, product: p })}
                            className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                            title="Yeni bir kopya oluştur"
                          >
                            Çoğalt
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => setArchiveModal({ isOpen: true, product: p })}
                            className={`${styles.btn} ${styles.btnSm} ${prodStatus === 'ARCHIVED' ? styles.btnSecondary : styles.btnDanger}`}
                            title={prodStatus === 'ARCHIVED' ? 'Yeniden yayına al' : 'Vitrinden kaldır ve arşivle'}
                          >
                            {prodStatus === 'ARCHIVED' ? 'Yayına Al' : 'Arşivle'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* List footer: grows on scroll */}
        <div className={styles.paginationBar}>
          <div>
            Toplam <strong>{total}</strong> üründen <strong>{products.length}</strong> tanesi gösteriliyor
          </div>
          {hasMore && (
            <button
              type="button"
              className={styles.pageNavBtn}
              disabled={loading || loadingMore}
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
            >
              {loadingMore ? 'Yükleniyor…' : 'Daha fazla yükle'}
            </button>
          )}
        </div>
        <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
      </div>

      {/* ── UI-16 Global Modal: Archive Confirmation ── */}
      <Modal
        isOpen={archiveModal.isOpen}
        onClose={() => setArchiveModal({ isOpen: false, product: null })}
        ariaLabel="Ürün Arşivleme Onayı"
        maxWidth={460}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            {archiveModal.product?.status === 'ARCHIVED' ? 'Ürünü Tekrar Yayına Al' : 'Ürünü Arşivle'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
            {archiveModal.product?.status === 'ARCHIVED'
              ? `'${archiveModal.product?.name}' ürünü tekrar vitrinde aktif hale getirilecektir.`
              : `'${archiveModal.product?.name}' ürününü arşivlemek istediğinize emin misiniz? Arşivlenen ürünler vitrinde gizlenir, ancak sipariş geçmişi ve fatura kayıtları bozulmaz.`}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setArchiveModal({ isOpen: false, product: null })}
              disabled={actionLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${archiveModal.product?.status === 'ARCHIVED' ? styles.btnPrimary : styles.btnDanger}`}
              onClick={confirmArchive}
              disabled={actionLoading}
            >
              {actionLoading ? 'İşleniyor...' : archiveModal.product?.status === 'ARCHIVED' ? 'Yayına Al' : 'Evet, Arşivle'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── UI-16 Global Modal: Duplicate Confirmation ── */}
      <Modal
        isOpen={duplicateModal.isOpen}
        onClose={() => setDuplicateModal({ isOpen: false, product: null })}
        ariaLabel="Ürün Çoğaltma Onayı"
        maxWidth={460}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            Ürünü Çoğalt
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
            <strong>'{duplicateModal.product?.name}'</strong> ürününün tüm ayarları, fiyatı ve açıklamaları kopyalanarak yeni bir taslak ürün ve benzersiz SKU oluşturulacaktır. Onaylıyor musunuz?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setDuplicateModal({ isOpen: false, product: null })}
              disabled={actionLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={confirmDuplicate}
              disabled={actionLoading}
            >
              {actionLoading ? 'Çoğaltılıyor...' : 'Evet, Çoğalt'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk stock count */}
      <Modal
        isOpen={stockModalOpen}
        onClose={() => !stockSaving && setStockModalOpen(false)}
        ariaLabel="Toplu stok güncelleme"
        maxWidth={680}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
            Toplu stok güncelleme
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px' }}>
            Her ürün için rafta saydığınız adedi yazın; boş bıraktıklarınız değişmez. Siz bu ekrandayken bir sipariş
            gelip stok değişirse o ürün kaydedilmez ve size bildirilir.
          </p>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              type="number"
              min={0}
              step={1}
              className={styles.formInput}
              style={{ width: 120 }}
              placeholder="Adet"
              value={stockAll}
              onChange={(e) => setStockAll(e.target.value)}
            />
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              disabled={stockAll.trim() === ''}
              onClick={() =>
                setStockDrafts(Object.fromEntries(selectedIds.map((id) => [id, stockAll.trim()])))
              }
            >
              Hepsine uygula
            </button>
            <input
              className={styles.formInput}
              style={{ flex: 1 }}
              placeholder="Açıklama"
              value={stockReason}
              onChange={(e) => setStockReason(e.target.value)}
              aria-label="Açıklama"
            />
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <table className={styles.table} style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th style={{ width: 90 }}>Mevcut</th>
                  <th style={{ width: 120 }}>Yeni stok</th>
                </tr>
              </thead>
              <tbody>
                {products
                  .filter((p) => selectedIds.includes(p.id))
                  .map((p) => {
                    const message = stockMessages[p.id]
                    return (
                      <tr key={p.id}>
                        <td style={{ fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div style={{ color: 'var(--text-muted)' }}>{p.sku}</div>
                          {message && (
                            <div style={{ color: message.ok ? '#059669' : '#dc2626', marginTop: 2 }}>{message.text}</div>
                          )}
                        </td>
                        <td style={{ fontSize: 13 }}>{p.stock}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className={styles.formInput}
                            style={{ width: 100 }}
                            placeholder={String(p.stock)}
                            value={stockDrafts[p.id] ?? ''}
                            onChange={(e) => setStockDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                            aria-label={`${p.name} yeni stok`}
                          />
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setStockModalOpen(false)}
              disabled={stockSaving}
            >
              Kapat
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={stockSaving}
              onClick={async () => {
                const items = products
                  .filter((p) => selectedIds.includes(p.id) && (stockDrafts[p.id] ?? '').trim() !== '')
                  .map((p) => ({ productId: p.id, stock: Number(stockDrafts[p.id]), expectedStock: p.stock }))
                if (items.length === 0) {
                  toast.error('En az bir ürün için yeni stok girin.')
                  return
                }
                if (items.some((i) => !Number.isInteger(i.stock) || i.stock < 0)) {
                  toast.error('Stoklar 0 veya pozitif tam sayı olmalıdır.')
                  return
                }
                setStockSaving(true)
                try {
                  const res = await fetch('/api/admin/inventory/set-stock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ items, reason: stockReason }),
                  })
                  const data = await res.json()
                  if (!data.success) throw new Error(data.error || 'Stok güncellenemedi.')
                  const results = data.results as Array<{ productId: string; status: string; newStock: number | null; message?: string }>
                  const ok = results.filter((r) => r.status === 'UPDATED' || r.status === 'UNCHANGED')
                  const failed = results.filter((r) => r.status !== 'UPDATED' && r.status !== 'UNCHANGED')
                  setStockMessages(
                    Object.fromEntries(
                      results.map((r) => [
                        r.productId,
                        ok.includes(r)
                          ? { ok: true, text: `Kaydedildi: ${r.newStock}` }
                          : { ok: false, text: r.message || 'Kaydedilemedi.' },
                      ])
                    )
                  )
                  loadProducts()
                  if (failed.length === 0) {
                    toast.success(`${ok.length} ürünün stoğu kaydedildi.`)
                    setStockModalOpen(false)
                  } else {
                    // Conflicting rows keep their input; the list now shows the current stock.
                    toast.error(`${failed.length} ürün kaydedilemedi, ayrıntılar listede.`)
                    setStockDrafts((d) => Object.fromEntries(Object.entries(d).filter(([id]) => failed.some((f) => f.productId === id))))
                  }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Stok güncellenemedi.')
                } finally {
                  setStockSaving(false)
                }
              }}
            >
              {stockSaving ? 'Kaydediliyor…' : 'Stokları kaydet'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── UI-16 Global Modal: Bulk Action Confirmation ── */}
      <Modal
        isOpen={bulkModal.isOpen}
        onClose={() => setBulkModal({ isOpen: false, action: null })}
        ariaLabel="Toplu İşlem Onayı"
        maxWidth={460}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            Toplu İşlem Onayı
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
            Seçili <strong>{selectedIds.length}</strong> adet ürün üzerinde <strong>'{bulkModal.action}'</strong> işlemi uygulanacaktır. Bu işlemi onaylıyor musunuz?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setBulkModal({ isOpen: false, action: null })}
              disabled={actionLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${bulkModal.action === 'archive' ? styles.btnDanger : styles.btnPrimary}`}
              onClick={confirmBulkAction}
              disabled={actionLoading}
            >
              {actionLoading ? 'Uygulanıyor...' : 'Onayla ve Uygula'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
