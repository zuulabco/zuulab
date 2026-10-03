'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './AnnouncementBar.module.css'

interface AnnouncementItem {
  text: string
  cta?: {
    label: string
    href: string
  }
}

const DEFAULT_ANNOUNCEMENTS: AnnouncementItem[] = [
  {
    text: 'zuukids yeni serisi yayında — çocuk güvenli pla objeleri',
    cta: { label: 'incele', href: '/koleksiyon/zuukids' },
  },
  { text: '750 ₺ ve üzeri tüm siparişlerde ücretsiz kargo' },
  { text: 'sipariş üzerine 0.12mm hassasiyetle 3d üretim' },
  {
    text: 'zuulight parametrik masa lambaları',
    cta: { label: 'keşfet', href: '/koleksiyon/zuulight' },
  },
]

export default function AnnouncementBar() {
  const pathname = usePathname()
  const [items, setItems] = useState<AnnouncementItem[]>(DEFAULT_ANNOUNCEMENTS)

  useEffect(() => {
    fetch('/api/cms/announcements')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.announcements) && data.announcements.length > 0) {
          const mapped: AnnouncementItem[] = data.announcements.map((a: any) => ({
            text: a.text,
            cta: a.ctaLabel ? { label: a.ctaLabel, href: a.ctaHref || '/urunler' } : undefined,
          }))
          setItems(mapped)
        }
      })
      .catch(() => {
        // Fallback to default announcements
      })
  }, [])

  if (pathname === '/odeme') return null

  // Duplicate items twice to ensure a completely seamless infinite loop
  const displayList = [...items, ...items]

  return (
    <aside className={styles.bar} aria-label="Duyurular">
      <div className={styles.marqueeContainer}>
        <div className={styles.marqueeTrack}>
          {displayList.map((announcement, index) => {
            const isDuplicate = index >= items.length
            return (
              <div
                key={`${announcement.text}-${index}`}
                className={styles.item}
                aria-hidden={isDuplicate ? 'true' : undefined}
              >
                <span className={styles.text}>{announcement.text}</span>
                {announcement.cta && (
                  <Link
                    href={announcement.cta.href}
                    className={styles.ctaLink}
                    tabIndex={isDuplicate ? -1 : 0}
                  >
                    <span>{announcement.cta.label}</span>
                    <span aria-hidden>→</span>
                  </Link>
                )}
                <span className={styles.separator} aria-hidden>
                  ·
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
