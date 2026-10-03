'use client'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { formatPrice } from '@/lib/utils'
import { useAdminCatalogOptions } from '@/hooks/useAdminCatalogOptions'
import { CategoryPicker, CollectionsPicker, MaterialPicker } from '../ProductFormPickers'
import styles from '../../admin.module.css'

export default function AdminEditProductPage() {
  const { categories: ALL_CATEGORIES, collections: ALL_COLLECTIONS, addCategory, addCollection } = useAdminCatalogOptions()
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { token, canFetch } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Confirmation Modals State (UI-16 Global Modal)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [modalActionLoading, setModalActionLoading] = useState(false)

  // Product fields
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')

  // Pricing
  const [price, setPrice] = useState<number | ''>('')
  const [compareAtPrice, setCompareAtPrice] = useState<number | ''>('')
  const [costPrice, setCostPrice] = useState<number | ''>('')

  // Classification
  const [collectionId, setCollectionId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])
  const [material, setMaterial] = useState('')
  const [status, setStatus] = useState<'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('ACTIVE')
  const [isFeatured, setIsFeatured] = useState(false)
  const [isBestSeller, setIsBestSeller] = useState(false)

  const toggleCollection = (colSlug: string) => {
    setSelectedCollections((prev) =>
      prev.includes(colSlug) ? prev.filter((s) => s !== colSlug) : [...prev, colSlug]
    )
  }

  // Stock
  const [stock, setStock] = useState<number>(0)
  const [stockInput, setStockInput] = useState('')
  const [stockSaving, setStockSaving] = useState(false)
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(5)

  // Production and Sales Metrics
  const [productionData, setProductionData] = useState<{ active: number; queued: number; totalCompleted: number }>({
    active: 0,
    queued: 0,
    totalCompleted: 0,
  })

  // Media
  const [imageUrl, setImageUrl] = useState('')

  // Economics & Cost Profile
  const [economics, setEconomics] = useState<any>(null)
  const [savingCost, setSavingCost] = useState(false)
  const [materialName, setMaterialName] = useState('PLA')
  const [materialWeightGrams, setMaterialWeightGrams] = useState<number | ''>('')
  const [materialPricePerKg, setMaterialPricePerKg] = useState<number | ''>(700)
  const [packagingCost, setPackagingCost] = useState<number | ''>('')
  const [otherCost, setOtherCost] = useState<number | ''>('')

  // Load product & economics
  const loadEconomics = async () => {
    if (!canFetch || !id) return
    try {
      const res = await fetch(`/api/admin/products/${id}/economics`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.economics) {
        setEconomics(data.economics)
        const cp = data.economics.costProfile
        if (cp) {
          if (cp.materialName) setMaterialName(cp.materialName)
          if (cp.estimatedMaterialWeightGrams != null) setMaterialWeightGrams(cp.estimatedMaterialWeightGrams)
          if (cp.materialPricePerKgTl != null) setMaterialPricePerKg(cp.materialPricePerKgTl)
          if (cp.packagingCostTl != null) setPackagingCost(cp.packagingCostTl)
          if (cp.otherProductionCostTl != null) setOtherCost(cp.otherProductionCostTl)
        }
      }
    } catch {}
  }

  const loadProduction = async () => {
    if (!canFetch || !id) return
    try {
      const res = await fetch('/api/admin/production', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success && Array.isArray(data.orders)) {
        const prodOrders = data.orders.filter((o: any) => o.productId === id)
        const active = prodOrders
          .filter((o: any) => o.status === 'IN_PROGRESS')
          .reduce((sum: number, o: any) => sum + (o.quantity || 0), 0)
        const queued = prodOrders
          .filter((o: any) => o.status === 'PLANNED' || o.status === 'QUEUED')
          .reduce((sum: number, o: any) => sum + (o.quantity || 0), 0)
        const totalCompleted = prodOrders
          .filter((o: any) => o.status === 'STOCKED' || o.status === 'COMPLETED')
          .reduce((sum: number, o: any) => sum + (o.acceptedQuantity || o.quantity || 0), 0)
        setProductionData({ active, queued, totalCompleted })
      }
    } catch {}
  }

  useEffect(() => {
    if (!canFetch || !id) return
    setLoading(true)

    fetch(`/api/admin/products/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.product) {
          const p = data.product
          setName(p.name || '')
          setSlug(p.slug || '')
          setSku(p.sku || '')
          setBarcode(p.barcode || '')
          setShortDescription(p.shortDescription || '')
          setDescription(p.description || '')
          setPrice(p.price ?? '')
          setCompareAtPrice(p.oldPrice ?? '')
          setCostPrice(p.costPrice ?? p.cost ?? '')
          setCollectionId(p.collectionId || '')
          // The API returns the product's real category id and collection slugs.
          setCategoryId(p.categoryId || '')
          setSelectedCollections(Array.isArray(p.collections) ? p.collections : [])
          setMaterial(p.material || '')
          setStatus(p.status || (p.isActive ? 'ACTIVE' : 'ARCHIVED'))
          setIsFeatured(!!p.isFeatured)
          setIsBestSeller(!!p.isBestSeller)
          setStock(p.stock || 0)
          setLowStockThreshold(p.lowStockThreshold || 5)
          setImageUrl(p.primaryImage?.url || p.images?.[0]?.url || '')
        } else {
          toast.error(data.error || 'Ürün yüklenemedi.')
        }
      })
      .catch((err) => toast.error(err.message || 'Ürün bilgileri alınırken hata oluştu.'))
      .finally(() => setLoading(false))

    loadEconomics()
    loadProduction()
  }, [token, canFetch, id])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !canFetch) return

    setUploadingImage(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/admin/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (data.success && data.url) {
        setImageUrl(data.url)
        toast.success('Görsel başarıyla yüklendi.')
      } else {
        toast.error(data.error || 'Görsel yüklenemedi.')
      }
    } catch {
      toast.error('Görsel yüklenirken bağlantı hatası oluştu.')
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSaveCost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch) return
    setSavingCost(true)

    try {
      const payload = {
        materialName,
        estimatedMaterialWeightGrams: materialWeightGrams === '' ? null : Number(materialWeightGrams),
        materialPricePerKgTl: materialPricePerKg === '' ? null : Number(materialPricePerKg),
        packagingCostTl: packagingCost === '' ? null : Number(packagingCost),
        otherProductionCostTl: otherCost === '' ? null : Number(otherCost),
      }

      const res = await fetch(`/api/admin/products/${id}/cost`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Maliyet profili ve kanal marjları güncellendi.')
        if (data.economics) setEconomics(data.economics)
      } else {
        toast.error(data.error || 'Maliyet bilgileri kaydedilemedi.')
      }
    } catch (err: any) {
      toast.error(err.message || 'Maliyet kaydedilirken ağ hatası.')
    } finally {
      setSavingCost(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch) return
    setSaving(true)

    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          slug,
          sku,
          shortDescription,
          description,
          price: Number(price),
          compareAtPrice: compareAtPrice !== '' ? Number(compareAtPrice) : null,
          costPrice: costPrice !== '' ? Number(costPrice) : null,
          collectionId: selectedCollections[0] || null,
          collections: selectedCollections,
          categoryId,
          material,
          status,
          featured: isFeatured,
          bestSeller: isBestSeller,
          barcode: barcode.trim() || null,
          lowStockThreshold: Number(lowStockThreshold),
          imageUrl: imageUrl || null,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Güncelleme başarısız.')
      }

      toast.success('Ürün detayları başarıyla kaydedildi.')
    } catch (err: any) {
      toast.error(err.message || 'Ürün güncellenirken hata oluştu.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDuplicate = async () => {
    if (!canFetch) return
    setModalActionLoading(true)
    try {
      const res = await fetch(`/api/admin/products/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.product) {
        toast.success(`Ürün başarıyla çoğaltıldı: ${data.product.name}`)
        setShowDuplicateModal(false)
        router.push(`/admin/products/${data.product.id}`)
      } else {
        toast.error(data.error || 'Çoğaltma başarısız.')
      }
    } catch {
      toast.error('İşlem başarısız.')
    } finally {
      setModalActionLoading(false)
    }
  }

  const confirmArchiveToggle = async () => {
    if (!canFetch) return
    const newStatus = status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED'
    setModalActionLoading(true)

    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus, isActive: newStatus === 'ACTIVE' }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus(newStatus)
        toast.success(
          newStatus === 'ARCHIVED'
            ? 'Ürün güvenle arşivlendi ve vitrinden gizlendi.'
            : 'Ürün tekrar aktif hale getirildi ve vitrinde yayına alındı.'
        )
        setShowArchiveModal(false)
      } else {
        toast.error(data.error || 'İşlem başarısız.')
      }
    } catch {
      toast.error('İşlem sırasında bağlantı hatası oluştu.')
    } finally {
      setModalActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
        Ürün detayları yükleniyor...
      </div>
    )
  }

  // Writes a counted stock level. The stock shown is sent along, so a sale that
  // arrived meanwhile is reported instead of being overwritten.
  const saveStock = async () => {
    const value = Number(stockInput)
    if (stockInput.trim() === '' || !Number.isInteger(value) || value < 0) {
      toast.error('Stok için 0 veya pozitif bir tam sayı girin.')
      return
    }
    setStockSaving(true)
    try {
      const res = await fetch('/api/admin/inventory/set-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: [{ productId: id, stock: value, expectedStock: stock }], reason: 'Ürün sayfasından stok girişi' }),
      })
      const data = await res.json()
      const result = data.results?.[0]
      if (!data.success || !result) throw new Error(data.error || 'Stok güncellenemedi.')
      if (result.status === 'UPDATED' || result.status === 'UNCHANGED') {
        setStock(result.newStock)
        setStockInput('')
        toast.success(`Stok ${result.newStock} olarak kaydedildi.`)
      } else {
        if (result.status === 'CONFLICT' && typeof result.previousStock === 'number') setStock(result.previousStock)
        toast.error(result.message || 'Stok güncellenemedi.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Stok güncellenemedi.')
    } finally {
      setStockSaving(false)
    }
  }

  return (
    <div className={styles.pageContainer} style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            <Link href="/admin/products" style={{ color: 'inherit', textDecoration: 'none' }}>
              ← Ürün Listesine Dön
            </Link>
          </div>
          <h1 className={styles.pageTitle}>{name || 'Ürün Düzenle'}</h1>
          <p className={styles.pageSubtitle}>
            SKU: <code style={{ fontFamily: 'monospace', fontWeight: 600 }}>{sku}</code> · Durum:{' '}
            <span
              className={`${styles.badge} ${
                status === 'ACTIVE'
                  ? styles.badgeActive
                  : status === 'DRAFT'
                  ? styles.badgeDraft
                  : styles.badgeArchived
              }`}
            >
              {status}
            </span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowDuplicateModal(true)}
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            Çoğalt (Yeni Kopya)
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Left Column: Product Details Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* General Information */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Genel Bilgiler</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="prod-name">
                  Ürün Adı *
                </label>
                <input
                  id="prod-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="prod-slug">
                    Slug
                  </label>
                  <input
                    id="prod-slug"
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="prod-sku">
                    SKU
                  </label>
                  <input
                    id="prod-sku"
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className={styles.formInput}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="prod-barcode">
                    Barkod (EAN/GTIN)
                  </label>
                  <input
                    id="prod-barcode"
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="868000100001"
                    className={styles.formInput}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="prod-short-desc">
                  Kısa Açıklama (Vitrin kartı ve özet)
                </label>
                <input
                  id="prod-short-desc"
                  type="text"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="prod-desc">
                  Detaylı Açıklama (Teknik ve tasarım detayları)
                </label>
                <textarea
                  id="prod-desc"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={styles.formTextarea}
                />
              </div>
            </div>
          </div>

          {/* Pricing & Commerce */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Fiyatlandırma & Ticaret</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="prod-price">
                  Satış Fiyatı (TL) *
                </label>
                <input
                  id="prod-price"
                  type="number"
                  step="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.formInput}
                  style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="prod-compare-price">
                  Üstü Çizili Fiyat (TL)
                </label>
                <input
                  id="prod-compare-price"
                  type="number"
                  step="0.01"
                  value={compareAtPrice}
                  onChange={(e) => setCompareAtPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.formInput}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </div>

              <div className={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className={styles.formLabel} htmlFor="prod-cost-price">
                    Maliyet Fiyatı (TL)
                  </label>
                  <span className={`${styles.badge} ${styles.badgeWarning}`}>Admin</span>
                </div>
                <input
                  id="prod-cost-price"
                  type="number"
                  step="0.01"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.formInput}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </div>
            </div>
          </div>

          {/* 3D Printing Economics & Cost Profile */}
          <div className={styles.formCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 className={styles.formCardTitle} style={{ borderBottom: 'none', margin: 0, padding: 0 }}>
                  Ürün Ekonomisi & 3D Baskı Maliyeti
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Filament gramajı, sarf malzeme ve paketleme giderleriyle hesaplanan net katkı.
                </p>
              </div>

              {economics?.costProfile?.estimatedProductionCostTl != null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tahmini Üretim Maliyeti</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--zuu-blue)' }}>
                    {formatPrice(economics.costProfile.estimatedProductionCostTl)}
                  </div>
                </div>
              )}
            </div>

            {/* Cost Breakdown Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Filament / Malzeme</label>
                <select
                  value={materialName}
                  onChange={(e) => setMaterialName(e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="PLA">PLA</option>
                  <option value="PETG">PETG</option>
                  <option value="TPU">TPU</option>
                  <option value="ABS">ABS</option>
                  <option value="Özel">Özel / Diğer</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Gramaj (g)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="35"
                  value={materialWeightGrams}
                  onChange={(e) => setMaterialWeightGrams(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Malzeme (TL/kg)</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  placeholder="700"
                  value={materialPricePerKg}
                  onChange={(e) => setMaterialPricePerKg(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Paketleme (TL)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="6.00"
                  value={packagingCost}
                  onChange={(e) => setPackagingCost(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Diğer (TL)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="2.00"
                  value={otherCost}
                  onChange={(e) => setOtherCost(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.formInput}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {materialWeightGrams !== '' && materialPricePerKg !== '' ? (
                  <span>
                    Hesaplanan hammadde: <strong>{formatPrice((Number(materialWeightGrams) / 1000) * Number(materialPricePerKg))}</strong>
                    {packagingCost !== '' && ` + Paket: ${formatPrice(Number(packagingCost))}`}
                    {otherCost !== '' && ` + Diğer: ${formatPrice(Number(otherCost))}`}
                  </span>
                ) : (
                  <span style={{ color: 'var(--warning)' }}>Gramaj ve kg fiyatı girildiğinde maliyet otomatik hesaplanır.</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveCost}
                disabled={savingCost}
                className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              >
                {savingCost ? 'Kaydediliyor...' : 'Maliyetleri Kaydet'}
              </button>
            </div>

            {/* Channel Margin Comparison Table */}
            {economics?.channelEconomics && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  Satış Kanalları Katkı & Marj Karşılaştırması
                </h3>

                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.adminTable} style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Kanal</th>
                        <th style={{ textAlign: 'right' }}>Satış Fiyatı</th>
                        <th style={{ textAlign: 'right' }}>Üretim Maliyeti</th>
                        <th style={{ textAlign: 'right' }}>Komisyon</th>
                        <th style={{ textAlign: 'right' }}>Kargo</th>
                        <th style={{ textAlign: 'right' }}>Ödeme / POS</th>
                        <th style={{ textAlign: 'right' }}>Net Katkı</th>
                        <th style={{ textAlign: 'right' }}>Katkı Marjı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['ZUULAB', 'TRENDYOL', 'HEPSIBURADA'] as const).map((ch) => {
                        const econ = economics.channelEconomics[ch]
                        if (!econ) return null
                        return (
                          <tr key={ch}>
                            <td style={{ fontWeight: 600 }}>{econ.channelName}</td>
                            <td style={{ textAlign: 'right' }}>{econ.sellingPriceTl != null ? formatPrice(econ.sellingPriceTl) : '—'}</td>
                            <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{econ.estimatedProductionCostTl != null ? formatPrice(econ.estimatedProductionCostTl) : '—'}</td>
                            <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                              {econ.commissionAmountTl != null ? formatPrice(econ.commissionAmountTl) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{econ.shippingCostTl != null ? formatPrice(econ.shippingCostTl) : '—'}</td>
                            <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{econ.paymentFeeTl != null ? formatPrice(econ.paymentFeeTl) : '—'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: econ.estimatedContributionTl && econ.estimatedContributionTl > 0 ? '#059669' : '#dc2626' }}>
                              {econ.estimatedContributionTl != null ? formatPrice(econ.estimatedContributionTl) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              {econ.marginPercent != null ? `%${econ.marginPercent}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Classification */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Sınıflandırma & Koleksiyonlar</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <CategoryPicker id="prod-cat" value={categoryId} onChange={setCategoryId} categories={ALL_CATEGORIES} onCreated={addCategory} />
              <CollectionsPicker selected={selectedCollections} onToggle={toggleCollection} collections={ALL_COLLECTIONS} onCreated={addCollection} />
              <MaterialPicker id="prod-material" value={material} onChange={setMaterial} />

              <div style={{ display: 'flex', gap: 24, paddingTop: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                  />
                  <span>Öne Çıkarılan Ürün</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isBestSeller}
                    onChange={(e) => setIsBestSeller(e.target.checked)}
                  />
                  <span>Çok Satan Ürün</span>
                </label>
              </div>
            </div>
          </div>
        </form>

        {/* Right Column: Inventory, Media, 3D Print Status, Danger Zone */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Inventory Breakdown Card */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Envanter Durumu</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Satılabilir stok:</span>
                <span style={{ fontWeight: 600, color: stock > 0 ? '#059669' : '#dc2626' }}>{stock} adet</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Düşük stok eşiği:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{lowStockThreshold} adet</span>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label className={styles.formLabel} htmlFor="prod-stock-count">
                Yeni stok (sayılan miktar)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="prod-stock-count"
                  type="number"
                  min={0}
                  step={1}
                  className={styles.formInput}
                  placeholder={String(stock)}
                  value={stockInput}
                  onChange={(e) => setStockInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveStock()
                    }
                  }}
                />
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={saveStock}
                  disabled={stockSaving}
                >
                  {stockSaving ? 'Kaydediliyor…' : 'Stoku kaydet'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                Rafta saydığınız adedi yazın. Stok ayrıca kaydedilir; ürün formundaki &quot;Kaydet&quot; stoğa dokunmaz.
              </p>
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              <Link
                href="/admin/inventory"
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ width: '100%', fontSize: 12 }}
              >
                ⇄ Envanter Yönetimine Git
              </Link>
            </div>
          </div>

          {/* 3D Production Workshop Status Card */}
          <div className={styles.formCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 className={styles.formCardTitle} style={{ borderBottom: 'none', margin: 0, padding: 0 }}>
                3D Atölye Üretimi
              </h2>
              <span className={`${styles.badge} ${styles.badgeInfo}`}>Atölye</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Yazıcıda Basılıyor:</span>
                <span style={{ fontWeight: 600, color: productionData.active > 0 ? 'var(--zuu-blue)' : 'var(--text-primary)' }}>
                  {productionData.active} adet
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Kuyrukta Sırada:</span>
                <span style={{ fontWeight: 600, color: productionData.queued > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
                  {productionData.queued} adet
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Toplam Üretilmiş:</span>
                <span style={{ fontWeight: 600, color: '#059669' }}>
                  {productionData.totalCompleted} adet
                </span>
              </div>
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              <Link
                href={`/admin/production/new?productId=${id}&quantity=10&priority=HIGH`}
                className={`${styles.btn} ${styles.btnPrimary}`}
                style={{ width: '100%', fontSize: 12 }}
              >
                + Üretim Emri Ver (10 Adet)
              </Link>
            </div>
          </div>

          {/* Media & Image Upload Card */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Ürün Görseli</h2>

            <div
              style={{
                position: 'relative',
                width: '100%',
                height: 180,
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                marginBottom: 12,
                border: '1px solid var(--border)',
              }}
            >
              {imageUrl ? (
                <Image src={imageUrl} alt={name || 'Ürün görseli'} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 320px" />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
                  Görsel Yüklenmedi
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                disabled={uploadingImage}
                onClick={() => fileInputRef.current?.click()}
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ width: '100%', fontSize: 12 }}
              >
                {uploadingImage ? 'Yükleniyor...' : 'Dosyadan Görsel Yükle'}
              </button>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} style={{ fontSize: 11 }}>
                  veya URL Giriniz:
                </label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://... veya /images/..."
                  className={styles.formInput}
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>
          </div>

          {/* Danger Zone Card */}
          <div className={styles.formCard} style={{ borderColor: 'var(--border-strong)' }}>
            <h2 className={styles.formCardTitle} style={{ color: '#dc2626' }}>
              Tehlikeli İşlem & Arşivleme
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 12px' }}>
              Geçmiş siparişlerde yer alan ürünlerin silinmesi sipariş ve fatura bütünlüğünü bozar. Bunun yerine ürünü arşivleyerek vitrinden kaldırabilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => setShowArchiveModal(true)}
              className={`${styles.btn} ${status === 'ARCHIVED' ? styles.btnSecondary : styles.btnDanger}`}
              style={{ width: '100%', fontSize: 12 }}
            >
              {status === 'ARCHIVED' ? 'Ürünü Tekrar Yayına Al' : 'Ürünü Arşivle (Vitrinden Kaldır)'}
            </button>
          </div>
        </div>
      </div>

      {/* ── UI-16 Global Modal: Duplicate Confirmation ── */}
      <Modal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        ariaLabel="Ürün Kopyalama Onayı"
        maxWidth={460}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            Ürünü Çoğalt
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
            <strong>'{name}'</strong> ürününün tüm ayarları, fiyatı ve açıklamaları kopyalanarak yeni bir taslak ürün ve benzersiz SKU oluşturulacaktır. Onaylıyor musunuz?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setShowDuplicateModal(false)}
              disabled={modalActionLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={confirmDuplicate}
              disabled={modalActionLoading}
            >
              {modalActionLoading ? 'Çoğaltılıyor...' : 'Evet, Çoğalt'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── UI-16 Global Modal: Archive / Restore Confirmation ── */}
      <Modal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        ariaLabel="Arşiv Durumu Değişikliği Onayı"
        maxWidth={460}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            {status === 'ARCHIVED' ? 'Ürünü Tekrar Yayına Al' : 'Ürünü Arşivle'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
            {status === 'ARCHIVED'
              ? `'${name}' ürünü tekrar vitrinde aktif hale getirilecektir.`
              : `'${name}' ürününü arşivlemek istediğinize emin misiniz? Arşivlenen ürünler vitrinde gizlenir, fakat sipariş geçmişi ve fatura kayıtları bozulmaz.`}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setShowArchiveModal(false)}
              disabled={modalActionLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${status === 'ARCHIVED' ? styles.btnPrimary : styles.btnDanger}`}
              onClick={confirmArchiveToggle}
              disabled={modalActionLoading}
            >
              {modalActionLoading ? 'İşleniyor...' : status === 'ARCHIVED' ? 'Yayına Al' : 'Evet, Arşivle'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
