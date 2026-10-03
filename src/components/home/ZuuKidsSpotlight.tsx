'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import type { ProductListItem } from '@/types/catalog'
import styles from './ZuuKidsSpotlight.module.css'

interface Props {
  /** zuukids best seller from the live catalog; the section hides when there is none. */
  product: ProductListItem | null
  /** Products with variants are chosen on their own page, not added from here. */
  hasVariants?: boolean
}

export default function ZuuKidsSpotlight({ product, hasVariants = false }: Props) {
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
    <section className={styles.section} aria-label="zuukids öne çıkan ürün">
      <div className={styles.container}>
        <div className={styles.eyebrowLine}>
          <span className={styles.eyebrow}>zuukids</span>
          <span className={styles.specRef}>çocuk koleksiyonu</span>
        </div>

        <div className={styles.titleWrap}>
          <h2 className={styles.headline}>
            oyun ve keşif dolu<br />
            <span className={styles.headlineItalic}>üç boyutlu formlar.</span>
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
              <span className={styles.captionTag}>zuukids / en çok tercih edilen</span>
              <span className={styles.captionDesc}>{product.categoryName.toLowerCase()}</span>
            </div>
          </div>

          <div className={styles.narrativeCol}>
            <p className={styles.leadPara}>
              şekil eşleştirme, sıralama ve kesir oyunlarıyla el-göz koordinasyonunu ve problem
              çözmeyi destekleyen setler; her parça pürüzsüz yüzey ve yuvarlatılmış kenarlarla basılır.
            </p>

            <div className={styles.pillarsList}>
              <div className={styles.pillarItem}>
                <h4 className={styles.pillarTitle}>pla hammadde</h4>
                <p className={styles.pillarDesc}>bitki kaynaklı, kokusuz biyopolimer</p>
              </div>
              <div className={styles.pillarItem}>
                <h4 className={styles.pillarTitle}>öğreterek oyun</h4>
                <p className={styles.pillarDesc}>renk, şekil ve sayı kavramları</p>
              </div>
              <div className={styles.pillarItem}>
                <h4 className={styles.pillarTitle}>yuvarlatılmış kenarlar</h4>
                <p className={styles.pillarDesc}>çapaksız, elde rahat formlar</p>
              </div>
              <div className={styles.pillarItem}>
                <h4 className={styles.pillarTitle}>atölyeden kapınıza</h4>
                <p className={styles.pillarDesc}>özenli paketleme ile gönderim</p>
              </div>
            </div>

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
                <Link href="/koleksiyon/zuukids" className={styles.exploreLink}>
                  tüm zuukids koleksiyonu
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
