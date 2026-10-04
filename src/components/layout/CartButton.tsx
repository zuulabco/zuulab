'use client'

import Link from 'next/link'
import { useCartStore } from '@/store/cartStore'
import { useIsClient } from '@/hooks/useIsClient'
import styles from './CartButton.module.css'

export default function CartButton() {
  // The saved cart is browser-only: the badge joins after hydration (server HTML has none)
  const isClient = useIsClient()
  const storedCount = useCartStore((s) => s.itemCount())
  const itemCount = isClient ? storedCount : 0
  const isDrawerOpen = useCartStore((s) => s.isDrawerOpen)
  const openDrawer = useCartStore((s) => s.openDrawer)

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Open drawer on primary click without page jump
    if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      openDrawer()
    }
  }

  return (
    <Link
      href="/sepet"
      onClick={handleClick}
      className={`btn btn-ghost btn-icon ${styles.btn}`}
      aria-label={`Sepet${itemCount > 0 ? ` (${itemCount} ürün)` : ''}`}
      aria-haspopup="dialog"
      aria-expanded={isDrawerOpen}
      id="cart-button"
    >
      <CartIcon />
      {itemCount > 0 && (
        <span className={styles.badge} aria-hidden>
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </Link>
  )
}

function CartIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}
