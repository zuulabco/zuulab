'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import type { ProductListItem } from '@/types/catalog'
import { SECTION_TEMPLATES, type SpotlightSettings } from '@/lib/cms/homepage'
import { isCloudinaryUrl, cloudinaryFeatureLoader } from '@/lib/images/cloudinary-loader'
import styles from './ZuuKidsSpotlight.module.css'

interface Props {
  /** Product to feature (picked in the homepage editor, or the collection's best seller) */
  product: ProductListItem | null
  /** Products with options are chosen on their own page, not added from here */
  hasVariants?: boolean
  /** Texts from the homepage editor (Vitrin → Ana sayfa → "Ürün vitrini") */
  settings?: SpotlightSettings
}

/**
 * One product, shown large: its photo on one side, a short story and the buy button
 * on the other, a few plain facts underneath.
 */
export default function ZuuKidsSpotlight({ product, hasVariants = false, settings }: Props) {
  const t = settings ?? SECTION_TEMPLATES.product_spotlight.defaults()
  const addItem = useCartStore((s) => s.addItem)
  const [added, setAdded] = useState(false)

  if (!product) return null

  const href = `/urun/${product.slug}`
  const canQuickAdd = product.inStock && !hasVariants
  const discount = product.oldPrice && product.oldPrice > product.price ? Math.round((1 - product.price / product.oldPrice) * 100) : 0

  const handleQuickAdd = () => {
    addItem({
      productId: product.id,
      variantId: null,
      name: product.name.toLowerCase(),
      variantLabel: null,
      price: product.price,
      imageUrl: product.primaryImage,
      slug: product.slug,
      sku: product.sku,
      maxStock: product.stockCount || 99,
      quantity: 1,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1600)
  }

  return (
    <section className={styles.section} aria-label={`${t.eyebrow}: öne çıkan ürün`}>
      <div className={styles.container}>
        <div className={styles.feature}>
          {/* Photo */}
          <Link href={href} className={styles.media} aria-label={product.name}>
            {product.primaryImage && (
              <Image
                src={product.primaryImage}
                alt={product.name}
                fill
                sizes="(max-width: 900px) 100vw, 50vw"
                loader={isCloudinaryUrl(product.primaryImage) ? cloudinaryFeatureLoader : undefined}
                className={styles.photo}
              />
            )}
            {discount > 0 && <span className={styles.saleTag}>%{discount} indirim</span>}
          </Link>

          {/* Story */}
          <div className={styles.body}>
            <span className={styles.eyebrow}>
              {t.eyebrow}
              {t.eyebrowNote && <span className={styles.eyebrowNote}>{t.eyebrowNote}</span>}
            </span>

            <h2 className={styles.headline}>
              {t.headline}
              {t.headlineAccent && <em>{t.headlineAccent}</em>}
            </h2>

            {t.lead && <p className={styles.lead}>{t.lead}</p>}

            <div className={styles.buyBox}>
              <div className={styles.buyInfo}>
                <Link href={href} className={styles.productName}>
                  {product.name.toLocaleLowerCase('tr-TR')}
                </Link>
                <span className={styles.prices}>
                  <span className={styles.price}>{formatPrice(product.price)}</span>
                  {discount > 0 && <span className={styles.oldPrice}>{formatPrice(product.oldPrice!)}</span>}
                </span>
              </div>
              <div className={styles.actions}>
                {canQuickAdd ? (
                  <button type="button" className={`btn btn-buy btn-lg ${added ? styles.added : ''}`} onClick={handleQuickAdd}>
                    {added ? 'sepete eklendi' : 'sepete ekle'}
                  </button>
                ) : (
                  <Link href={href} className="btn btn-primary btn-lg">
                    {product.inStock ? 'seçenekleri gör' : 'ürünü incele'}
                  </Link>
                )}
                {canQuickAdd && (
                  <Link href={href} className="btn btn-secondary btn-lg">
                    ürünü incele
                  </Link>
                )}
              </div>
            </div>

            {t.pillars.length > 0 && (
              <ul className={styles.facts}>
                {t.pillars.map((p, i) => (
                  <li key={i}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>
                      <strong>{p.title}</strong>
                      {p.desc && <small>{p.desc}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {t.linkLabel && t.linkHref && (
              <Link href={t.linkHref} className={styles.more}>
                {t.linkLabel} <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
