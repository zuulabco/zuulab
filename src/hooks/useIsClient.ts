'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False while React hydrates the server HTML, true afterwards. For values that only
 * the browser knows (the cart saved in localStorage): rendering them during
 * hydration would differ from the server HTML and throw a hydration error.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
