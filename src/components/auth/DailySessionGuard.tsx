'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { isSignInFromEarlierDay, nextTrMidnight } from '@/lib/auth/daily-session'

/**
 * Signs the visitor out at 00:00 (Türkiye time): on the stroke of midnight while a
 * page is open, and on the next visit or tab focus for a login from an earlier day.
 * The server refuses such logins as well; this keeps the browser in step with it.
 */
export default function DailySessionGuard() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = () => {
      const { user, signedInAt, logout } = useAuthStore.getState()
      if (user && (!signedInAt || isSignInFromEarlierDay(signedInAt))) {
        void logout()
      }
    }

    const schedule = () => {
      clearTimeout(timer)
      // A second past midnight, so the new day has surely begun
      timer = setTimeout(() => {
        check()
        schedule()
      }, nextTrMidnight() - Date.now() + 1000)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        check()
        schedule()
      }
    }

    check()
    schedule()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return null
}
