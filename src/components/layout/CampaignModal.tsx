'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Modal from '@/components/common/Modal'
import { toast } from '@/store/toastStore'
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

  const quiet = QUIET_PATHS.some((p) => pathname === p || pathname?.startsWith(`${p}/`))

  useEffect(() => {
    if (quiet || campaign) return
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
  }, [quiet, campaign])

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
    <Modal isOpen={open} onClose={close} maxWidth="440px" ariaLabel={campaign.headline}>
      <div className={styles.body}>
        {campaign.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.imageUrl} alt="" className={styles.image} />
        )}
        {campaign.label && <span className={styles.label}>{campaign.label}</span>}
        <h2 className={styles.headline}>{campaign.headline}</h2>
        {campaign.message && <p className={styles.message}>{campaign.message}</p>}
        {campaign.couponCode && (
          <button type="button" className={styles.code} onClick={copyCode} aria-label={`Kodu kopyala: ${campaign.couponCode}`}>
            <span>{campaign.couponCode}</span>
            <small>kopyala</small>
          </button>
        )}
        {conditions.length > 0 && <p className={styles.conditions}>{conditions.join(' · ')}</p>}
        <div className={styles.actions}>
          {campaign.ctaLabel && campaign.ctaHref && (
            <Link href={campaign.ctaHref} className="btn btn-primary btn-lg" onClick={close}>
              {campaign.ctaLabel}
            </Link>
          )}
          <button type="button" className="btn btn-ghost btn-lg" onClick={close}>
            Kapat
          </button>
        </div>
      </div>
    </Modal>
  )
}
