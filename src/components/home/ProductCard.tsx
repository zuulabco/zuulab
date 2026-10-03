'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice, calcDiscountPercent } from '@/lib/utils'
import type { ProductListItem } from '@/types/product'
import { useCartStore } from '@/store/cartStore'
import FavoriteButton from '../product/FavoriteButton'
import styles from './ProductCard.module.css'
import { cloudinaryCardLoader, isCloudinaryUrl } from '@/lib/images/cloudinary-loader'

interface Props {
  product: ProductListItem
  priority?: boolean
}

export default function ProductCard({ product, priority = false }: Props) {
  const [added, setAdded] = useState(false)
  const addItem = useCartStore((s) => s.addItem)

  const discount = product.discountPercent ?? (
    product.oldPrice ? calcDiscountPercent(product.price, product.oldPrice) : 0
  )

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!product.inStock) return

    addItem({
      productId: product.id,
      variantId: null,
      name: product.name.toLowerCase(),
      variantLabel: null,
      price: product.price,
      imageUrl: product.primaryImage,
      slug: product.slug,
      sku: product.sku ?? `ZUU-${product.id}`,
      maxStock: product.stockCount || 99,
      quantity: 1,
    })

    setAdded(true)
    setTimeout(() => setAdded(false), 1400)
  }

  const hasSecondaryImage = Boolean(product.secondaryImage)

  return (
    <article className={styles.card}>
      {/* ── Image & Interactive Media Layer ──────────────── */}
      <div className={styles.imageWrapper}>
        <Link
          href={`/urun/${product.slug}`}
          className={styles.imageLink}
          tabIndex={-1}
          aria-hidden="true"
        >
          {product.primaryImage ? (
            <>
              <Image
                src={product.primaryImage}
                alt={product.name}
                fill
                loader={isCloudinaryUrl(product.primaryImage) ? cloudinaryCardLoader : undefined}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className={`${styles.image} ${hasSecondaryImage ? styles.primaryWithHover : ''}`}
                priority={priority}
              />
              {product.secondaryImage && (
                <Image
                  src={product.secondaryImage}
                  alt={`${product.name} detay görünümü`}
                  fill
                  loader={isCloudinaryUrl(product.secondaryImage) ? cloudinaryCardLoader : undefined}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className={styles.secondaryImage}
                  loading="lazy"
                />
              )}
            </>
          ) : (
            <div className={styles.imagePh} aria-hidden="true">
              <ImageIcon />
            </div>
          )}
        </Link>

        {/* Minimal Editorial Badge */}
        <div className={styles.tagWrap}>
          {!product.inStock ? (
            <span className={`${styles.badge} ${styles.badgeStock}`}>tükendi</span>
          ) : discount > 0 ? (
            <span className={`${styles.badge} ${styles.badgeDiscount}`}>-%{discount}</span>
          ) : product.isNew ? (
            <span className={`${styles.badge} ${styles.badgeNew}`}>yeni</span>
          ) : product.categorySlug === 'zuukids' ? (
            <span className={`${styles.badge} ${styles.badgeWorld}`}>zuukids</span>
          ) : null}
        </div>

        {/* Favorite Action */}
        <div className={styles.favoriteWrap}>
          <FavoriteButton productId={product.id} />
        </div>

        {/* Quick Add Action (when in stock) */}
        {product.inStock && (
          <button
            type="button"
            className={`${styles.quickAddBtn} ${added ? styles.quickAddSuccess : ''}`}
            onClick={handleQuickAdd}
            aria-label={`${product.name} sepete ekle`}
          >
            {added ? (
              <>
                <CheckIcon />
                <span className={styles.quickAddLabel}>eklendi</span>
              </>
            ) : (
              <>
                <BagIcon />
                <span className={styles.quickAddLabel}>sepete ekle</span>
              </>
            )}
          </button>
        )}

        {/* Out of stock visual layer */}
        {!product.inStock && (
          <div className={styles.outOfStockOverlay} aria-hidden="true">
            <span className={styles.outOfStockText}>stok tükendi</span>
          </div>
        )}
      </div>

      {/* ── Metadata & Details ───────────────────────────── */}
      <div className={styles.info}>
        <div className={styles.metaRow}>
          <span className={styles.category}>{product.categoryName.toLowerCase()}</span>
          {product.avgRating !== null && product.reviewCount > 0 && (
            <span className={styles.rating} aria-label={`Puan: ${product.avgRating.toFixed(1)}`}>
              <StarIcon />
              {product.avgRating.toFixed(1)}
            </span>
          )}
        </div>

        <h3 className={styles.name}>
          <Link href={`/urun/${product.slug}`} className={styles.nameLink}>
            {product.name.toLowerCase()}
          </Link>
        </h3>

        <div className={styles.priceRow}>
          <span className={styles.price}>{formatPrice(product.price)}</span>
          {product.oldPrice && (
            <span className={styles.oldPrice}>{formatPrice(product.oldPrice)}</span>
          )}
        </div>
      </div>
    </article>
  )
}

function ImageIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function BagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
