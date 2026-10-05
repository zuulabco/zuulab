'use client'

import { useEffect, useState } from 'react'

/**
 * Is commercial e-mail switched on (COMMERCIAL_EMAIL_ENABLED)? False until the answer arrives and whenever it
 * cannot be fetched, so nothing that collects an e-mail permission ever appears by accident. One request per
 * page load, shared by every component that asks.
 */
let asked: Promise<boolean> | null = null

function fetchFlag(): Promise<boolean> {
  asked ??= fetch('/api/email/features', { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => d?.commercial === true)
    .catch(() => false)
  return asked
}

export function useCommercialEmail(): boolean {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let cancelled = false
    void fetchFlag().then((v) => {
      if (!cancelled) setEnabled(v)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return enabled
}
