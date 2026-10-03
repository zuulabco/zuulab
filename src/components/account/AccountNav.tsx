'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import styles from './AccountNav.module.css'

type BadgeSection = 'orders' | 'support'

function sectionFor(pathname: string | null): BadgeSection | null {
  if (pathname?.startsWith('/hesap/siparisler')) return 'orders'
  if (pathname?.startsWith('/hesap/destek')) return 'support'
  return null
}

interface AccountNavProps {
  orderCount?: number
  favoriteCount?: number
  ticketCount?: number
}

export default function AccountNav({ orderCount, favoriteCount, ticketCount }: AccountNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, token } = useAuthStore()
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)
  const [badges, setBadges] = useState<Record<BadgeSection, boolean>>({ orders: false, support: false })

  // Opening a section clears its dot; the others come from the server. Checked again
  // whenever the customer comes back to the browser tab.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    const auth = { Authorization: `Bearer ${token}` }
    const current = sectionFor(pathname)

    const sync = async () => {
      if (current) {
        setBadges((b) => ({ ...b, [current]: false }))
        await fetch('/api/account/badges', {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: current }),
        })
      }
      const res = await fetch('/api/account/badges', { headers: auth, cache: 'no-store' })
      const data = await res.json()
      if (!cancelled && data.success) setBadges(data.badges)
    }
    sync().catch(() => {})

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [token, pathname])

  const navLinks = [
    { label: 'hesabım', href: '/hesap', exact: true },
    { label: 'siparişlerim', href: '/hesap/siparisler', count: orderCount, section: 'orders' as BadgeSection },
    { label: 'adreslerim', href: '/hesap/adresler' },
    { label: 'favorilerim', href: '/hesap/favoriler', count: favoriteCount },
    { label: 'destek', href: '/hesap/destek', count: ticketCount, section: 'support' as BadgeSection },
    { label: 'profilim', href: '/hesap/profil' },
  ]

  const confirmLogout = async () => {
    setLogoutModalOpen(false)
    await logout()
    toast.info('Oturum kapatıldı.')
    router.push('/')
  }

  return (
    <>
      <nav className={styles.navContainer} aria-label="Hesap Menüsü">
        {navLinks.map((link) => {
          const isActive = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname?.startsWith(`${link.href}/`)
          const hasNews = 'section' in link && link.section ? badges[link.section] : false

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                if ('section' in link && link.section) {
                  const section = link.section
                  setBadges((b) => ({ ...b, [section]: false }))
                }
              }}
            >
              <span className={styles.navLabel}>
                {link.label}
                {hasNews && (
                  <span className={styles.newDot}>
                    <span className="sr-only">yeni güncelleme var</span>
                  </span>
                )}
              </span>
              {typeof link.count === 'number' && link.count > 0 && (
                <span className={styles.badge}>{link.count}</span>
              )}
            </Link>
          )
        })}

        <div className={styles.navDivider} role="separator" />

        <button
          type="button"
          onClick={() => setLogoutModalOpen(true)}
          className={styles.logoutBtn}
        >
          <span>çıkış yap</span>
        </button>
      </nav>

      {/* Logout Confirmation Modal */}
      <Modal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        maxWidth="420px"
        ariaLabel="Oturumu Kapatma Onayı"
      >
        <div className={styles.modalBody}>
          <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-medium)', margin: '0 0 var(--sp-2) 0', color: 'var(--text-primary)' }}>
            oturumu kapat
          </h3>
          <p className={styles.modalText}>
            Hesabınızdan çıkış yapmak istediğinize emin misiniz?
          </p>
          <div className={styles.modalActions}>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => setLogoutModalOpen(false)}
            >
              vazgeç
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={confirmLogout}
            >
              çıkış yap
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
