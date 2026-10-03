'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { useAuthStore } from '@/store/authStore'
import { formatPrice } from '@/lib/utils'
import AccountNav from '@/components/account/AccountNav'
import AccountHeader from '@/components/account/AccountHeader'
import AccountIcon from '@/components/account/AccountIcon'
import { OrderStatusBadge } from '@/components/account/OrderStatus'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import styles from './Siparisler.module.css'
import { SkeletonList } from '@/components/common/Skeleton'

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
    // No token yet: the session is still being restored, keep the skeleton up.
    if (!token) return

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


  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8, 32px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Breadcrumbs items={[{ label: 'Hesabım', href: '/hesap' }, { label: 'Siparişlerim' }]} />

<AccountHeader
        title="siparişlerim"
        description="kargo takibi, fatura ve iade için siparişin üzerine tıkla."
      />

      <div className={styles.accountGrid}>
        <aside>
          <AccountNav orderCount={orders.length} />
        </aside>

        <main className={styles.mainContent}>
          {loading ? (
            <div aria-busy="true" aria-label="Siparişler yükleniyor">
              <SkeletonList rows={3} />
            </div>
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
            <ul className={styles.ordersList}>
              {orders.map((order) => {
                const totalItemsCount = order.items?.reduce((acc, it) => acc + it.quantity, 0) || 1
                const shown = order.items?.slice(0, 3) ?? []
                const hidden = (order.items?.length ?? 0) - shown.length

                return (
                  <li key={order.id}>
                    <Link href={`/hesap/siparisler/${order.orderNumber}`} className={styles.orderRow}>
                      <div className={styles.orderRowHeader}>
                        <div className={styles.orderNumberGroup}>
                          <span className={styles.orderNumber}>sipariş #{order.orderNumber}</span>
                          <span className={styles.orderDate}>
                            {new Date(order.createdAt).toLocaleDateString('tr-TR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        <OrderStatusBadge status={order.status} />
                      </div>

                      <ul className={styles.orderItemsPreview}>
                        {shown.map((item) => (
                          <li key={item.id} className={styles.previewItemText}>
                            <span className={styles.previewItemName}>
                              {item.productName.toLocaleLowerCase('tr-TR')}
                              <span className={styles.previewItemQty}>× {item.quantity}</span>
                            </span>
                            <span className={styles.previewItemPrice}>{formatPrice(item.totalAmount)}</span>
                          </li>
                        ))}
                        {hidden > 0 && <li className={styles.previewItemText}>+ {hidden} ürün daha</li>}
                      </ul>

                      <div className={styles.orderRowFooter}>
                        <span className={styles.orderTotal}>
                          {totalItemsCount} ürün, toplam
                          <strong>{formatPrice(order.totalAmount)}</strong>
                        </span>
                        <span className={styles.viewDetailsLink}>
                          <span>ayrıntılar</span>
                          <AccountIcon name="arrow" size={16} />
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </main>
      </div>
    </div>
  )
}
