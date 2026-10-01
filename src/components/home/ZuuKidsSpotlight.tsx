'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import styles from './ZuuKidsSpotlight.module.css'

export default function ZuuKidsSpotlight() {
  const addItem = useCartStore((s) => s.addItem)
  const [added, setAdded] = useState(false)

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    addItem({
      productId: 'prod-zk1',
      variantId: null,
      name: 'mini dinozor serisi (6 figür set)',
      variantLabel: null,
      price: 279.0,
      imageUrl: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1200&q=85',
      slug: 'mini-dinozor-serisi-set',
      sku: 'ZUU-KD-001',
      maxStock: 48,
      quantity: 1,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1600)
  }

  return (
    <section className={styles.section} aria-label="zuukids kampanya alanı">
      <div className={styles.container}>
        {/* Editorial Eyebrow */}
        <div className={styles.eyebrowLine}>
          <span className={styles.eyebrow}>zuukids kampanya serisi</span>
          <span className={styles.specRef}>çocuk güvenli pla</span>
        </div>

        {/* Large Editorial Campaign Title */}
        <div className={styles.titleWrap}>
          <h2 className={styles.headline}>
            oyun ve keşif dolu<br />
            <span className={styles.headlineItalic}>üç boyutlu formlar.</span>
          </h2>
        </div>

        {/* Asymmetric Campaign Spread */}
        <div className={styles.spreadGrid}>
          {/* Left: Dominant Campaign Visual */}
          <div className={styles.visualCol}>
            <div className={styles.imageFrame}>
              <Link href="/urun/mini-dinozor-serisi-set" className={styles.imageLink}>
                <Image
                  src="https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1200&q=85"
                  alt="zuukids mini dinozor serisi çocuk odasında"
                  fill
                  sizes="(max-width: 960px) 100vw, 58vw"
                  className={styles.campaignImg}
                />
              </Link>
            </div>
            <div className={styles.imageCaption}>
              <span className={styles.captionTag}>zuukids / imza ürün</span>
              <span className={styles.captionDesc}>mini dinozor serisi · 6 figür seti</span>
            </div>
          </div>

          {/* Right: Editorial Narrative & Product Details */}
          <div className={styles.narrativeCol}>
            <p className={styles.leadPara}>
              çocukların hayal gücünü ve dokunsal algısını destekleyen; keskin kenar içermeyen, 
              %100 gıda uyumlu sertifikalı biyo-pla polimerden üretilen figürler ve montessori araçları.
            </p>

            {/* Clean Typographic Pillars (Zero Emojis) */}
            <div className={styles.pillarsList}>
              <div className={styles.pillarItem}>
                <h4 className={styles.pillarTitle}>%100 biyo-pla hammadde</h4>
                <p className={styles.pillarDesc}>bpa, fitalat ve ağır metal içermez</p>
              </div>
              <div className={styles.pillarItem}>
                <h4 className={styles.pillarTitle}>montessori uyumu</h4>
                <p className={styles.pillarDesc}>dokunsal geometri ve yaratıcı oyun</p>
              </div>
              <div className={styles.pillarItem}>
                <h4 className={styles.pillarTitle}>0.12mm pürüzsüzlük</h4>
                <p className={styles.pillarDesc}>çapaksız, güvenli yuvarlatılmış formlar</p>
              </div>
              <div className={styles.pillarItem}>
                <h4 className={styles.pillarTitle}>aynı gün kargo</h4>
                <p className={styles.pillarDesc}>atölyeden doğrudan ve özenli ambalaj</p>
              </div>
            </div>

            {/* Product Quick-Conversion Box */}
            <div className={styles.productSnippet}>
              <div className={styles.snippetTop}>
                <div>
                  <span className={styles.productLabel}>öne çıkan çok satan</span>
                  <h3 className={styles.productName}>
                    <Link href="/urun/mini-dinozor-serisi-set">
                      mini dinozor serisi (6 figür set)
                    </Link>
                  </h3>
                </div>
                <div className={styles.priceGroup}>
                  <span className={styles.price}>{formatPrice(279)}</span>
                  <span className={styles.oldPrice}>{formatPrice(349)}</span>
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.addBtn} ${added ? styles.addSuccess : ''}`}
                  onClick={handleQuickAdd}
                >
                  {added ? 'sepete eklendi' : 'sepete ekle'}
                </button>
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
