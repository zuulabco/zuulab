'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { CONSENT_EVENT, getConsent } from '@/lib/consent'
import { useAuthStore } from '@/store/authStore'
import { captureAttribution } from '@/lib/marketing/attribution'
import { setMarketingUser, trackEvent } from '@/lib/marketing/client'

/**
 * Feeds the canonical event layer with what only the page router knows: the signed-in
 * user, the campaign parameters of the landing URL, and a `page_view` on every route
 * change. Renders nothing. Must sit inside a Suspense boundary (it reads the query string).
 *
 * Campaign parameters are kept only with consent; when the visitor accepts the banner on
 * a campaign landing page, the parameters still in the URL are captured at that moment.
 */
export default function MarketingTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const userId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    setMarketingUser(userId)
  }, [userId])

  useEffect(() => {
    const capture = () => {
      if (getConsent() === 'all') captureAttribution(window.location.search)
    }
    capture()
    window.addEventListener(CONSENT_EVENT, capture)
    return () => window.removeEventListener(CONSENT_EVENT, capture)
  }, [])

  useEffect(() => {
    if (getConsent() === 'all') captureAttribution(window.location.search)
    trackEvent('page_view', {})
    // a new page view per path or query change; the user id is read from the module state
  }, [pathname, search])

  return null
}
