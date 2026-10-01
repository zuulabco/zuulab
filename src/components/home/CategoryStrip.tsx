import Link from 'next/link'
import styles from './CategoryStrip.module.css'

interface MarqueeItem {
  id: string
  label: string
  tag?: string
  href: string
}

const CATEGORY_ITEMS: MarqueeItem[] = [
  { id: 'zuukids', label: 'zuukids', tag: 'çocuk dünyası', href: '/koleksiyon/zuukids' },
  { id: 'zuulife', label: 'zuulife', tag: 'yaşam & masa', href: '/koleksiyon/zuulife' },
  { id: 'zuulight', label: 'zuulight', tag: 'aydınlatma', href: '/koleksiyon/zuulight' },
  { id: 'zuutoptan', label: 'zuutoptan', tag: 'butik üretim', href: '/koleksiyon/zuutoptan' },
  { id: 'dinozorlar', label: 'mini dinozorlar', tag: 'eğitici seri', href: '/urun/mini-dinozor-serisi-set' },
  { id: 'organizer', label: 'modüler organizer', tag: 'masa düzeni', href: '/urun/modular-hex-desk-organizer-seti' },
  { id: 'ay-lambasi', label: 'litofan ay lambası', tag: '3d ambiyans', href: '/urun/lithoglow-ay-yuzeyi-gece-lambasi' },
  { id: 'parametrik-vazo', label: 'parametrik vazo', tag: 'altın oran', href: '/urun/aura-parametrik-vazo-spiral' },
  { id: 'koleksiyonlar', label: 'özel seriler', tag: 'koleksiyon', href: '/koleksiyonlar' },
]

// Duplicate items twice to ensure a completely seamless, continuous loop
const DISPLAY_ITEMS = [...CATEGORY_ITEMS, ...CATEGORY_ITEMS]

export default function CategoryStrip() {
  return (
    <section className={styles.section} aria-label="koleksiyon ve kategori bandı">
      <div className={styles.marqueeContainer}>
        <div className={styles.marqueeTrack}>
          {DISPLAY_ITEMS.map((item, index) => {
            const isDuplicate = index >= CATEGORY_ITEMS.length
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
