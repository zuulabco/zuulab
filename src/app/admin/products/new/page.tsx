'use client'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { useAdminCatalogOptions } from '@/hooks/useAdminCatalogOptions'
import { CategoryPicker, CollectionsPicker, MaterialPicker } from '../ProductFormPickers'
import { EMPTY_SIZE, EMPTY_VARIANTS, SizeEditor, VariantsEditor, saveSize, saveVariants, type SizeValue, type VariantsValue } from '../ProductVariantsEditor'
import styles from '../../admin.module.css'
import form from './NewProduct.module.css'

function slugify(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function AdminNewProductPage() {
  const { categories, collections, addCategory, addCollection } = useAdminCatalogOptions()
  const router = useRouter()
  const { token, canFetch } = useAuthStore()

  const [loading, setLoading] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Basics
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [sku, setSku] = useState('')
  const [nextSku, setNextSku] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')

  // Pricing
  const [price, setPrice] = useState<number | ''>('')
  const [compareAtPrice, setCompareAtPrice] = useState<number | ''>('')
  const [costPrice, setCostPrice] = useState<number | ''>('')

  // Classification
  const [categoryId, setCategoryId] = useState('')
  useEffect(() => {
    if (!categoryId && categories.length > 0) setCategoryId(categories[0].id)
  }, [categoryId, categories])
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])
  const [material, setMaterial] = useState('PLA')
  const [status, setStatus] = useState<'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('ACTIVE')
  const [isFeatured, setIsFeatured] = useState(false)
  const [isBestSeller, setIsBestSeller] = useState(false)

  // Inventory
  const [stock, setStock] = useState<number | ''>(0)
  const [lowStockThreshold, setLowStockThreshold] = useState<number | ''>(5)

  // Media
  const [imageUrl, setImageUrl] = useState('')

  // Options (renk, boyut…) and measurements
  const [variants, setVariants] = useState<VariantsValue>(EMPTY_VARIANTS)
  const [size, setSize] = useState<SizeValue>(EMPTY_SIZE)
  const hasOptions = variants.variants.length > 0

  // The SKU the product gets if the field stays empty (shown as the placeholder)
  useEffect(() => {
    if (!canFetch) return
    fetch('/api/admin/products/next-sku', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setNextSku(d.sku)
      })
      .catch(() => {})
  }, [canFetch, token])

  const handleNameChange = (val: string) => {
    setName(val)
    if (!slugTouched) setSlug(slugify(val))
  }

  const toggleCollection = (colSlug: string) => {
    setSelectedCollections((prev) => (prev.includes(colSlug) ? prev.filter((s) => s !== colSlug) : [...prev, colSlug]))
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
        toast.success('Görsel yüklendi.')
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
      toast.error('Ürün adı ve satış fiyatı zorunludur.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      if (!res.ok || !data.success) throw new Error(data.error || 'Ürün oluşturulamadı.')

      // Options and sizes are saved against the new product
      const productId = data.product?.id as string | undefined
      if (productId) {
        try {
          if (hasOptions) await saveVariants(productId, variants, token)
          const hasSize = size.lengthMm || size.widthMm || size.heightMm || size.weightGrams || size.specifications.length
          if (hasSize) await saveSize(productId, size, token)
        } catch (err) {
          toast.error(`Ürün eklendi ama ${(err as Error).message.toLocaleLowerCase('tr-TR')} Düzenleme sayfasından tekrar deneyin.`)
          router.push(`/admin/products/${productId}`)
          return
        }
      }

      toast.success(`'${name}' kataloğa eklendi.`)
      router.push('/admin/products')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ürün oluşturulurken bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  const margin =
    price !== '' && costPrice !== '' && Number(price) > 0
      ? Math.round(((Number(price) - Number(costPrice)) / Number(price)) * 100)
      : null

  return (
    <div className={styles.pageContainer} style={{ maxWidth: 1120 }}>
      <div className={styles.pageHeader}>
        <div>
          <Link href="/admin/products" className={form.back}>← Ürünler</Link>
          <h1 className={styles.pageTitle}>Yeni ürün</h1>
          <p className={styles.pageSubtitle}>Zorunlu alanlar: ad, fiyat ve kategori. Diğerlerini sonra da doldurabilirsiniz.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/admin/products" className={`${styles.btn} ${styles.btnSecondary}`}>İptal</Link>
          <button type="submit" form="new-product-form" disabled={loading} className={`${styles.btn} ${styles.btnPrimary}`}>
            {loading ? 'Kaydediliyor…' : 'Ürünü kaydet'}
          </button>
        </div>
      </div>

      <form id="new-product-form" onSubmit={handleSubmit} className={form.layout}>
        {/* ── Main column ─────────────────────────────── */}
        <div className={form.main}>
          <section className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Ürün bilgileri</h2>
            <div className={form.stack}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-name">Ürün adı *</label>
                <input
                  id="new-name"
                  required
                  placeholder="Örn: Zuulight Nova masa lambası"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={form.row2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="new-sku">Stok kodu (SKU)</label>
                  <input
                    id="new-sku"
                    placeholder={nextSku ? `Boş bırakılırsa: ${nextSku}` : 'Boş bırakılırsa otomatik atanır'}
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    className={`${styles.formInput} ${form.mono}`}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="new-slug">Bağlantı adresi</label>
                  <div className={form.prefixed}>
                    <span>/urun/</span>
                    <input
                      id="new-slug"
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true)
                        setSlug(slugify(e.target.value))
                      }}
                      placeholder="otomatik"
                      className={styles.formInput}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-short-desc">Kısa açıklama</label>
                <input
                  id="new-short-desc"
                  maxLength={200}
                  placeholder="Ürün adının altında görünen tek cümle"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  className={styles.formInput}
                />
                <span className={styles.formHelp}>{shortDescription.length}/200</span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-desc">Açıklama</label>
                <textarea
                  id="new-desc"
                  rows={6}
                  placeholder="Ölçüler, kullanım alanı, bakım…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={styles.formTextarea}
                />
              </div>
            </div>
          </section>

          <section className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Görsel</h2>
            <div className={form.media}>
              <button
                type="button"
                className={form.dropzone}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                aria-label="Görsel yükle"
              >
                {imageUrl ? (
                  <Image src={imageUrl} alt={name || 'Önizleme'} fill style={{ objectFit: 'cover' }} sizes="180px" />
                ) : (
                  <span>{uploadingImage ? 'Yükleniyor…' : 'Görsel seç'}</span>
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} hidden />
              <div className={form.stack}>
                <p className={styles.formHelp} style={{ margin: 0 }}>
                  Kare ya da 4:5 oranında, beyaz veya sade zeminli fotoğraflar kartlarda en iyi görünür.
                </p>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="new-img-url">veya görsel adresi</label>
                  <input
                    id="new-img-url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://…"
                    className={styles.formInput}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Seçenekler (renk, boyut…)</h2>
            <VariantsEditor value={variants} onChange={setVariants} productSku={sku || nextSku} />
          </section>

          <section className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Ölçüler ve detaylar</h2>
            <SizeEditor value={size} onChange={setSize} />
          </section>

          <section className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Fiyat</h2>
            <div className={form.row3}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-price">Satış fiyatı (₺, KDV dahil) *</label>
                <input
                  id="new-price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0,00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`${styles.formInput} ${form.num}`}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-compare-price">Üstü çizili fiyat</label>
                <input
                  id="new-compare-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="İndirim yoksa boş"
                  value={compareAtPrice}
                  onChange={(e) => setCompareAtPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`${styles.formInput} ${form.num}`}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-cost-price">Maliyet</label>
                <input
                  id="new-cost-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Sadece yönetimde görünür"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`${styles.formInput} ${form.num}`}
                />
                {margin !== null && <span className={styles.formHelp}>Kâr marjı: %{margin}</span>}
              </div>
            </div>
          </section>
        </div>

        {/* ── Side column ─────────────────────────────── */}
        <aside className={form.side}>
          <section className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Yayın</h2>
            <div className={form.stack}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-status">Durum</label>
                <select id="new-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={styles.formSelect}>
                  <option value="ACTIVE">Yayında</option>
                  <option value="DRAFT">Taslak (sitede görünmez)</option>
                  <option value="ARCHIVED">Arşiv</option>
                </select>
              </div>
              <label className={form.check}>
                <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
                <span>Öne çıkan ürün</span>
              </label>
              <label className={form.check}>
                <input type="checkbox" checked={isBestSeller} onChange={(e) => setIsBestSeller(e.target.checked)} />
                <span>Çok satan rozeti</span>
              </label>
            </div>
          </section>

          <section className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Sınıflandırma</h2>
            <div className={form.stack}>
              <CategoryPicker id="new-category" value={categoryId} onChange={setCategoryId} categories={categories} onCreated={addCategory} />
              <CollectionsPicker selected={selectedCollections} onToggle={toggleCollection} collections={collections} onCreated={addCollection} />
              <MaterialPicker id="new-material" value={material} onChange={setMaterial} />
            </div>
          </section>

          <section className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Stok</h2>
            {hasOptions && (
              <p className={styles.formHelp} style={{ margin: '0 0 10px' }}>
                Bu ürünün seçenekleri var; stok her kombinasyon için ayrı girilir ve toplamı ürün stoğu olur.
              </p>
            )}
            <div className={form.row2}>
              <div className={styles.formGroup} hidden={hasOptions}>
                <label className={styles.formLabel} htmlFor="new-stock">Başlangıç stoğu</label>
                <input
                  id="new-stock"
                  type="number"
                  min="0"
                  value={stock}
                  onChange={(e) => setStock(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`${styles.formInput} ${form.num}`}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-threshold">Az stok uyarısı</label>
                <input
                  id="new-threshold"
                  type="number"
                  min="1"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`${styles.formInput} ${form.num}`}
                />
              </div>
            </div>
          </section>
        </aside>
      </form>
    </div>
  )
}
