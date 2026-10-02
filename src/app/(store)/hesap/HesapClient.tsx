'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { DASHBOARD_URL } from '@/lib/config/urls'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { formatPrice } from '@/lib/utils'
import AccountNav from '@/components/account/AccountNav'
import Modal from '@/components/common/Modal'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import styles from './Hesap.module.css'

interface OrderSummary {
  id: string
  orderNumber: string
  status: string
  createdAt: string
  total: number
  itemCount?: number
  items?: Array<{ id: string; quantity: number }>
}

export default function HesapClient() {
  const router = useRouter()
  const { user, token, logout, openAuthModal, devLogin } = useAuthStore()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [favoriteCount, setFavoriteCount] = useState<number>(0)
  const [addressCount, setAddressCount] = useState<number>(0)
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!token) return

    // Fetch orders
    fetch('/api/orders', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.orders)) {
          setOrders(data.orders)
        }
      })
      .catch(() => {})

    // Fetch favorites
    fetch('/api/favorites', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.favorites)) {
          setFavoriteCount(data.favorites.length)
        } else if (data.success && Array.isArray(data.productIds)) {
          setFavoriteCount(data.productIds.length)
        }
      })
      .catch(() => {})

    // Fetch addresses
    fetch('/api/account/addresses', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.addresses)) {
          setAddressCount(data.addresses.length)
        }
      })
      .catch(() => {})
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
          <button
            type="button"
            className={styles.primaryCtaBtn}
            onClick={() => openAuthModal()}
          >
            giriş yap / kayıt ol
          </button>
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={() => devLogin('CUSTOMER')}
          >
            örnek müşteri ile dene
          </button>
        </div>
      </div>
    )
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
  const latestOrder = orders.length > 0 ? orders[0] : null
  const latestOrderItemsCount = latestOrder?.items?.reduce((sum, it) => sum + it.quantity, 0) || latestOrder?.itemCount || 1

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PAYMENT_PENDING':
        return 'ödeme bekleniyor'
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
    <div className={styles.hesapPage}>
      {/* Editorial Header */}
      <header className={styles.accountHeader}>
        <div>
          <span className={styles.eyebrow}>zuulab / hesabım</span>
          <h1 className={styles.userGreeting}>
            merhaba, {user.name || user.email.split('@')[0]}
          </h1>
          <p className={styles.userEmail}>
            siparişlerini ve hesap bilgilerini buradan yönetebilirsin.
          </p>
        </div>

        <div className={styles.headerActions}>
          {isAdmin && (
            <a href={DASHBOARD_URL} className={styles.adminBtn}>
              yönetim paneli →
            </a>
          )}
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={() => setLogoutModalOpen(true)}
          >
            çıkış yap
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className={styles.accountGrid}>
        <aside>
          <AccountNav
            orderCount={orders.length}
            favoriteCount={favoriteCount}
          />
        </aside>

        <main className={styles.accountContent}>
          {/* Quick Metrics */}
          <div className={styles.overviewStatsRow}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>toplam sipariş</span>
              <span className={styles.statValue}>{orders.length}</span>
            </div>

            <div className={styles.statItem}>
              <span className={styles.statLabel}>kayıtlı favoriler</span>
              <span className={styles.statValue}>{favoriteCount}</span>
            </div>

            <div className={styles.statItem}>
              <span className={styles.statLabel}>kayıtlı adresler</span>
              <span className={styles.statValue}>{addressCount}</span>
            </div>
          </div>

          {/* Latest Order Card (if exists) */}
          {latestOrder ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
                <h2 className={styles.sectionTitle}>son siparişin</h2>
                <Link href="/hesap/siparisler" className={styles.viewOrderBtn}>
                  tüm siparişler ({orders.length}) →
                </Link>
              </div>

              <div className={styles.latestOrderCard}>
                <div className={styles.orderHeaderRow}>
                  <div className={styles.orderNumWrap}>
                    <span className={styles.orderNumber}>#{latestOrder.orderNumber}</span>
                    <span className={styles.orderDate}>
                      {new Date(latestOrder.createdAt).toLocaleDateString('tr-TR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  <span className={`${styles.orderStatusBadge} ${getStatusClass(latestOrder.status)}`}>
                    {getStatusLabel(latestOrder.status)}
                  </span>
                </div>

                <div className={styles.orderPreviewRow}>
                  <span>{latestOrderItemsCount} adet ürün</span>
                  <span className={styles.orderPrice}>{formatPrice(latestOrder.total)}</span>
                </div>

                <div className={styles.orderFooterRow}>
                  <Link
                    href={`/hesap/siparisler/${latestOrder.orderNumber}`}
                    className={styles.viewOrderBtn}
                  >
                    siparişi görüntüle →
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.activityCard}>
              <h2 className={styles.sectionTitle}>hoş geldiniz</h2>
              <p className={styles.activityText}>
                zuulab koleksiyonundaki özel 3d tasarım objelerini ve fonksiyonel masa aksesuarlarını keşfederek ilk siparişinizi verebilirsiniz.
              </p>
              <div className={styles.activityActions}>
                <Link href="/urunler" className={styles.primaryCtaBtn}>
                  ürünleri keşfet
                </Link>
              </div>
            </div>
          )}

          {/* Workshop Guarantee Note */}
          <div className={styles.activityCard}>
            <p className={styles.activityText}>
              tüm siparişleriniz istanbul atölyemizde hassas 3d üretimle hazırlanır ve hasarsız teslimat güvencesiyle özel koruma paketinde sevk edilir.
            </p>
          </div>
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      <Modal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        maxWidth="420px"
        ariaLabel="Oturumu Kapatma Onayı"
      >
        <div style={{ padding: 'var(--sp-2) 0' }}>
          <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-medium)', margin: '0 0 var(--sp-2) 0', color: 'var(--text-primary)' }}>
            oturumu kapat
          </h3>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '0 0 var(--sp-6) 0', lineHeight: 1.5 }}>
            hesabınızdan çıkış yapmak istediğinize emin misiniz?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)' }}>
            <button
              type="button"
              onClick={() => setLogoutModalOpen(false)}
              className={styles.secondaryActionBtn}
            >
              vazgeç
            </button>
            <button
              type="button"
              onClick={async () => {
                setLogoutModalOpen(false)
                await logout()
                toast.info('Oturum kapatıldı.')
                router.push('/')
              }}
              className={styles.secondaryActionBtn}
              style={{ background: 'var(--text-primary)', color: 'var(--surface-0)' }}
            >
              çıkış yap
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
