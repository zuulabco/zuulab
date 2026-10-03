import Link from 'next/link'
import { toProductListItem, type CatalogProduct } from '@/types/catalog'
import ProductCard from './ProductCard'
import styles from './BestSellersSection.module.css'

interface Props {
  products: CatalogProduct[]
  /** Defaults describe the best-seller row; other home rows pass their own. */
  title?: string
  eyebrow?: string
  viewAllHref?: string
  viewAllLabel?: string
  ariaLabel?: string
  /** Muted background, to separate two product rows that follow each other. */
  tone?: 'plain' | 'muted'
  /** How many cards (4 or 8) */
  limit?: number
}

export default function BestSellersSection({
  products,
  title = 'en çok satanlar',
  eyebrow = 'zuulab / seçki',
  viewAllHref = '/urunler?sort=bestseller',
  viewAllLabel = 'tümünü gör',
  ariaLabel,
  tone = 'plain',
  limit = 4,
}: Props) {
  if (!products.length) return null

  return (
    <section
      className={`${styles.section} ${tone === 'muted' ? styles.muted : ''}`}
      aria-label={ariaLabel ?? title}
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
            <h2 className={styles.title}>{title}</h2>
          </div>
          <Link href={viewAllHref} className={styles.viewAll}>
            {viewAllLabel}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>

        <div className={styles.grid}>
          {products.slice(0, limit).map((product) => (
            <ProductCard key={product.id} product={toProductListItem(product)} />
          ))}
        </div>
      </div>
    </section>
  )
}
