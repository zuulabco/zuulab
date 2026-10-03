'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Opens every new page at the very top.
 *
 * The router only scrolls the changed segment (<main>) into view, which leaves the
 * announcement bar and header above the fold. Back/forward keeps the browser's own
 * scroll restoration, and links to an #anchor are left alone.
 */
export default function ScrollToTop() {
  const pathname = usePathname()
  const fromHistory = useRef(false)
  const first = useRef(true)

  useEffect(() => {
    const onPop = () => {
      fromHistory.current = true
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (fromHistory.current) {
      fromHistory.current = false
      return
    }
    if (window.location.hash) return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])

  return null
}
