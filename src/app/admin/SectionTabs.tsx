'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './SectionTabs.module.css'
import { NAV_SECTIONS } from './nav'

/**
 * Tab bar for pages that belong together (Reklamlar: list / report / real sales; Site analizi: visitors / Google search /
 * products). The tabs come from the navigation item that lists the current page, so the menu and the bar never disagree.
 */
export default function SectionTabs() {
  const pathname = (usePathname() || '/').replace(/^\/admin/, '') || '/'
  const item = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.tabs?.some((t) => t.href === pathname))
  if (!item?.tabs) return null
  return (
    <nav className={styles.tabs} aria-label={item.label}>
      {item.tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`${styles.tab} ${t.href === pathname ? styles.tabActive : ''}`} aria-current={t.href === pathname ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
