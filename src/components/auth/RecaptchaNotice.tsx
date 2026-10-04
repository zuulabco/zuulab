'use client'

import { useEffect, useState } from 'react'
import { prepareAuthProtection } from '@/lib/firebase'
import styles from './RecaptchaNotice.module.css'

/**
 * Google's required reCAPTCHA notice, shown under forms that Firebase protects with
 * reCAPTCHA Enterprise (the floating badge is hidden in globals.css, as Google allows
 * when this text is shown). Mounting it also loads the protection early; nothing is
 * shown while the protection is off for the project.
 */
export default function RecaptchaNotice() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    let live = true
    prepareAuthProtection().then((on) => {
      if (live) setActive(on)
    })
    return () => {
      live = false
    }
  }, [])

  if (!active) return null
  return (
    <p className={styles.notice}>
      bu form google reCAPTCHA ile korunur; google{' '}
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
        gizlilik politikası
      </a>{' '}
      ve{' '}
      <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
        hizmet şartları
      </a>{' '}
      geçerlidir.
    </p>
  )
}
