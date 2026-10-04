'use client'

import { useEffect } from 'react'

/**
 * Stops the page behind an open drawer, modal or menu from scrolling.
 *
 * Both <html> and <body> are locked: mobile Safari ignores overflow on <body>
 * alone, so the page kept scrolling behind the menu. overscroll-behavior stops
 * a scroll that reaches the end of the drawer from carrying on to the page.
 * Locks are counted, so closing one of two stacked layers (menu, then the cart
 * drawer) leaves the page locked until the last one closes.
 */
let locks = 0
let saved: { html: string; body: string; overscroll: string } | null = null

function lock() {
  if (locks++ > 0) return
  const html = document.documentElement
  saved = { html: html.style.overflow, body: document.body.style.overflow, overscroll: html.style.overscrollBehavior }
  html.style.overflow = 'hidden'
  html.style.overscrollBehavior = 'none'
  document.body.style.overflow = 'hidden'
}

function unlock() {
  if (locks === 0 || --locks > 0) return
  const html = document.documentElement
  html.style.overflow = saved?.html ?? ''
  html.style.overscrollBehavior = saved?.overscroll ?? ''
  document.body.style.overflow = saved?.body ?? ''
  saved = null
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}
