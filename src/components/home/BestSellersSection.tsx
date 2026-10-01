import Link from 'next/link'
import type { MockProduct } from '@/lib/mock-data'
import { formatMockProductToListItem } from '@/lib/mock-data'
import ProductCard from './ProductCard'
import styles from './BestSellersSection.module.css'

interface Props {
  products: MockProduct[]
}

export default function BestSellersSection({ products }: Props) {
  if (!products.length) return null

  return (
    <section className={styles.section} aria-label="en çok satan ürünler">
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>zuulab / seçki</span>
            <h2 className={styles.title}>en çok satanlar</h2>
          </div>
          <Link href="/urunler?filtre=cok-satanlar" className={styles.viewAll}>
            tümünü gör
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>

        <div className={styles.grid}>
          {products.slice(0, 4).map((product, index) => (
            <ProductCard
              key={product.id}
              product={formatMockProductToListItem(product)}
              priority={index < 2}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
