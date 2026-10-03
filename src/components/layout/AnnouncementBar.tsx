'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
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
  // Empty until the admin's list arrives, so the bar starts once with the right items
  const [items, setItems] = useState<AnnouncementItem[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const setRef = useRef<HTMLDivElement>(null)
  // How many times one set is repeated so that half the track is wider than the screen
  const [copies, setCopies] = useState(1)
  const [duration, setDuration] = useState(30)

  // Bar items from the admin (Duyuru bandı), with running "ribbon" campaigns first
  useEffect(() => {
    const json = (url: string) => fetch(url).then((res) => res.json()).catch(() => null)
    Promise.all([json('/api/cms/announcements'), json('/api/campaigns')]).then(([ann, camp]) => {
      if (!ann && !camp) {
        setItems(DEFAULT_ANNOUNCEMENTS)
        return
      }
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

  // Measure one set and the screen: repeat the set until half the track covers the
  // screen (no gap before the loop restarts) and keep a steady reading speed.
  useLayoutEffect(() => {
    const container = containerRef.current
    const set = setRef.current
    if (!container || !set || items.length === 0) return
    const measure = () => {
      const setWidth = set.scrollWidth
      if (!setWidth) return
      const needed = Math.max(1, Math.ceil(container.clientWidth / setWidth))
      setCopies(needed)
      setDuration(Math.max(12, (setWidth * needed) / 55)) // ≈55 px per second
    }
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [items])

  if (pathname === '/odeme') return null

  // One "half" = the set repeated `copies` times; two halves make a seamless loop
  const half = Array.from({ length: copies }, () => items).flat()
  const displayList = [...half, ...half]

  return (
    <aside className={styles.bar} aria-label="Duyurular">
      <div className={styles.marqueeContainer} ref={containerRef}>
        {/* Hidden copy of one set, used only to measure its width */}
        <div ref={setRef} className={styles.measure} aria-hidden="true">
          {items.map((a, i) => (
            <div key={i} className={styles.item}>
              <span className={styles.text}>{a.text}</span>
              {a.cta && (
                <span className={styles.ctaLink}>
                  <span>{a.cta.label}</span>
                  <span>→</span>
                </span>
              )}
              <span className={styles.separator}>·</span>
            </div>
          ))}
        </div>
        <div
          className={`${styles.marqueeTrack} ${items.length ? styles.marqueeReady : ''}`}
          style={{ animationDuration: `${duration}s` }}
        >
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
