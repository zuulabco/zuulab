'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CatalogProduct } from '@/types/catalog'
import { formatPrice, calcDiscountPercent } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import { toast } from '@/store/toastStore'
import { FREE_SHIPPING_THRESHOLD } from '@/lib/services/shipping.service'
import FavoriteButton from './FavoriteButton'
import styles from './ProductDetails.module.css'

interface Props {
  product: CatalogProduct
}

type AccordionKey = 'about' | 'material' | 'specs' | 'shipping'

export default function ProductDetailsClient({ product }: Props) {
  const router = useRouter()
  const addItem = useCartStore((s) => s.addItem)

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants && product.variants.length > 0 ? product.variants[0].id : null
  )
  const [quantity, setQuantity] = useState<number>(1)
  const [addedAnimation, setAddedAnimation] = useState<boolean>(false)

  // Accordion state (first one open by default)
  const [openAccordions, setOpenAccordions] = useState<Record<AccordionKey, boolean>>({
    about: true,
    material: false,
    specs: false,
    shipping: false,
  })

  const toggleAccordion = (key: AccordionKey) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const selectedVariant = product.variants?.find((v) => v.id === selectedVariantId)
  const currentPrice = selectedVariant?.price ?? product.price
  const currentStock = selectedVariant?.stock ?? product.stock
  const currentSku = selectedVariant?.sku ?? product.sku

  const discountPercent = product.oldPrice
    ? calcDiscountPercent(currentPrice, product.oldPrice)
    : null

  const collectionName =
    (product.collections && product.collections[0]) ||
    (product.collectionWorld && product.collectionWorld !== 'general' ? product.collectionWorld : null) ||
    'zuulab'

  const handleAddToCart = () => {
    if (currentStock <= 0) return

    addItem(
      {
        productId: product.id,
        variantId: selectedVariantId,
        name: product.name,
        variantLabel: selectedVariant ? `${selectedVariant.name}: ${selectedVariant.value}` : null,
        price: currentPrice,
        imageUrl: product.images[0]?.url || null,
        slug: product.slug,
        sku: currentSku,
        maxStock: currentStock,
      },
      quantity
    )

    setAddedAnimation(true)
    setTimeout(() => setAddedAnimation(false), 1600)
    toast.success('ürün sepete eklendi')
  }

  const handleBuyNow = () => {
    handleAddToCart()
    router.push('/sepet')
  }

  return (
    <div className={styles.container}>
      {/* ── 1. COLLECTION · CATEGORY Metadata ────────────── */}
      <div className={styles.topMeta}>
        <div className={styles.collectionCategoryBadge}>
          <span className={styles.collectionPart}>{collectionName.toUpperCase()}</span>
          <span className={styles.metaDivider}>·</span>
          <Link href={`/kategori/${product.categorySlug}`} className={styles.categoryPart}>
            {product.categoryName.toUpperCase()}
          </Link>
        </div>
        {product.isNew && <span className={styles.newBadge}>yeni</span>}
      </div>

      {/* ── 2. Product Title ─────────────────────────────── */}
      <h1 className={styles.title}>{product.name.toLowerCase()}</h1>

      {/* ── 3. Short Description ─────────────────────────── */}
      <p className={styles.shortDesc}>{product.shortDescription}</p>

      {/* ── 4. Rating & SKU Row ──────────────────────────── */}
      <div className={styles.ratingRow}>
        {/* Rating comes from approved reviews only; none yet means no score. */}
        {product.reviewCount > 0 ? (
          <>
            <div className={styles.stars} aria-label={`Puan: ${product.rating.toFixed(1)} / 5`}>
              <StarIcon />
              <span className={styles.ratingScore}>{product.rating.toFixed(1)}</span>
            </div>
            <span className={styles.dot} aria-hidden="true">•</span>
            <a href="#reviews" className={styles.reviewCount}>
              {product.reviewCount} değerlendirme
            </a>
          </>
        ) : (
          <a href="#reviews" className={styles.reviewCount}>
            henüz değerlendirme yok
          </a>
        )}
        <span className={styles.dot} aria-hidden="true">•</span>
        <span className={styles.skuText}>sku: {currentSku}</span>
      </div>

      {/* ── 5. Price Area ─────────────────────────────────── */}
      <div className={styles.priceRow}>
        <span className={styles.currentPrice}>{formatPrice(currentPrice)}</span>
        {product.oldPrice && (
          <span className={styles.oldPrice}>{formatPrice(product.oldPrice)}</span>
        )}
        {discountPercent && (
          <span className={styles.discountBadge}>-%{discountPercent} indirim</span>
        )}
      </div>

      {/* ── 6. Minimal Stock Status ───────────────────────── */}
      <div className={styles.stockStatus}>
        {currentStock > 5 ? (
          <span className={styles.inStock}>
            <span className={styles.statusDot} />
            stokta hazır ({currentStock} adet)
          </span>
        ) : currentStock > 0 ? (
          <span className={styles.lowStock}>
            <span className={styles.statusDot} />
            son {currentStock} ürün (tükenmek üzere)
          </span>
        ) : (
          <span className={styles.outOfStock}>
            <span className={styles.statusDot} />
            stok tükendi
          </span>
        )}
      </div>

      {/* ── 7. Variants (if any) ─────────────────────────── */}
      {product.variants && product.variants.length > 0 && (
        <div className={styles.variantSection}>
          <label className={styles.variantLabel}>
            {product.variants[0].name.toLowerCase()} seçimi:
            <span className={styles.selectedVariantValue}>
              {selectedVariant?.value}
            </span>
          </label>
          <div className={styles.variantOptions}>
            {product.variants.map((v) => {
              const isSelected = v.id === selectedVariantId
              return (
                <button
                  key={v.id}
                  type="button"
                  className={`${styles.variantBtn} ${isSelected ? styles.variantBtnActive : ''} ${
                    v.stock <= 0 ? styles.variantBtnDisabled : ''
                  }`}
                  onClick={() => setSelectedVariantId(v.id)}
                  disabled={v.stock <= 0}
                  aria-pressed={isSelected}
                >
                  <span>{v.value}</span>
                  {v.price && v.price !== product.price && (
                    <span className={styles.variantPriceDiff}>
                      ({formatPrice(v.price)})
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 8. Quantity & Purchase Actions Row ───────────── */}
      <div className={styles.actionRow}>
        <div className={styles.quantityBox} role="group" aria-label="Adet seçimi">
          <button
            type="button"
            className={styles.qtyBtn}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1 || currentStock <= 0}
            aria-label="Adeti azalt"
          >
            −
          </button>
          <span className={styles.qtyValue} aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            className={styles.qtyBtn}
            onClick={() => setQuantity((q) => Math.min(currentStock, q + 1))}
            disabled={quantity >= currentStock || currentStock <= 0}
            aria-label="Adeti arttır"
          >
            +
          </button>
        </div>

        <button
          type="button"
          className={`${styles.addToCartBtn} ${addedAnimation ? styles.added : ''}`}
          onClick={handleAddToCart}
          disabled={currentStock <= 0}
        >
          {addedAnimation ? (
            <>
              <CheckIcon />
              <span>sepete eklendi</span>
            </>
          ) : (
            <>
              <BagIcon />
              <span>{currentStock > 0 ? 'sepete ekle' : 'tükendi'}</span>
            </>
          )}
        </button>

        <div className={styles.favoriteContainer}>
          <FavoriteButton productId={product.id} />
        </div>
      </div>

      {currentStock > 0 && (
        <button
          type="button"
          className={styles.buyNowBtn}
          onClick={handleBuyNow}
        >
          hemen satın al
        </button>
      )}

      {/* ── 9. Delivery & Craftsmanship Summary ────────── */}
      <div className={styles.deliveryCraftSummary} role="region" aria-label="Teslimat ve Üretim Özeti">
        <div className={styles.summaryItem}>
          <span className={styles.summaryIcon} aria-hidden="true"><TruckIcon /></span>
          <div className={styles.summaryText}>
            <span className={styles.summaryTitle}>hızlı kargo</span>
            <span className={styles.summaryDesc}>
              {FREE_SHIPPING_THRESHOLD} ₺ üzeri ücretsiz · 1–3 iş gününde teslimat
            </span>
          </div>
        </div>

        <div className={styles.summaryItem}>
          <span className={styles.summaryIcon} aria-hidden="true"><SparkleIcon /></span>
          <div className={styles.summaryText}>
            <span className={styles.summaryTitle}>3d hassas üretim</span>
            <span className={styles.summaryDesc}>
              0.12mm katman hassasiyeti · ZUULAB atölyesinde üretim ({product.productionTime})
            </span>
          </div>
        </div>

        <div className={styles.summaryItem}>
          <span className={styles.summaryIcon} aria-hidden="true"><ShieldIcon /></span>
          <div className={styles.summaryText}>
            <span className={styles.summaryTitle}>14 gün iade</span>
            <span className={styles.summaryDesc}>
              koşulsuz iade & değişim güvencesi
            </span>
          </div>
        </div>
      </div>

      {/* ── 10. Editorial Accordion Disclosures ──────────── */}
      <div className={styles.accordionSection} role="region" aria-label="Ürün Detayları ve Özellikleri">
        {/* Accordion 1: Ürün hakkında */}
        <div className={styles.accordionItem}>
          <button
            type="button"
            id="acc-btn-about"
            className={styles.accordionHeader}
            onClick={() => toggleAccordion('about')}
            aria-expanded={openAccordions.about}
            aria-controls="acc-body-about"
          >
            <span>ürün hakkında</span>
            <ChevronIcon open={openAccordions.about} />
          </button>
          {openAccordions.about && (
            <div
              id="acc-body-about"
              role="region"
              aria-labelledby="acc-btn-about"
              className={styles.accordionBody}
            >
              <p className={styles.descParagraph}>{product.description}</p>
              <h4 className={styles.subHeading}>zuulab kalite standartları</h4>
              <ul className={styles.featureList}>
                <li>Her model baskı sonrası mekanik yüzey temizleme ve el kontrolünden geçer.</li>
                <li>Geri dönüştürülebilir koruyucu ambalaj ile darbelere dayanıklı paketleme.</li>
                <li>Katman katman hassas üretim tekniğiyle üretilir; her parça tekil mikrodokular barındırır.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Accordion 2: Malzeme ve üretim */}
        <div className={styles.accordionItem}>
          <button
            type="button"
            id="acc-btn-material"
            className={styles.accordionHeader}
            onClick={() => toggleAccordion('material')}
            aria-expanded={openAccordions.material}
            aria-controls="acc-body-material"
          >
            <span>malzeme ve üretim</span>
            <ChevronIcon open={openAccordions.material} />
          </button>
          {openAccordions.material && (
            <div
              id="acc-body-material"
              role="region"
              aria-labelledby="acc-btn-material"
              className={styles.accordionBody}
            >
              <p className={styles.descParagraph}>
                ZUULAB objeleri siparişiniz üzerine atölyemizde 0.12mm hassasiyetli FDM teknolojisiyle katman katman üretilir.
              </p>
              <ul className={styles.featureList}>
                <li><strong>malzeme:</strong> {product.material} (biyo-bozunur çevre dostu PLA / PETG filament)</li>
                <li><strong>üretim süresi:</strong> {product.productionTime}</li>
                <li><strong>ısı dayanımı:</strong> Maksimum 55°C. Direkt güneş ışığı veya yüksek ısı kaynaklarından korunmalıdır.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Accordion 3: Ölçüler ve detaylar */}
        <div className={styles.accordionItem}>
          <button
            type="button"
            id="acc-btn-specs"
            className={styles.accordionHeader}
            onClick={() => toggleAccordion('specs')}
            aria-expanded={openAccordions.specs}
            aria-controls="acc-body-specs"
          >
            <span>ölçüler ve detaylar</span>
            <ChevronIcon open={openAccordions.specs} />
          </button>
          {openAccordions.specs && (
            <div
              id="acc-body-specs"
              role="region"
              aria-labelledby="acc-btn-specs"
              className={styles.accordionBody}
            >
              <table className={styles.specsTable}>
                <tbody>
                  <tr>
                    <td>ağırlık</td>
                    <td>{product.weight} gram</td>
                  </tr>
                  <tr>
                    <td>malzeme</td>
                    <td>{product.material}</td>
                  </tr>
                  {product.specifications.map((s, idx) => (
                    <tr key={idx}>
                      <td>{s.name.toLowerCase()}</td>
                      <td>{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Accordion 4: Kargo ve teslimat */}
        <div className={styles.accordionItem}>
          <button
            type="button"
            id="acc-btn-shipping"
            className={styles.accordionHeader}
            onClick={() => toggleAccordion('shipping')}
            aria-expanded={openAccordions.shipping}
            aria-controls="acc-body-shipping"
          >
            <span>kargo ve teslimat</span>
            <ChevronIcon open={openAccordions.shipping} />
          </button>
          {openAccordions.shipping && (
            <div
              id="acc-body-shipping"
              role="region"
              aria-labelledby="acc-btn-shipping"
              className={styles.accordionBody}
            >
              <p className={styles.descParagraph}>
                Siparişiniz atölye üretim kontrolünün ardından özenle paketlenir ve anlaşmalı kargo firmalarına teslim edilir.
              </p>
              <ul className={styles.featureList}>
                <li><strong>teslimat süresi:</strong> Türkiye geneline 1-3 iş günü içinde teslimat.</li>
                <li><strong>kargo ücreti:</strong> {FREE_SHIPPING_THRESHOLD} ₺ üzeri siparişlerde kargo ücretsizdir.</li>
                <li><strong>iade & değişim:</strong> Teslim aldığınız tarihten itibaren 14 gün içinde koşulsuz iade ve değişim güvencesi.</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky Mobile Purchase Bar ───────────────────── */}
      <div className={styles.mobileStickyBar} role="region" aria-label="Hızlı Satın Alma">
        <div className={styles.stickyPriceInfo}>
          <span className={styles.stickyPrice}>{formatPrice(currentPrice)}</span>
          <span className={styles.stickyStock}>
            {currentStock > 0 ? `stokta (${currentStock})` : 'tükendi'}
          </span>
        </div>
        <button
          type="button"
          className={`${styles.stickyAddBtn} ${addedAnimation ? styles.stickyAddSuccess : ''}`}
          onClick={handleAddToCart}
          disabled={currentStock <= 0}
          aria-label={currentStock > 0 ? `${product.name} sepete ekle` : 'stok tükendi'}
        >
          {addedAnimation ? 'eklendi ✓' : currentStock > 0 ? 'sepete ekle' : 'tükendi'}
        </button>
      </div>
    </div>
  )
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function BagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform var(--dur-fast) var(--ease-default)',
      }}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function LeafIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
