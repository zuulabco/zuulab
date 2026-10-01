'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { useCartStore } from '@/store/cartStore'
import { toast } from '@/store/toastStore'
import { formatPrice } from '@/lib/utils'
import { FREE_SHIPPING_THRESHOLD, DEFAULT_SHIPPING_METHODS } from '@/lib/services/shipping.service'
import styles from './CartDrawer.module.css'

const STANDARD_SHIPPING_FEE = DEFAULT_SHIPPING_METHODS[0]?.price ?? 49.9

export default function CartDrawer() {
  const router = useRouter()
  const pathname = usePathname()
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const {
    items,
    isDrawerOpen,
    closeDrawer,
    updateQuantity,
    removeItem,
    subtotal,
    itemCount,
    discountAmount,
  } = useCartStore()

  // Transition lifecycle for smooth entrance and exit animations
  const [isRendered, setIsRendered] = useState(isDrawerOpen)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (isDrawerOpen) {
      setIsRendered(true)
      setIsExiting(false)
    } else if (isRendered) {
      setIsExiting(true)
      const timer = setTimeout(() => {
        setIsRendered(false)
        setIsExiting(false)
        document.getElementById('cart-button')?.focus()
      }, 190) // match slideOut duration
      return () => clearTimeout(timer)
    }
  }, [isDrawerOpen, isRendered])

  // Close drawer on route change
  useEffect(() => {
    if (isDrawerOpen) {
      closeDrawer()
    }
  }, [pathname])

  // Escape key and body scroll lock
  useEffect(() => {
    if (!isRendered) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer()
      }
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    if (isDrawerOpen && !isExiting) {
      setTimeout(() => closeBtnRef.current?.focus(), 50)
    }

    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isRendered, isDrawerOpen, isExiting, closeDrawer])

  if (!isRendered) return null

  const count = itemCount()
  const sub = subtotal()
  const shippingFee = sub >= FREE_SHIPPING_THRESHOLD || sub === 0 ? 0 : STANDARD_SHIPPING_FEE
  const freeShippingRemainder = Math.max(0, FREE_SHIPPING_THRESHOLD - sub)
  const freeShippingProgress = Math.min(100, (sub / FREE_SHIPPING_THRESHOLD) * 100)
  const finalTotal = Math.max(0, sub - discountAmount + shippingFee)

  const handleCheckout = () => {
    closeDrawer()
    router.push('/odeme')
  }

  const handleViewCart = () => {
    closeDrawer()
    router.push('/sepet')
  }

  const handleRemove = (productId: string, variantId?: string | null) => {
    removeItem(productId, variantId)
    toast.info('ürün sepetten çıkarıldı')
  }

  return (
    <div
      className={`${styles.overlay} ${isExiting ? styles.overlayExiting : ''}`}
      onClick={closeDrawer}
      role="presentation"
    >
      <div
        className={`${styles.drawer} ${isExiting ? styles.drawerExiting : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Alışveriş Sepeti"
      >
        {/* ── 1. Mini Cart Header ───────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerTopRow}>
            <span className={styles.title}>sepet</span>
            <button
              ref={closeBtnRef}
              type="button"
              className={styles.closeBtn}
              onClick={closeDrawer}
              aria-label="Sepeti kapat"
            >
              ✕
            </button>
          </div>
          <div className={styles.headerMetaRow}>
            <span className={styles.itemCountText}>
              {count} {count === 1 ? 'ürün' : 'ürün'}
            </span>
          </div>
        </div>

        {/* ── 2. Free Shipping Progress ─────────────────────── */}
        {items.length > 0 && (
          <div className={styles.shippingBar}>
            <div className={styles.shippingBarText}>
              {freeShippingRemainder === 0 ? (
                <span className={styles.freeShipSuccess}>
                  ✓ <strong>ücretsiz kargo hakkı kazandınız.</strong>
                </span>
              ) : (
                <span>
                  ücretsiz kargo için <strong>{formatPrice(freeShippingRemainder)}</strong> daha ekleyin
                </span>
              )}
            </div>
            <div className={styles.shippingBarTrack}>
              <div
                className={styles.shippingBarFill}
                style={{ width: `${freeShippingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* ── 3. Body: Items List or Empty State ────────────── */}
        <div className={styles.body}>
          {items.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.mascotWrap}>
                <ZuuMascotIcon />
              </div>
              <h3 className={styles.emptyTitle}>sepetiniz boş</h3>
              <p className={styles.emptyDesc}>
                henüz sepetinize ürün eklemediniz.
              </p>
              <Link
                href="/urunler"
                className={styles.discoverBtn}
                onClick={closeDrawer}
              >
                ürünleri keşfet
              </Link>
            </div>
          ) : (
            <div className={styles.itemsList}>
              {items.map((item) => {
                const rowTotal = item.price * item.quantity

                return (
                  <div
                    key={`${item.productId}-${item.variantId}`}
                    className={styles.itemRow}
                  >
                    {/* Item Image */}
                    <Link
                      href={`/urun/${item.slug}`}
                      className={styles.itemImageLink}
                      onClick={closeDrawer}
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          width={64}
                          height={64}
                          className={styles.itemImage}
                        />
                      ) : (
                        <div className={styles.itemNoImage}>
                          <ImageIcon />
                        </div>
                      )}
                    </Link>

                    {/* Details */}
                    <div className={styles.itemDetails}>
                      <div className={styles.itemNameRow}>
                        <Link
                          href={`/urun/${item.slug}`}
                          className={styles.itemName}
                          onClick={closeDrawer}
                        >
                          {item.name.toLowerCase()}
                        </Link>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => handleRemove(item.productId, item.variantId)}
                          aria-label={`${item.name} ürününü sepetten çıkar`}
                        >
                          ✕
                        </button>
                      </div>

                      {item.variantLabel && (
                        <span className={styles.variantLabel}>
                          {item.variantLabel.toLowerCase()}
                        </span>
                      )}

                      <div className={styles.itemPriceAndQty}>
                        <div className={styles.qtyBox} role="group" aria-label="Adet">
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.variantId,
                                item.quantity - 1
                              )
                            }
                            aria-label="Adeti azalt"
                          >
                            −
                          </button>
                          <span className={styles.qtyVal}>{item.quantity}</span>
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.variantId,
                                item.quantity + 1
                              )
                            }
                            disabled={item.quantity >= item.maxStock}
                            aria-label="Adeti arttır"
                          >
                            +
                          </button>
                        </div>

                        <span className={styles.rowPrice}>
                          {formatPrice(rowTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 4. Sticky Footer / Summary ────────────────────── */}
        {items.length > 0 && (
          <div className={styles.footer}>
            <div className={styles.summaryBreakdown}>
              <div className={styles.summaryRow}>
                <span>ara toplam</span>
                <span>{formatPrice(sub)}</span>
              </div>
              {discountAmount > 0 && (
                <div className={`${styles.summaryRow} ${styles.discountRow}`}>
                  <span>indirim</span>
                  <span>-{formatPrice(discountAmount)}</span>
                </div>
              )}
              <div className={styles.summaryRow}>
                <span>kargo</span>
                <span>
                  {shippingFee === 0 ? (
                    <strong className={styles.freeShippingText}>ücretsiz</strong>
                  ) : (
                    formatPrice(shippingFee)
                  )}
                </span>
              </div>
              <div className={styles.totalRow}>
                <span>toplam</span>
                <span className={styles.totalVal}>{formatPrice(finalTotal)}</span>
              </div>
            </div>

            <div className={styles.footerActions}>
              <button
                type="button"
                className={styles.checkoutBtn}
                onClick={handleCheckout}
              >
                <span>ödemeye geç</span>
                <ArrowRightIcon />
              </button>
              <button
                type="button"
                className={styles.viewCartBtn}
                onClick={handleViewCart}
              >
                sepete git
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ZuuMascotIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="16" cy="14" r="5" />
      <circle cx="32" cy="14" r="5" />
      <circle cx="24" cy="26" r="14" />
      <circle cx="20" cy="24" r="1.5" fill="currentColor" />
      <circle cx="28" cy="24" r="1.5" fill="currentColor" />
      <path d="M22 28.5c1 .8 3 .8 4 0" />
      <path d="M24 26v1.5" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}
