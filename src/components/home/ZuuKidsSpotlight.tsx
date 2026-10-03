'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import type { ProductListItem } from '@/types/catalog'
import { SECTION_TEMPLATES, type SpotlightSettings } from '@/lib/cms/homepage'
import styles from './ZuuKidsSpotlight.module.css'

interface Props {
  /** zuukids best seller from the live catalog; the section hides when there is none. */
  product: ProductListItem | null
  /** Products with variants are chosen on their own page, not added from here. */
  hasVariants?: boolean
  /** Texts from the homepage editor; zuukids defaults when missing */
  settings?: SpotlightSettings
}

export default function ZuuKidsSpotlight({ product, hasVariants = false, settings }: Props) {
  const t = settings ?? SECTION_TEMPLATES.product_spotlight.defaults()
  const addItem = useCartStore((s) => s.addItem)
  const [added, setAdded] = useState(false)

  if (!product) return null

  const href = `/urun/${product.slug}`
  const canQuickAdd = product.inStock && !hasVariants

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
    <section className={styles.section} aria-label={`${t.eyebrow} öne çıkan ürün`}>
      <div className={styles.container}>
        <div className={styles.eyebrowLine}>
          <span className={styles.eyebrow}>{t.eyebrow}</span>
          {t.eyebrowNote && <span className={styles.specRef}>{t.eyebrowNote}</span>}
        </div>

        <div className={styles.titleWrap}>
          <h2 className={styles.headline}>
            {t.headline}
            {t.headlineAccent && (
              <>
                <br />
                <span className={styles.headlineItalic}>{t.headlineAccent}</span>
              </>
            )}
          </h2>
        </div>

        <div className={styles.spreadGrid}>
          <div className={styles.visualCol}>
            <div className={`${styles.imageFrame} ${styles.productFrame}`}>
              <Link href={href} className={styles.imageLink}>
                {product.primaryImage && (
                  <Image
                    src={product.primaryImage}
                    alt={product.name}
                    fill
                    sizes="(max-width: 960px) 100vw, 58vw"
                    className={`${styles.campaignImg} ${styles.productImg}`}
                  />
                )}
              </Link>
            </div>
            <div className={styles.imageCaption}>
              <span className={styles.captionTag}>{t.eyebrow} / öne çıkan</span>
              <span className={styles.captionDesc}>{product.categoryName.toLowerCase()}</span>
            </div>
          </div>

          <div className={styles.narrativeCol}>
            {t.lead && <p className={styles.leadPara}>{t.lead}</p>}

            {t.pillars.length > 0 && (
              <div className={styles.pillarsList}>
                {t.pillars.map((p, i) => (
                  <div key={i} className={styles.pillarItem}>
                    <h4 className={styles.pillarTitle}>{p.title}</h4>
                    <p className={styles.pillarDesc}>{p.desc}</p>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.productSnippet}>
              <div className={styles.snippetTop}>
                <div>
                  <span className={styles.productLabel}>öne çıkan ürün</span>
                  <h3 className={styles.productName}>
                    <Link href={href}>{product.name.toLowerCase()}</Link>
                  </h3>
                </div>
                <div className={styles.priceGroup}>
                  <span className={styles.price}>{formatPrice(product.price)}</span>
                  {product.oldPrice && product.oldPrice > product.price && (
                    <span className={styles.oldPrice}>{formatPrice(product.oldPrice)}</span>
                  )}
                </div>
              </div>

              <div className={styles.actions}>
                {canQuickAdd ? (
                  <button
                    type="button"
                    className={`btn btn-buy ${added ? styles.addSuccess : ''}`}
                    onClick={handleQuickAdd}
                  >
                    {added ? 'sepete eklendi' : 'sepete ekle'}
                  </button>
                ) : (
                  <Link href={href} className="btn btn-primary">
                    {product.inStock ? 'seçenekleri gör' : 'ürünü incele'}
                  </Link>
                )}
                {t.linkLabel && t.linkHref && (
                  <Link href={t.linkHref} className={styles.exploreLink}>
                    {t.linkLabel}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
