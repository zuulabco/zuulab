import Link from 'next/link'
import ProductCard from './ProductCard'
import type { ProductListItem } from '@/types/product'
import styles from './FeaturedProducts.module.css'

interface Props {
  title: string
  subtitle?: string
  products: ProductListItem[]
  viewAllHref?: string
  background?: 'white' | 'surface'
}

export default function FeaturedProducts({
  title,
  subtitle,
  products,
  viewAllHref,
  background = 'white',
}: Props) {
  if (!products.length) return null

  return (
    <section
      className={`section ${styles.section}`}
      style={
        background === 'surface'
          ? { backgroundColor: 'var(--surface-1)' }
          : undefined
      }
    >
      <div className="container">
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>{title.toLowerCase()}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle.toLowerCase()}</p>}
          </div>
          {viewAllHref && (
            <Link href={viewAllHref} className={styles.viewAll}>
              tümünü gör
              <ArrowRight />
            </Link>
          )}
        </div>

        <div className="grid-products">
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              priority={index < 4}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}
