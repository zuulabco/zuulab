'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import { formatPrice } from '@/lib/utils'
import { trackItems } from '@/lib/analytics/gtag'
import styles from './Basarili.module.css'

const PAID = new Set(['PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED'])

type Phase = 'checking' | 'paid' | 'pending'

/**
 * Landing page after PayTR. Reaching this URL does not prove payment, so the
 * order's real status is checked (it is set by PayTR's server callback). The cart
 * is cleared only once the order is paid; a failed payment goes to the failure
 * page; a callback still in flight is shown as "being processed".
 */
/**
 * GA4 purchase, sent once per order with the cart that was paid for (read just
 * before the cart is cleared; after a reload the cart is empty, so nothing repeats).
 */
function trackPurchase(orderNumber: string) {
  const { items, coupon, discountAmount } = useCartStore.getState()
  trackItems(
    'purchase',
    items.map((i) => ({ id: i.productId, sku: i.sku, name: i.name, price: i.price, quantity: i.quantity, variant: i.variantLabel })),
    { transaction_id: orderNumber, ...(coupon ? { coupon: coupon.code, discount: discountAmount } : {}) }
  )
}

export default function BasariliClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderNumber = searchParams.get('order') || ''
  const { clearCart } = useCartStore()
  const { token } = useAuthStore()

  const [phase, setPhase] = useState<Phase>('checking')
  const [totalAmount, setTotalAmount] = useState<number | null>(null)

  useEffect(() => {
    if (!orderNumber) return
    const order = encodeURIComponent(orderNumber)
    let stopped = false
    let attempts = 0

    const check = async () => {
      attempts++
      try {
        const res = await fetch(`/api/payments/status?order=${order}`, { cache: 'no-store' })
        const data = await res.json()
        if (stopped) return
        if (data.success && PAID.has(data.status)) {
          stopped = true
          trackPurchase(orderNumber)
          clearCart()
          setPhase('paid')
          return
        }
        if (data.success && data.status === 'PAYMENT_FAILED') {
          stopped = true
          router.replace(`/odeme/basarisiz?order=${order}`)
          return
        }
      } catch {
        // network hiccup; retry below
      }
      // Give PayTR's callback up to ~90s, then say the payment is still processing.
      if (attempts >= 30) {
        stopped = true
        setPhase('pending')
        return
      }
      setTimeout(check, 3000)
    }

    check()
    return () => {
      stopped = true
    }
  }, [orderNumber, clearCart, router])

  // Order total for signed-in customers (guests see the status only).
  useEffect(() => {
    if (phase !== 'paid' || !orderNumber || !token) return
    fetch(`/api/orders/${encodeURIComponent(orderNumber)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && typeof data.order?.totalAmount === 'number') setTotalAmount(data.order.totalAmount)
      })
      .catch(() => {})
  }, [phase, orderNumber, token])

  const title =
    phase === 'paid' ? 'sipariş alındı.' : phase === 'pending' ? 'ödemeniz işleniyor.' : 'ödemeniz kontrol ediliyor…'
  const subtitle =
    phase === 'paid'
      ? 'ödemeniz başarıyla doğrulandı ve siparişiniz atölye üretim kuyruğuna alındı.'
      : phase === 'pending'
        ? 'bankanızdan onay bekleniyor. onaylandığında e-posta ile bilgilendirileceksiniz; sepetiniz korunuyor.'
        : 'lütfen bu sayfayı kapatmayın.'

  return (
    <div className={styles.container}>
      <div className={styles.statusIconWrap} aria-hidden="true">
        {phase === 'paid' ? '✓' : '…'}
      </div>

      <h1 className={styles.title} aria-live="polite">{title}</h1>

      <p className={styles.subtitle}>{subtitle}</p>

      {orderNumber && (
        <div className={styles.receiptCard}>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>sipariş numarası</span>
            <span className={styles.receiptOrderNumber}>#{orderNumber}</span>
          </div>

          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>ödeme durumu</span>
            <span className={phase === 'paid' ? styles.statusPaid : undefined}>
              {phase === 'paid' ? 'onaylandı' : phase === 'pending' ? 'işleniyor' : 'kontrol ediliyor'}
            </span>
          </div>

          {phase === 'paid' && (
            <div className={styles.receiptRow}>
              <span className={styles.receiptLabel}>tahmini teslimat</span>
              <span className={styles.deliveryEstimate}>2-3 iş günü içerisinde kargoda</span>
            </div>
          )}

          {totalAmount !== null && (
            <div className={styles.receiptTotalRow}>
              <span className={styles.receiptTotalLabel}>toplam tutar</span>
              <span className={styles.receiptTotalVal}>{formatPrice(totalAmount)}</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.actionsRow}>
        {orderNumber && token && (
          <Link href={`/hesap/siparisler/${orderNumber}`} className={styles.primaryBtn}>
            siparişi görüntüle
          </Link>
        )}
        <Link href="/urunler" className={styles.secondaryBtn}>
          alışverişe devam et
        </Link>
      </div>
    </div>
  )
}
