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
  { text: 'kendi atölyemizde 3d üretim' },
  {
    text: 'zuulight parametrik masa lambaları',
    cta: { label: 'keşfet', href: '/koleksiyon/zuulight' },
  },
]

export default function AnnouncementBar() {
  const pathname = usePathname()
  const [items, setItems] = useState<AnnouncementItem[]>(DEFAULT_ANNOUNCEMENTS)

  // Bar items from the admin (Duyuru bandı), with running "ribbon" campaigns first
  useEffect(() => {
    const json = (url: string) => fetch(url).then((res) => res.json()).catch(() => null)
    Promise.all([json('/api/cms/announcements'), json('/api/campaigns')]).then(([ann, camp]) => {
      const base: AnnouncementItem[] =
        ann?.success && Array.isArray(ann.announcements) && ann.announcements.length > 0
          ? ann.announcements.map((x: { text: string; ctaLabel?: string; ctaHref?: string }) => ({
              text: x.text,
              cta: x.ctaLabel ? { label: x.ctaLabel, href: x.ctaHref || '/urunler' } : undefined,
            }))
          : DEFAULT_ANNOUNCEMENTS
      const ribbons: AnnouncementItem[] = camp?.success
        ? camp.campaigns
            .filter((c: { display: string }) => c.display === 'RIBBON')
            .map((c: { headline: string; ctaLabel: string | null; ctaHref: string | null }) => ({
              text: c.headline,
              cta: c.ctaLabel ? { label: c.ctaLabel, href: c.ctaHref || '/urunler' } : undefined,
            }))
        : []
      setItems([...ribbons, ...base])
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
