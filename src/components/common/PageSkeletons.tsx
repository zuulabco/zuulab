import { ProductCardSkeleton, Skeleton, SkeletonLines } from './Skeleton'
import styles from './PageSkeletons.module.css'

/** Product list / category / collection pages while they load. */
export function ListingPageSkeleton({ withFilters = true }: { withFilters?: boolean }) {
  return (
    <div className={`container ${styles.page}`} aria-busy="true" aria-label="Ürünler yükleniyor">
      <div className={styles.header}>
        <Skeleton height={10} width={140} />
        <Skeleton height={30} width={220} />
        <Skeleton height={12} width={320} />
      </div>
      <div className={withFilters ? styles.listing : undefined}>
        {withFilters && (
          <div className={styles.filters} aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} height={12} width={`${60 + (i % 3) * 12}%`} />
            ))}
          </div>
        )}
        <div className={styles.grid}>
          {Array.from({ length: 8 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Product detail page while it loads. */
export function ProductPageSkeleton() {
  return (
    <div className={`container ${styles.page}`} aria-busy="true" aria-label="Ürün yükleniyor">
      <Skeleton height={10} width={260} style={{ marginBottom: 'var(--sp-6)' }} />
      <div className={styles.detail}>
        <div>
          <Skeleton height={0} style={{ paddingBottom: '100%' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} width={64} height={64} />
            ))}
          </div>
        </div>
        <div className={styles.info}>
          <Skeleton height={10} width={120} />
          <Skeleton height={30} width="75%" />
          <SkeletonLines lines={3} />
          <Skeleton height={28} width={140} style={{ marginTop: 8 }} />
          <Skeleton height={44} style={{ marginTop: 8 }} />
          <Skeleton height={44} />
        </div>
      </div>
    </div>
  )
}

/** Any other storefront page (text content, account, legal). */
export function ContentPageSkeleton() {
  return (
    <div className={`container ${styles.page}`} aria-busy="true" aria-label="Sayfa yükleniyor">
      <div className={styles.header}>
        <Skeleton height={10} width={140} />
        <Skeleton height={34} width="45%" />
      </div>
      <div style={{ maxWidth: 720 }}>
        <SkeletonLines lines={4} />
        <div style={{ height: 24 }} />
        <SkeletonLines lines={5} lastWidth="40%" />
      </div>
    </div>
  )
}
