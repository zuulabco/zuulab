'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CatalogProduct } from '@/types/catalog'
import { formatPrice, calcDiscountPercent } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import { toast } from '@/store/toastStore'
import { useShippingConfig } from '@/hooks/useShippingConfig'
import { trackEvent } from '@/lib/marketing/client'
import FavoriteButton from './FavoriteButton'
import StockAlertForm from './StockAlertForm'
import { isLight, presetFor, swatchBackground } from '@/lib/catalog/colors'
import styles from './ProductDetails.module.css'

interface Props {
  product: CatalogProduct
}

type AccordionKey = 'about' | 'material' | 'specs' | 'shipping'

/** Colour options show swatches; older products named their colour option "Renk" */
function isColorOption(option: { name: string; type?: string }): boolean {
  return option.type === 'color' || (!option.type && option.name.toLocaleLowerCase('tr-TR') === 'renk')
}

export default function ProductDetailsClient({ product }: Props) {
  const router = useRouter()
  const addItem = useCartStore((s) => s.addItem)
  const { freeShippingThreshold: FREE_SHIPPING_THRESHOLD } = useShippingConfig()

  // product_view (GA4 view_item feeds "en çok ilgi gören ürünler" in Analizler)
  useEffect(() => {
    trackEvent('product_view', { productId: product.id, sku: product.sku, productName: product.name, price: product.price, category: product.categoryName })
  }, [product.id, product.sku, product.name, product.price, product.categoryName])

  // Options (Renk, Boyut…). Older products have single-option variants without the
  // option map; those are read as one option named after the variant.
  const variants = product.variants ?? []
  const optionsOf = (v: (typeof variants)[number]): Record<string, string> => v.options ?? { [v.name]: v.value }
  const variantOptions =
    // Options are only offered while at least one combination is on sale
    product.variantOptions && product.variantOptions.length > 0 && variants.length > 0
      ? product.variantOptions
      : variants.length > 0
        ? [{ name: variants[0].name, values: [...new Set(variants.map((v) => v.value))] }]
        : []
  const firstPick = variants.find((v) => v.stock > 0) ?? variants[0]
  const [selection, setSelection] = useState<Record<string, string>>(firstPick ? optionsOf(firstPick) : {})
  const matches = (v: (typeof variants)[number], sel: Record<string, string>) =>
    variantOptions.every((o) => optionsOf(v)[o.name] === sel[o.name])
  const selectedVariantId = variants.find((v) => matches(v, selection))?.id ?? null

  const choose = (optionName: string, value: string) => {
    const next = { ...selection, [optionName]: value }
    // Keep a valid combination: if this pairing does not exist, take the first one that does
    const exact = variants.find((v) => matches(v, next))
    const fallback = exact ?? variants.find((v) => optionsOf(v)[optionName] === value)
    const resolved = fallback ? optionsOf(fallback) : next
    setSelection(resolved)
    const picked = variants.find((v) => matches(v, resolved))
    if (picked?.imageUrl) {
      window.dispatchEvent(new CustomEvent('zuu:show-product-image', { detail: { url: picked.imageUrl } }))
    }
  }
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
        variantLabel: selectedVariant
          ? Object.entries(optionsOf(selectedVariant))
              .map(([k, val]) => `${k}: ${val}`)
              .join(' · ')
          : null,
        imageUrl: selectedVariant?.imageUrl || product.images[0]?.url || null,
        price: currentPrice,
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
    // Going to the cart page anyway: no drawer on top of it
    useCartStore.getState().closeDrawer()
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
      <h1 className={styles.title}>{product.name.toLocaleLowerCase('tr-TR')}</h1>

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

      {/* ── 6. Stock status (no counts shown to shoppers) ─── */}
      <div className={styles.stockStatus}>
        {currentStock > 0 ? (
          <span className={styles.inStock}>
            <span className={styles.statusDot} />
            stokta
          </span>
        ) : (
          <span className={styles.outOfStock}>
            <span className={styles.statusDot} />
            stokta değil
          </span>
        )}
      </div>

      {/* ── 7. Options: one row of choices per option ─────── */}
      {variantOptions.map((option) => (
        <div key={option.name} className={styles.variantSection}>
          <span className={styles.variantLabel} id={`opt-${option.name}`}>
            {option.name.toLocaleLowerCase('tr-TR')}:
            <span className={styles.selectedVariantValue}>{selection[option.name]}</span>
          </span>
          <div className={styles.variantOptions} role="radiogroup" aria-labelledby={`opt-${option.name}`}>
            {option.values.map((value) => {
              const candidate = variants.find((v) => matches(v, { ...selection, [option.name]: value }))
              const anyWithValue = variants.filter((v) => optionsOf(v)[option.name] === value)
              if (anyWithValue.length === 0) return null
              const soldOut = candidate ? candidate.stock <= 0 : anyWithValue.every((v) => v.stock <= 0)
              const isSelected = selection[option.name] === value
              if (isColorOption(option)) {
                const colors = option.swatches?.[value] ?? [presetFor(value) ?? '#bdbdbd']
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    title={soldOut ? `${value} — stokta değil` : value}
                    className={`${styles.swatchBtn} ${isSelected ? styles.swatchBtnActive : ''} ${soldOut ? styles.swatchSoldOut : ''}`}
                    onClick={() => choose(option.name, value)}
                    aria-label={soldOut ? `${value} (stokta değil)` : value}
                  >
                    <span
                      className={`${styles.swatchDot} ${colors.length === 1 && isLight(colors[0]) ? styles.swatchDotLight : ''}`}
                      style={{ background: swatchBackground(colors) }}
                    />
                  </button>
                )
              }
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`${styles.variantBtn} ${isSelected ? styles.variantBtnActive : ''} ${soldOut ? styles.variantBtnDisabled : ''}`}
                  onClick={() => choose(option.name, value)}
                  aria-label={soldOut ? `${value} (stokta değil)` : value}
                >
                  <span>{value}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* ── 8. Quantity & Purchase Actions Row ───────────── */}
      {currentStock > 0 ? (
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
      ) : (
        <div className={styles.actionRow}>
          <StockAlertForm productId={product.id} variantId={selectedVariantId} />
          <div className={styles.favoriteContainer}>
            <FavoriteButton productId={product.id} />
          </div>
        </div>
      )}

      {currentStock > 0 && (
        <button
          type="button"
          className={styles.buyNowBtn}
          onClick={handleBuyNow}
        >
          hemen satın al
        </button>
      )}

      {/* ── 9. Delivery & craftsmanship ─────────────────── */}
      <ul className={styles.assurances} aria-label="Teslimat, üretim ve iade">
        <li className={styles.assurance}>
          <span className={styles.assuranceIcon} aria-hidden="true"><TruckIcon /></span>
          <span className={styles.assuranceTitle}>hızlı kargo</span>
          <span className={styles.assuranceDesc}>
            {FREE_SHIPPING_THRESHOLD > 0 ? `${FREE_SHIPPING_THRESHOLD} ₺ üzeri ücretsiz` : 'ücretsiz kargo'}
          </span>
        </li>
        <li className={styles.assurance}>
          <span className={styles.assuranceIcon} aria-hidden="true"><LayersIcon /></span>
          <span className={styles.assuranceTitle}>3d hassas üretim</span>
          <span className={styles.assuranceDesc}>
            {product.productionTime ? `atölyede, ${product.productionTime}` : 'zuulab atölyesinde'}
          </span>
        </li>
        <li className={styles.assurance}>
          <span className={styles.assuranceIcon} aria-hidden="true"><ReturnIcon /></span>
          <span className={styles.assuranceTitle}>14 gün iade</span>
          <span className={styles.assuranceDesc}>kolay iade ve değişim</span>
        </li>
      </ul>

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
          <div
            id="acc-body-about"
            role="region"
            aria-labelledby="acc-btn-about"
            className={`${styles.accordionPanel} ${openAccordions.about ? styles.accordionPanelOpen : ''}`}
            inert={!openAccordions.about}
          >
            <div className={styles.accordionPanelInner}>
              <div className={styles.accordionBody}>
                <p className={styles.descParagraph}>{product.description}</p>
                <h4 className={styles.subHeading}>zuulab kalite standartları</h4>
                <ul className={styles.featureList}>
                  <li>Her model baskı sonrası mekanik yüzey temizleme ve el kontrolünden geçer.</li>
                  <li>Geri dönüştürülebilir koruyucu ambalaj ile darbelere dayanıklı paketleme.</li>
                  <li>Katman katman 3d baskıyla üretilir; her parçanın yüzeyinde ince katman izleri görülebilir.</li>
                </ul>
              </div>
            </div>
          </div>
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
          <div
            id="acc-body-material"
            role="region"
            aria-labelledby="acc-btn-material"
            className={`${styles.accordionPanel} ${openAccordions.material ? styles.accordionPanelOpen : ''}`}
            inert={!openAccordions.material}
          >
            <div className={styles.accordionPanelInner}>
              <div className={styles.accordionBody}>
              <p className={styles.descParagraph}>
                  zuulab objeleri atölyemizde 3d baskıyla, katman katman üretilir.
                </p>
                <ul className={styles.featureList}>
                  {product.material && (
                  <li>
                    <strong>malzeme:</strong> {product.material}
                    {product.materialInfo?.description ? ` — ${product.materialInfo.description}` : ''}
                  </li>
                )}
                  {product.productionTime && <li><strong>üretim süresi:</strong> {product.productionTime}</li>}
                {product.materialInfo?.care && (
                  <li>
                    <strong>kullanım:</strong> {product.materialInfo.care}
                  </li>
                )}
                </ul>
              </div>
            </div>
          </div>
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
          <div
            id="acc-body-specs"
            role="region"
            aria-labelledby="acc-btn-specs"
            className={`${styles.accordionPanel} ${openAccordions.specs ? styles.accordionPanelOpen : ''}`}
            inert={!openAccordions.specs}
          >
            <div className={styles.accordionPanelInner}>
              <div className={styles.accordionBody}>
                <table className={styles.specsTable}>
                  <tbody>
                  {product.dimensions && (
                      <tr>
                        <td>boyut</td>
                        <td>
                          {[product.dimensions.lengthMm, product.dimensions.widthMm, product.dimensions.heightMm]
                            .map((n) => (n ? `${n}` : '—'))
                            .join(' × ')}{' '}
                          mm <span className={styles.specHint}>(u × g × y)</span>
                        </td>
                      </tr>
                    )}
                    {product.weight > 0 && (
                      <tr>
                        <td>ağırlık</td>
                        <td>{product.weight} gram</td>
                      </tr>
                    )}
                    {product.material && (
                      <tr>
                        <td>malzeme</td>
                        <td>{product.material}</td>
                      </tr>
                    )}
                    {product.specifications.map((s, idx) => (
                      <tr key={idx}>
                        <td>{s.name.toLocaleLowerCase('tr-TR')}</td>
                        <td>{s.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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
          <div
            id="acc-body-shipping"
            role="region"
            aria-labelledby="acc-btn-shipping"
            className={`${styles.accordionPanel} ${openAccordions.shipping ? styles.accordionPanelOpen : ''}`}
            inert={!openAccordions.shipping}
          >
            <div className={styles.accordionPanelInner}>
              <div className={styles.accordionBody}>
                <p className={styles.descParagraph}>
                  Siparişiniz atölye üretim kontrolünün ardından özenle paketlenir ve anlaşmalı kargo firmalarına teslim edilir.
                </p>
                <ul className={styles.featureList}>
                  <li><strong>teslimat süresi:</strong> Türkiye geneline 1-3 iş günü içinde teslimat.</li>
                  <li><strong>kargo ücreti:</strong> {FREE_SHIPPING_THRESHOLD > 0 ? `${FREE_SHIPPING_THRESHOLD} ₺ üzeri siparişlerde kargo ücretsizdir.` : 'Tüm siparişlerde kargo ücretsizdir.'}</li>
                  <li><strong>iade & değişim:</strong> Teslim aldığınız tarihten itibaren 14 gün içinde koşulsuz iade ve değişim güvencesi.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky Mobile Purchase Bar ───────────────────── */}
      <div className={styles.mobileStickyBar} role="region" aria-label="Hızlı Satın Alma">
        <div className={styles.stickyPriceInfo}>
          <span className={styles.stickyPrice}>{formatPrice(currentPrice)}</span>
          <span className={styles.stickyStock}>
            {currentStock > 0 ? 'stokta' : 'stokta değil'}
          </span>
        </div>
        {currentStock > 0 ? (
          <button
            type="button"
            className={`${styles.stickyAddBtn} ${addedAnimation ? styles.stickyAddSuccess : ''}`}
            onClick={handleAddToCart}
            aria-label={`${product.name} sepete ekle`}
          >
            {addedAnimation ? 'eklendi ✓' : 'sepete ekle'}
          </button>
        ) : (
          <a href="#stock-alert" className={styles.stickyNotifyBtn}>
            gelince haber ver
          </a>
        )}
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
        transition: 'transform var(--dur-slow) var(--ease-default)',
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


function LayersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

function ReturnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  )
}


