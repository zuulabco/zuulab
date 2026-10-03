'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Modal from '@/components/common/Modal'
import { toast } from '@/store/toastStore'
import { CONSENT_EVENT, getConsent } from '@/lib/consent'
import styles from './CampaignModal.module.css'

interface PublicCampaign {
  id: string
  display: 'MODAL' | 'RIBBON'
  headline: string
  message: string | null
  ctaLabel: string | null
  ctaHref: string | null
  couponCode: string | null
  imageUrl: string | null
  label: string | null
  minSubtotal: number | null
  firstOrderOnly: boolean
  endsAt: string | null
  updatedAt: string | null
}

/** Pages where a pop-up would get in the way of buying */
const QUIET_PATHS = ['/sepet', '/odeme', '/hesap']

function seenKey(c: PublicCampaign) {
  return `zuu-campaign-seen:${c.id}:${c.updatedAt ?? ''}`
}

/**
 * Shows the top "pop-up" campaign from the admin once per visitor (until the campaign
 * is edited), a few seconds after they arrive. Never on cart, checkout or account pages.
 */
export default function CampaignModal() {
  const pathname = usePathname()
  const [campaign, setCampaign] = useState<PublicCampaign | null>(null)
  const [open, setOpen] = useState(false)
  // Wait for the cookie choice so a first-time visitor never gets the bar and a pop-up at once
  // (nothing is drawn from this value, so reading it during render is hydration-safe)
  const [consented, setConsented] = useState(() => typeof window !== 'undefined' && getConsent() !== null)

  useEffect(() => {
    const onChoice = () => setConsented(true)
    window.addEventListener(CONSENT_EVENT, onChoice)
    return () => window.removeEventListener(CONSENT_EVENT, onChoice)
  }, [])

  const quiet = QUIET_PATHS.some((p) => pathname === p || pathname?.startsWith(`${p}/`))

  useEffect(() => {
    if (quiet || campaign || !consented) return
    let timer: ReturnType<typeof setTimeout> | undefined
    fetch('/api/campaigns')
      .then((r) => r.json())
      .then((d) => {
        const next: PublicCampaign | undefined = d?.campaigns?.find((c: PublicCampaign) => {
          if (c.display !== 'MODAL') return false
          try {
            return !localStorage.getItem(seenKey(c))
          } catch {
            return true
          }
        })
        if (!next) return
        timer = setTimeout(() => {
          setCampaign(next)
          setOpen(true)
        }, 3500)
      })
      .catch(() => {})
    return () => clearTimeout(timer)
  }, [quiet, campaign, consented])

  const close = () => {
    setOpen(false)
    if (campaign) {
      try {
        localStorage.setItem(seenKey(campaign), '1')
      } catch {
        // private mode: it may show again next visit
      }
    }
  }

  if (!campaign) return null

  const copyCode = async () => {
    if (!campaign.couponCode) return
    try {
      await navigator.clipboard.writeText(campaign.couponCode)
      toast.success('Kod kopyalandı.')
    } catch {
      toast.info(`Kod: ${campaign.couponCode}`)
    }
  }

  const conditions = [
    campaign.minSubtotal ? `${campaign.minSubtotal} ₺ ve üzeri sepetlerde` : null,
    campaign.firstOrderOnly ? 'üyelerin ilk siparişinde' : null,
    campaign.endsAt ? `${new Date(campaign.endsAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar` : null,
  ].filter(Boolean)

  return (
    <Modal
      isOpen={open}
      onClose={close}
      maxWidth="460px"
      ariaLabel={campaign.headline}
      className={styles.panel}
      showCloseBtn={false}
    >
      <button type="button" className={`${styles.close} ${campaign.imageUrl ? styles.closeOnImage : ''}`} onClick={close} aria-label="Kapat">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>

      {campaign.imageUrl && (
        <div className={styles.media}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={campaign.imageUrl} alt="" className={styles.image} />
        </div>
      )}

      <div className={styles.body}>
        {campaign.label && <span className={styles.label}>{campaign.label}</span>}
        <h2 className={styles.headline}>{campaign.headline}</h2>
        {campaign.message && <p className={styles.message}>{campaign.message}</p>}
        {campaign.couponCode && (
          <button type="button" className={styles.code} onClick={copyCode} aria-label={`Kodu kopyala: ${campaign.couponCode}`}>
            <span className={styles.codeValue}>{campaign.couponCode}</span>
            <span className={styles.codeAction}>kopyala</span>
          </button>
        )}
        {conditions.length > 0 && <p className={styles.conditions}>{conditions.join(' · ')}</p>}
        <div className={styles.actions}>
          {campaign.ctaLabel && campaign.ctaHref && (
            <Link href={campaign.ctaHref} className={`btn btn-primary btn-lg ${styles.cta}`} onClick={close}>
              {campaign.ctaLabel}
            </Link>
          )}
          <button type="button" className={styles.dismiss} onClick={close}>
            şimdi değil
          </button>
        </div>
      </div>
    </Modal>
  )
}
