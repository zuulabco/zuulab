import Link from 'next/link'
import styles from './CategoryStrip.module.css'

export interface StripItem {
  id: string
  label: string
  tag?: string
  href: string
}

interface Props {
  /** Built from the live catalog on the home page, so every link leads somewhere real. */
  items: StripItem[]
}

export default function CategoryStrip({ items }: Props) {
  if (!items.length) return null
  // Rendered twice so the marquee loops without a gap; the copy is hidden from assistive tech.
  const displayItems = [...items, ...items]

  return (
    <section className={styles.section} aria-label="koleksiyon ve kategori bandı">
      <div className={styles.marqueeContainer}>
        <div className={styles.marqueeTrack}>
          {displayItems.map((item, index) => {
            const isDuplicate = index >= items.length
            return (
              <div
                key={`${item.id}-${index}`}
                style={{ display: 'inline-flex', alignItems: 'center' }}
                aria-hidden={isDuplicate ? 'true' : undefined}
              >
                <Link
                  href={item.href}
                  className={styles.categoryItem}
                  tabIndex={isDuplicate ? -1 : 0}
                >
                  <span className={styles.label}>{item.label}</span>
                  {item.tag && <span className={styles.worldTag}>{item.tag}</span>}
                  <span className={styles.arrow} aria-hidden>→</span>
                </Link>
                <span className={styles.separator} aria-hidden>·</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
