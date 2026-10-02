'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { useAuthStore } from '@/store/authStore'
import { formatPrice } from '@/lib/utils'
import AccountNav from '@/components/account/AccountNav'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import styles from './Siparisler.module.css'

// Shape of StoredOrder returned by /api/orders (src/lib/services/orders.service.ts).
interface OrderItem {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  totalAmount: number
}

interface Order {
  id: string
  orderNumber: string
  status: string
  createdAt: string
  subtotal: number
  discountAmount: number
  shippingAmount: number
  totalAmount: number
  items: OrderItem[]
}

export default function SiparislerPage() {
  const { user, token, openAuthModal } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    fetch('/api/orders', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.orders)) {
          setOrders(data.orders)
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [token])

  if (!mounted) return null

  if (!user) {
    return (
      <div className="container" style={{ paddingTop: 'var(--sp-8, 32px)', paddingBottom: 'var(--sp-20, 80px)' }}>
        <Breadcrumbs items={[{ label: 'Hesabım', href: '/hesap' }, { label: 'Siparişlerim' }]} />
        <div className={styles.emptyState}>
          <div className={styles.emptyMascotWrap}>
            <ZuuMascotIcon />
          </div>
          <h2 className={styles.emptyTitle}>giriş yapmalısınız</h2>
          <p className={styles.emptyDesc}>siparişlerinizi görüntülemek için lütfen hesabınıza giriş yapın.</p>
          <button
            type="button"
            className={styles.discoverBtn}
            onClick={() => openAuthModal()}
          >
            giriş yap
          </button>
        </div>
      </div>
    )
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PAYMENT_PENDING':
        return 'ödeme bekliyor'
      case 'CONFIRMED':
        return 'onaylandı'
      case 'PREPARING':
      case 'IN_PRODUCTION':
        return 'hazırlanıyor'
      case 'SHIPPED':
        return 'kargoya verildi'
      case 'DELIVERED':
        return 'teslim edildi'
      case 'CANCELLED':
        return 'iptal edildi'
      default:
        return status.toLowerCase()
    }
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'PAYMENT_PENDING':
        return styles.statusPaymentPending
      case 'CONFIRMED':
        return styles.statusConfirmed
      case 'PREPARING':
      case 'IN_PRODUCTION':
      case 'SHIPPED':
        return styles.statusShipped
      case 'DELIVERED':
        return styles.statusDelivered
      case 'CANCELLED':
        return styles.statusCancelled
      default:
        return styles.statusPaymentPending
    }
  }

  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8, 32px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Breadcrumbs items={[{ label: 'Hesabım', href: '/hesap' }, { label: 'Siparişlerim' }]} />

      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>zuulab / siparişler</span>
        <h1 className={styles.pageTitle}>siparişlerim</h1>
      </header>

      <div className={styles.accountGrid}>
        <aside>
          <AccountNav orderCount={orders.length} />
        </aside>

        <main className={styles.mainContent}>
          {loading ? (
            <div className={styles.loadingText}>siparişler yükleniyor...</div>
          ) : orders.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyMascotWrap}>
                <ZuuMascotIcon />
              </div>
              <h2 className={styles.emptyTitle}>henüz bir sipariş yok.</h2>
              <p className={styles.emptyDesc}>
                atölyeden sana doğru yola çıkacak ilk parçayı bekliyoruz.
              </p>
              <Link href="/urunler" className={styles.discoverBtn}>
                ürünleri keşfet
              </Link>
            </div>
          ) : (
            <div className={styles.ordersList}>
              {orders.map((order) => {
                const totalItemsCount = order.items?.reduce((acc, it) => acc + it.quantity, 0) || 1

                return (
                  <article key={order.id} className={styles.orderRow}>
                    <div className={styles.orderRowHeader}>
                      <div className={styles.orderNumberGroup}>
                        <span className={styles.orderNumber}>#{order.orderNumber}</span>
                        <span className={styles.orderDate}>
                          {new Date(order.createdAt).toLocaleDateString('tr-TR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      <span className={`${styles.statusBadge} ${getStatusClass(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>

                    <div className={styles.orderItemsPreview}>
                      {order.items?.map((item) => (
                        <div key={item.id} className={styles.previewItemText}>
                          <span>
                            {item.productName.toLowerCase()}
                            <span className={styles.previewItemQty}>x{item.quantity}</span>
                          </span>
                          <span>{formatPrice(item.totalAmount)}</span>
                        </div>
                      ))}
                    </div>

                    <div className={styles.orderRowFooter}>
                      <span className={styles.orderTotal}>
                        {totalItemsCount} ürün · {formatPrice(order.totalAmount)}
                      </span>

                      <Link
                        href={`/hesap/siparisler/${order.orderNumber}`}
                        className={styles.viewDetailsLink}
                      >
                        <span>siparişi görüntüle</span>
                        <span>→</span>
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
