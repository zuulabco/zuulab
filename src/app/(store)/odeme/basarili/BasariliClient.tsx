'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import { formatPrice } from '@/lib/utils'
import styles from './Basarili.module.css'

export default function BasariliClient() {
  const searchParams = useSearchParams()
  const orderNumber = searchParams.get('order') || ''
  const { clearCart } = useCartStore()
  const { token } = useAuthStore()

  const [order, setOrder] = useState<any | null>(null)
  const [, setLoading] = useState(true)

  useEffect(() => {
    // Clear cart immediately on successful payment
    clearCart()

    if (orderNumber) {
      fetch(`/api/orders/${orderNumber}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setOrder(data.order)
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [orderNumber, clearCart, token])

  return (
    <div className={styles.container}>
      <div className={styles.statusIconWrap} aria-hidden="true">
        ✓
      </div>

      <h1 className={styles.title}>sipariş alındı.</h1>

      <p className={styles.subtitle}>
        ödemeniz başarıyla doğrulandı ve siparişiniz atölye üretim kuyruğuna alındı.
      </p>

      {orderNumber && (
        <div className={styles.receiptCard}>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>sipariş numarası</span>
            <span className={styles.receiptOrderNumber}>#{orderNumber}</span>
          </div>

          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>ödeme durumu</span>
            <span className={styles.statusPaid}>onaylandı</span>
          </div>

          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>tahmini teslimat</span>
            <span className={styles.deliveryEstimate}>2-3 iş günü içerisinde kargoda</span>
          </div>

          {order && (
            <div className={styles.receiptTotalRow}>
              <span className={styles.receiptTotalLabel}>toplam tutar</span>
              <span className={styles.receiptTotalVal}>
                {formatPrice(order.totalAmount)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className={styles.actionsRow}>
        {orderNumber && (
          <Link
            href={`/hesap/siparisler/${orderNumber}`}
            className={styles.primaryBtn}
          >
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
