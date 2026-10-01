'use client'

import React, { useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { ALL_CATEGORIES } from '@/config/categories'
import { ALL_COLLECTIONS } from '@/config/collections'
import styles from '../../admin.module.css'

export default function AdminNewProductPage() {
  const router = useRouter()
  const { token, canFetch } = useAuthStore()

  const [loading, setLoading] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [sku, setSku] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')

  // Pricing
  const [price, setPrice] = useState<number | ''>('')
  const [compareAtPrice, setCompareAtPrice] = useState<number | ''>('')
  const [costPrice, setCostPrice] = useState<number | ''>('')

  // Classification (Category & Collections)
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES[0]?.slug || 'aydinlatmalar')
  const [selectedCollections, setSelectedCollections] = useState<string[]>(['zuukids'])
  const [material, setMaterial] = useState('PLA Premium (Biyouyumlu Organik Filament)')
  const [status, setStatus] = useState<'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('ACTIVE')
  const [isFeatured, setIsFeatured] = useState(false)
  const [isBestSeller, setIsBestSeller] = useState(false)

  // Inventory
  const [stock, setStock] = useState<number | ''>(0)
  const [lowStockThreshold, setLowStockThreshold] = useState<number | ''>(5)

  // Media
  const [imageUrl, setImageUrl] = useState('')

  // Auto-generate slug and SKU from name
  const handleNameChange = (val: string) => {
    setName(val)
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')) {
      const generated = val
        .toLowerCase()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      setSlug(generated)
    }
    if (!sku) {
      const prefix = val.trim().substring(0, 3).toUpperCase() || 'ZUU'
      setSku(`ZUU-${prefix}-${Math.floor(100 + Math.random() * 900)}`)
    }
  }

  const toggleCollection = (colSlug: string) => {
    setSelectedCollections((prev) =>
      prev.includes(colSlug) ? prev.filter((s) => s !== colSlug) : [...prev, colSlug]
    )
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch) {
      toast.error('Oturum açmanız gerekmektedir.')
      return
    }

    if (!name.trim() || price === '') {
      toast.error('Lütfen ürün adı ve satış fiyatını giriniz.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          sku: sku.trim() || undefined,
          shortDescription: shortDescription.trim(),
          description: description.trim(),
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
          stock: Number(stock) || 0,
          lowStockThreshold: Number(lowStockThreshold) || 5,
          imageUrl: imageUrl.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ürün oluşturulamadı.')
      }

      toast.success(`'${name}' ürünü başarıyla kataloğa eklendi.`)
      router.push('/admin/products')
    } catch (err: any) {
      toast.error(err.message || 'Ürün oluşturulurken bir hata meydana geldi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.pageContainer} style={{ maxWidth: 960 }}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            <Link href="/admin/products" style={{ color: 'inherit', textDecoration: 'none' }}>
              ← Ürün Listesine Dön
            </Link>
          </div>
          <h1 className={styles.pageTitle}>Yeni Ürün Tanımla</h1>
          <p className={styles.pageSubtitle}>Kataloğa yeni bir 3D baskı modeli, parametreleri ve stok bilgilerini ekleyin.</p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            {loading ? 'Kaydediliyor...' : '+ Ürünü Kataloğa Ekle'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 1. Temel Bilgiler */}
        <div className={styles.formCard}>
          <h2 className={styles.formCardTitle}>1. Temel Bilgiler</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-name">
                  Ürün Adı *
                </label>
                <input
                  id="new-name"
                  type="text"
                  required
                  placeholder="Örn: parametrik hive masa lambası"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-sku">
                  SKU (Stok Kodu)
                </label>
                <input
                  id="new-sku"
                  type="text"
                  placeholder="Örn: ZUU-LGT-101"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className={styles.formInput}
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="new-slug">
                URL Slug (Otomatik oluşturulur)
              </label>
              <input
                id="new-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className={styles.formInput}
              />
              <span className={styles.formHelp}>Vitrin linki: /urun/{slug || 'ornek-urun'}</span>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="new-short-desc">
                Kısa Açıklama (Vitrin kartı spot metni)
              </label>
              <input
                id="new-short-desc"
                type="text"
                placeholder="Örn: 3D baskı geometrik abajur, sıcak ambiyans ışığı."
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="new-desc">
                Detaylı Açıklama
              </label>
              <textarea
                id="new-desc"
                rows={4}
                placeholder="Ürünün üretim süreci, malzeme kalitesi ve kullanım alanları hakkında detaylı bilgi..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.formTextarea}
              />
            </div>
          </div>
        </div>

        {/* 2. Fiyatlandırma & Maliyet */}
        <div className={styles.formCard}>
          <h2 className={styles.formCardTitle}>2. Fiyatlandırma & Maliyet</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="new-price">
                Satış Fiyatı (TL) *
              </label>
              <input
                id="new-price"
                type="number"
                step="0.01"
                required
                placeholder="249.90"
                value={price}
                onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className={styles.formInput}
                style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="new-compare-price">
                Karşılaştırma Fiyatı (Üstü Çizili)
              </label>
              <input
                id="new-compare-price"
                type="number"
                step="0.01"
                placeholder="299.90"
                value={compareAtPrice}
                onChange={(e) => setCompareAtPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className={styles.formInput}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </div>

            <div className={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className={styles.formLabel} htmlFor="new-cost-price">
                  Maliyet Fiyatı (TL)
                </label>
                <span className={`${styles.badge} ${styles.badgeWarning}`}>Admin</span>
              </div>
              <input
                id="new-cost-price"
                type="number"
                step="0.01"
                placeholder="85.00"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className={styles.formInput}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
          </div>
        </div>

        {/* 3. Sınıflandırma & Malzeme */}
        <div className={styles.formCard}>
          <h2 className={styles.formCardTitle}>3. Sınıflandırma, Koleksiyon & Malzeme</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-category">
                  Kategori *
                </label>
                <select
                  id="new-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={styles.formSelect}
                >
                  {ALL_CATEGORIES.map((cat) => (
                    <option key={cat.slug} value={cat.slug}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-material">
                  3D Baskı Malzemesi
                </label>
                <input
                  id="new-material"
                  type="text"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Koleksiyonlar (Çoklu Seçim)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, background: 'var(--surface-1)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                {ALL_COLLECTIONS.map((col) => (
                  <label key={col.slug} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedCollections.includes(col.slug)}
                      onChange={() => toggleCollection(col.slug)}
                    />
                    <span>{col.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 24, paddingTop: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                />
                <span>Öne Çıkarılan Ürün Olarak İşaretle</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isBestSeller}
                  onChange={(e) => setIsBestSeller(e.target.checked)}
                />
                <span>Çok Satan Rozeti Ekle</span>
              </label>
            </div>
          </div>
        </div>

        {/* 4. Envanter & Durum */}
        <div className={styles.formCard}>
          <h2 className={styles.formCardTitle}>4. Envanter & Yayın Durumu</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="new-stock">
                Başlangıç Stoğu (Adet)
              </label>
              <input
                id="new-stock"
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value === '' ? '' : Number(e.target.value))}
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="new-threshold">
                Düşük Stok Uyarı Eşiği
              </label>
              <input
                id="new-threshold"
                type="number"
                min="1"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value === '' ? '' : Number(e.target.value))}
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="new-status">
                Yayın Durumu
              </label>
              <select
                id="new-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className={styles.formSelect}
              >
                <option value="ACTIVE">Aktif (Doğrudan Yayında)</option>
                <option value="DRAFT">Taslak (Vitrinde Gizli)</option>
                <option value="ARCHIVED">Arşiv</option>
              </select>
            </div>
          </div>
        </div>

        {/* 5. Görsel & Medya */}
        <div className={styles.formCard}>
          <h2 className={styles.formCardTitle}>5. Görsel & Medya</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, alignItems: 'center' }}>
            <div
              style={{
                position: 'relative',
                width: 160,
                height: 160,
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                border: '1px solid var(--border)',
              }}
            >
              {imageUrl ? (
                <Image src={imageUrl} alt={name || 'Önizleme'} fill style={{ objectFit: 'cover' }} sizes="160px" />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
                  Görsel Yok
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                style={{ alignSelf: 'flex-start' }}
              >
                {uploadingImage ? 'Yükleniyor...' : 'Dosyadan Görsel Yükle (Cloudinary / Yerel)'}
              </button>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-img-url">
                  veya Doğrudan Görsel URL'si Giriniz:
                </label>
                <input
                  id="new-img-url"
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="/images/products/... veya https://..."
                  className={styles.formInput}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingBottom: 24 }}>
          <Link href="/admin/products" className={`${styles.btn} ${styles.btnSecondary}`}>
            İptal
          </Link>
          <button
            type="submit"
            disabled={loading}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            {loading ? 'Kaydediliyor...' : '+ Ürünü Kataloğa Ekle'}
          </button>
        </div>
      </form>
    </div>
  )
}
