import { Skeleton, SkeletonLines } from './Skeleton'
import styles from './PageSkeletons.module.css'

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
