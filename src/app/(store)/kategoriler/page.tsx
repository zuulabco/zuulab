import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { getCategories, getProducts } from '@/lib/services/products.service'
import styles from './CategoriesPage.module.css'

export const metadata: Metadata = {
  title: 'Kategoriler',
  description:
    'zuulab tasarım kategorilerini inceleyin: aydınlatmalar, figürler, masaüstü düzenleyiciler, dekorasyon ve daha fazlası.',
}

export default async function CategoriesPage() {
  const [allCategories, { items: products }] = await Promise.all([
    getCategories(),
    getProducts({ limit: 1000 }),
  ])
  // Only categories that currently have something to show; a category without its
  // own image borrows the primary image of one of its products.
  const categories = allCategories
    .filter((c) => c.productCount > 0)
    .map((c) => ({
      ...c,
      image:
        c.image ||
        products.find((p) => p.categoryId === c.id)?.images[0]?.url ||
        '/placeholder.png',
    }))

  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8)', paddingBottom: 'var(--sp-20)' }}>
      <Breadcrumbs items={[{ label: 'kategoriler' }]} />

      <div className={styles.header}>
        <span className={styles.eyebrow} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.08em', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--sp-2)' }}>
          zuulab / dünyalar
        </span>
        <h1 className={styles.title}>tüm kategoriler</h1>
        <p className={styles.subtitle}>
          farklı ihtiyaç ve yaşam alanlarına özel parametrik tasarım ve hassas 3d üretim dünyalarımız.
        </p>
      </div>

      <div className={styles.grid}>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/kategori/${cat.slug}`}
            className={styles.card}
          >
            <div className={styles.imageWrapper}>
              <Image
                src={cat.image}
                alt={cat.name}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                className={styles.image}
              />
              <div className={styles.overlay} />
            </div>
            <div className={styles.content}>
              <span className={styles.badge}>{cat.productCount} tasarım</span>
              <h2 className={styles.cardTitle}>{cat.name}</h2>
              <p className={styles.cardDesc}>{cat.description}</p>
              <span className={styles.cta}>
                kategoriyi incele
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
