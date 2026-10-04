'use client'

import { useEffect, useRef } from 'react'

/**
 * Keeps a screen up to date without a reload: calls `refresh` every `intervalMs`
 * while the page is visible, and at once when the visitor comes back to the tab
 * or window.
 *
 * Why polling and not a socket: the site runs on serverless functions, which
 * cannot hold WebSocket connections, and a long-lived stream would keep a function
 * (and the database) busy for as long as a tab is open. A short request every few
 * seconds, only while someone is actually looking, costs almost nothing and lets
 * the database sleep when nobody is.
 */
export function useLiveRefresh(refresh: () => void, intervalMs: number, enabled = true) {
  const latest = useRef(refresh)
  useEffect(() => {
    latest.current = refresh
  })

  useEffect(() => {
    if (!enabled) return
    let last = 0
    const tick = () => {
      // Returning to a tab fires both focus and visibilitychange: one refresh is enough
      if (document.visibilityState !== 'visible' || Date.now() - last < 1500) return
      last = Date.now()
      latest.current()
    }
    const timer = setInterval(tick, intervalMs)
    const onReturn = () => tick()
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [intervalMs, enabled])
}
