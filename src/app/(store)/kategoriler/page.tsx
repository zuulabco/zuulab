import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { MOCK_CATEGORIES } from '@/lib/mock-data'
import styles from './CategoriesPage.module.css'

export const metadata: Metadata = {
  title: 'koleksiyonlar — zuulab',
  description:
    'zuulab tasarım kategorilerini inceleyin. zuukids, zuulife, zuulight, zuutoptan ve deneysel koleksiyon parçaları.',
}

export default function CategoriesPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8)', paddingBottom: 'var(--sp-20)' }}>
      <Breadcrumbs items={[{ label: 'koleksiyonlar' }]} />

      <div className={styles.header}>
        <span className={styles.eyebrow} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.08em', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--sp-2)' }}>
          zuulab / dünyalar
        </span>
        <h1 className={styles.title}>tüm koleksiyonlar</h1>
        <p className={styles.subtitle}>
          farklı ihtiyaç ve yaşam alanlarına özel parametrik tasarım ve hassas 3d üretim dünyalarımız.
        </p>
      </div>

      <div className={styles.grid}>
        {MOCK_CATEGORIES.map((cat) => (
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
                koleksiyonu incele
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
