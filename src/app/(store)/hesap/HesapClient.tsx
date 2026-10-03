'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { DASHBOARD_URL } from '@/lib/config/urls'
import { useAuthStore } from '@/store/authStore'
import { formatPrice } from '@/lib/utils'
import AccountNav from '@/components/account/AccountNav'
import AccountHeader from '@/components/account/AccountHeader'
import AccountIcon, { type AccountIconName } from '@/components/account/AccountIcon'
import { OrderStatusBadge, OrderTrack } from '@/components/account/OrderStatus'
import { customerOrderStatus } from '@/components/account/order-status'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import { Skeleton } from '@/components/common/Skeleton'
import styles from './Hesap.module.css'

// Shape of StoredOrder returned by /api/orders (src/lib/services/orders.service.ts).
interface OrderSummary {
  id: string
  orderNumber: string
  status: string
  createdAt: string
  totalAmount: number
  itemCount?: number
  items?: Array<{ id: string; quantity: number; productName?: string }>
}

interface Counts {
  orders: number
  favorites: number
  addresses: number
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })

export default function HesapClient() {
  const { user, token, openAuthModal, devLogin } = useAuthStore()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!token) return
    const auth = { headers: { Authorization: `Bearer ${token}` } }
    const get = (url: string) =>
      fetch(url, auth)
        .then((res) => res.json())
        .catch(() => ({}))

    Promise.all([get('/api/orders'), get('/api/favorites'), get('/api/account/addresses')]).then(([o, f, a]) => {
      const list: OrderSummary[] = o.success && Array.isArray(o.orders) ? o.orders : []
      setOrders(list)
      setCounts({
        orders: list.length,
        favorites: Array.isArray(f.favorites) ? f.favorites.length : Array.isArray(f.productIds) ? f.productIds.length : 0,
        addresses: Array.isArray(a.addresses) ? a.addresses.length : 0,
      })
    })
  }, [token])

  if (!mounted) return null

  if (!user) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyMascotWrap}>
          <ZuuMascotIcon />
        </div>
        <h2 className={styles.emptyStateTitle}>hesabınıza giriş yapın</h2>
        <p className={styles.emptyStateDesc}>
          siparişlerinizi takip etmek, favorilerinizi kaydetmek ve teslimat adreslerinizi yönetmek için lütfen giriş yapın.
        </p>
        <div className={styles.emptyActions}>
          <button type="button" className={styles.primaryCtaBtn} onClick={() => openAuthModal()}>
            giriş yap / kayıt ol
          </button>
          {/* Sample login only works against a dev server; production rejects the token. */}
          {process.env.NODE_ENV !== 'production' && (
            <button type="button" className={styles.secondaryActionBtn} onClick={() => devLogin('CUSTOMER')}>
              örnek müşteri ile dene
            </button>
          )}
        </div>
      </div>
    )
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
  const firstName = (user.name || user.email.split('@')[0]).split(' ')[0]
  const latestOrder = orders[0] ?? null
  const activeOrders = orders.filter((o) => {
    const step = customerOrderStatus(o.status).step
    return step !== null && step < 3
  }).length

  const shortcuts: Array<{ href: string; icon: AccountIconName; title: string; meta: string }> = counts
    ? [
        {
          href: '/hesap/siparisler',
          icon: 'orders',
          title: 'siparişlerim',
          meta:
            counts.orders === 0
              ? 'henüz sipariş yok'
              : activeOrders > 0
                ? `${activeOrders} sipariş yolda · toplam ${counts.orders}`
                : `${counts.orders} sipariş`,
        },
        {
          href: '/hesap/favoriler',
          icon: 'heart',
          title: 'favorilerim',
          meta: counts.favorites === 0 ? 'beğendiklerini kalple kaydet' : `${counts.favorites} ürün kayıtlı`,
        },
        {
          href: '/hesap/adresler',
          icon: 'address',
          title: 'adreslerim',
          meta: counts.addresses === 0 ? 'ödemeyi hızlandırmak için adres ekle' : `${counts.addresses} kayıtlı adres`,
        },
        { href: '/hesap/destek', icon: 'support', title: 'destek', meta: 'bir sorun mu var? bize yaz' },
      ]
    : []

  return (
    <div className={styles.hesapPage}>
      <AccountHeader
        title={`merhaba, ${firstName.toLocaleLowerCase('tr-TR')}`}
        description="siparişlerini takip et, adreslerini ve favorilerini tek yerden yönet."
        actions={
          isAdmin ? (
            <a href={DASHBOARD_URL} className={styles.adminBtn}>
              yönetim paneli
            </a>
          ) : undefined
        }
      />

      <div className={styles.accountGrid}>
        <aside>
          <AccountNav />
        </aside>

        <main className={styles.accountContent}>
          {/* Latest order */}
          <section aria-labelledby="latest-order-title">
            <div className={styles.sectionHead}>
              <h2 id="latest-order-title" className={styles.sectionTitle}>
                son siparişin
              </h2>
              {orders.length > 1 && (
                <Link href="/hesap/siparisler" className={styles.textLink}>
                  tümünü gör
                </Link>
              )}
            </div>

            {!counts ? (
              <div className={styles.latestOrderCard} aria-busy="true" aria-label="Siparişler yükleniyor">
                <Skeleton width="40%" height={16} />
                <Skeleton width="100%" height={10} />
                <Skeleton width="30%" height={14} />
              </div>
            ) : latestOrder ? (
              <Link href={`/hesap/siparisler/${latestOrder.orderNumber}`} className={`${styles.latestOrderCard} ${styles.cardLink}`}>
                <div className={styles.orderHeaderRow}>
                  <div className={styles.orderNumWrap}>
                    <span className={styles.orderNumber}>sipariş #{latestOrder.orderNumber}</span>
                    <span className={styles.orderDate}>{formatDate(latestOrder.createdAt)}</span>
                  </div>
                  <OrderStatusBadge status={latestOrder.status} />
                </div>

                <OrderTrack status={latestOrder.status} />

                {customerOrderStatus(latestOrder.status).hint && (
                  <p className={styles.orderHint}>{customerOrderStatus(latestOrder.status).hint}</p>
                )}

                <div className={styles.orderPreviewRow}>
                  <span>
                    {latestOrder.items?.reduce((sum, it) => sum + it.quantity, 0) || latestOrder.itemCount || 1} ürün
                  </span>
                  <span className={styles.orderPrice}>{formatPrice(latestOrder.totalAmount)}</span>
                </div>

                <span className={styles.cardCta}>
                  siparişi görüntüle
                  <AccountIcon name="arrow" size={16} />
                </span>
              </Link>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyMascotWrap}>
                  <ZuuMascotIcon />
                </div>
                <h2 className={styles.emptyStateTitle}>henüz bir sipariş yok.</h2>
                <p className={styles.emptyStateDesc}>atölyeden sana doğru yola çıkacak ilk parçayı bekliyoruz.</p>
                <div className={styles.emptyActions}>
                  <Link href="/urunler" className={styles.primaryCtaBtn}>
                    ürünleri keşfet
                  </Link>
                </div>
              </div>
            )}
          </section>

          {/* Shortcuts */}
          <section aria-labelledby="shortcuts-title">
            <div className={styles.sectionHead}>
              <h2 id="shortcuts-title" className={styles.sectionTitle}>
                hızlı erişim
              </h2>
            </div>
            <div className={styles.shortcutGrid}>
              {counts
                ? shortcuts.map((s) => (
                    <Link key={s.href} href={s.href} className={styles.shortcut}>
                      <span className={styles.shortcutIcon}>
                        <AccountIcon name={s.icon} size={20} />
                      </span>
                      <span className={styles.shortcutText}>
                        <span className={styles.shortcutTitle}>{s.title}</span>
                        <span className={styles.shortcutMeta}>{s.meta}</span>
                      </span>
                      <span className={styles.shortcutArrow}>
                        <AccountIcon name="arrow" size={16} />
                      </span>
                    </Link>
                  ))
                : Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={styles.shortcut} aria-hidden="true">
                      <Skeleton width={40} height={40} />
                      <span className={styles.shortcutText}>
                        <Skeleton width="50%" height={13} />
                        <Skeleton width="70%" height={11} />
                      </span>
                    </div>
                  ))}
            </div>
          </section>

          <p className={styles.footNote}>
            tüm siparişleriniz atölyemizde 3d baskıyla hazırlanır ve özenle paketlenerek gönderilir.
          </p>
        </main>
      </div>
    </div>
  )
}
