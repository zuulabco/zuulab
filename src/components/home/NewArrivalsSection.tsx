import Link from 'next/link'
import Image from 'next/image'
import type { MockProduct } from '@/lib/mock-data'
import { formatPrice } from '@/lib/utils'
import styles from './NewArrivalsSection.module.css'

interface Props {
  products: MockProduct[]
}

export default function NewArrivalsSection({ products }: Props) {
  if (!products.length) return null

  return (
    <section className={styles.section} aria-label="yeni tasarımlar">
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.title}>bu hafta atölyeden çıkanlar</h2>
          <Link href="/urunler?filtre=yeni" className={styles.viewAll}>
            tüm yeniler
          </Link>
        </div>

        <div className={styles.grid}>
          {products.slice(0, 4).map((product, i) => (
            <article
              key={product.id}
              className={`${styles.item} ${i === 0 ? styles.leadItem : ''}`}
            >
              <div className={styles.visualWrap}>
                <Link href={`/urun/${product.slug}`} className={styles.imageLink}>
                  {product.images[0] ? (
                    <Image
                      src={product.images[0].url}
                      alt={product.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      className={styles.img}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.placeholder} />
                  )}
                </Link>
                <div className={styles.tagWrap}>
                  <span className={styles.tag}>yeni seri</span>
                </div>
              </div>

              <div className={styles.meta}>
                <span className={styles.category}>
                  {product.collectionWorld ?? product.categoryName.toLowerCase()}
                </span>
                <h3 className={styles.name}>
                  <Link href={`/urun/${product.slug}`}>
                    {product.name.toLowerCase()}
                  </Link>
                </h3>
                <div className={styles.priceRow}>
                  <span className={styles.price}>{formatPrice(product.price)}</span>
                  {product.rating && (
                    <span className={styles.rating}>{product.rating.toFixed(1)}</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
