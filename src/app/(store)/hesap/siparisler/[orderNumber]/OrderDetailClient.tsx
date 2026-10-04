'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { formatPrice } from '@/lib/utils'
import { BANK_ACCOUNT, formatIban } from '@/config/company'
import { carrierDisplayName } from '@/lib/constants/carriers'
import Modal from '@/components/common/Modal'
import styles from './OrderDetail.module.css'
import { SkeletonLines, SkeletonList } from '@/components/common/Skeleton'

interface OrderDetail {
  orderNumber: string
  status: string
  paymentStatus: string
  paymentMethod?: 'CARD' | 'BANK_TRANSFER' | 'CASH_ON_DELIVERY'
  paymentExpiresAt?: string | null
  fulfillmentStatus: string
  createdAt: string
  subtotal: number
  discountAmount: number
  shippingAmount: number
  shippingMethod?: string
  totalAmount: number
  couponCode?: string | null
  shippingAddress: {
    fullName: string
    phone: string
    addressLine: string
    city: string
    district: string
    postalCode: string
  }
  billingAddress?: {
    fullName: string
    addressLine: string
    city: string
    district: string
  }
  items: Array<{
    productId: string
    productName: string
    sku: string
    quantity: number
    unitPrice: number
    totalAmount: number
    imageUrl: string | null
    slug?: string
  }>
  statusHistory: Array<{
    id: string
    status: string
    note?: string | null
    createdAt: string
  }>
}

export default function OrderDetailClient() {
  const params = useParams()
  const orderNumber = params.orderNumber as string
  const router = useRouter()
  const { token, user, openAuthModal } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  // Came in logged out (e.g. from an order mail): after logging in, go to the order list
  const arrivedLoggedOut = useRef(false)

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [customerInvoice, setCustomerInvoice] = useState<any>(null)
  const [customerShipping, setCustomerShipping] = useState<any>(null)
  const [orderReturns, setOrderReturns] = useState<any[]>([])
  const [copied, setCopied] = useState(false)

  const loadOrder = () => {
    fetch(`/api/orders/${orderNumber}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((res) => {
        // The saved session has expired: log in again, then go to the order list
        if (res.status === 401) {
          arrivedLoggedOut.current = true
          openAuthModal()
        }
        return res.json()
      })
      .then((data) => {
        if (data.success && data.order) {
          setOrder(data.order)
        } else {
          setError(data.error || 'Sipariş detayları yüklenemedi.')
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))

    // Fetch customer invoice info
    fetch(`/api/orders/${orderNumber}/invoice`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.hasInvoice) {
          setCustomerInvoice(data.invoice)
        }
      })
      .catch(() => {})

    // Fetch customer shipping tracking info
    fetch(`/api/orders/${orderNumber}/shipping`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.hasShipment) {
          setCustomerShipping(data.shipping)
        }
      })
      .catch(() => {})

    // Fetch returns info
    fetch(`/api/orders/${orderNumber}/returns`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.returns)) {
          setOrderReturns(data.returns)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (!user) {
      arrivedLoggedOut.current = true
      openAuthModal()
    } else if (arrivedLoggedOut.current) {
      router.replace('/hesap/siparisler')
    }
  }, [mounted, user, openAuthModal, router])

  useEffect(() => {
    // No token yet: the session is still being restored (or the visitor must log in)
    if (!token || !user) return
    loadOrder()
  }, [orderNumber, token, user])

  const handleConfirmCancel = async () => {
    setCancelling(true)
    try {
      const res = await fetch(`/api/orders/${orderNumber}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: 'Müşteri tarafından panel üzerinden iptal edildi.' }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Siparişiniz başarıyla iptal edildi.')
        setCancelModalOpen(false)
        loadOrder()
      } else {
        toast.error(data.error || 'Sipariş iptal edilemedi.')
      }
    } catch {
      toast.error('İptal işlemi sırasında bir hata oluştu.')
    } finally {
      setCancelling(false)
    }
  }

  const handleCopyTracking = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!mounted) return null

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>giriş yapmalısınız</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          siparişinizi görüntülemek için hesabınıza giriş yapın.
        </p>
        <button type="button" className={styles.backBtn} onClick={() => openAuthModal()}>
          giriş yap
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Sipariş yükleniyor" style={{ padding: 'var(--sp-6) 0' }}>
        <SkeletonLines lines={2} lastWidth="30%" />
        <SkeletonList rows={3} />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>sipariş bulunamadı</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>{error || 'bu sipariş görüntülenemiyor.'}</p>
        <Link href="/hesap/siparisler" className={styles.backBtn}>
          ← siparişlerime dön
        </Link>
      </div>
    )
  }

  // Active step calculation
  const isCod = order.paymentMethod === 'CASH_ON_DELIVERY'
  const afterDelivery = ['DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'PARTIALLY_REFUNDED'].includes(order.status)
  const isShipped = order.status === 'SHIPPED' || afterDelivery
  const isPreparing = ['PREPARING', 'IN_PRODUCTION', 'PACKING'].includes(order.status) || isShipped
  const isConfirmed = order.status === 'CONFIRMED' || order.status === 'PAYMENT_RECEIVED' || isPreparing
  const isPaid = order.paymentStatus === 'PAID' || (!isCod && isConfirmed)
  const isDelivered = afterDelivery
  const isCancelled = order.status === 'CANCELLED'

  // Kapıda ödeme: nothing is paid up front, PTT collects the money at the door
  const timeline: Array<{ key: string; done: boolean; label: string; sub: string }> = isCod
    ? [
        { key: 'confirm', done: isConfirmed, label: isConfirmed ? 'onay alındı' : 'onay bekleniyor', sub: isConfirmed ? 'sipariş onaylandı' : 'onay bekleniyor' },
        { key: 'prepare', done: isPreparing, label: 'hazırlanıyor', sub: '3d atölye üretimi' },
        { key: 'ship', done: isShipped, label: 'kargoya verildi', sub: 'ptt kargo' },
        { key: 'pay', done: isPaid, label: isPaid ? 'ödeme alındı' : 'ödeme bekleniyor', sub: isPaid ? 'kapıda tahsil edildi' : 'kapıda ödenecek' },
        { key: 'deliver', done: isDelivered, label: 'teslim edildi', sub: 'adrese ulaştı' },
      ]
    : [
        { key: 'pay', done: isPaid, label: 'ödeme alındı', sub: isPaid ? 'doğrulandı' : 'bekleniyor' },
        { key: 'prepare', done: isPreparing, label: 'hazırlanıyor', sub: '3d atölye üretimi' },
        { key: 'ship', done: isShipped, label: 'kargoya verildi', sub: 'sevk edildi' },
        { key: 'deliver', done: isDelivered, label: 'teslim edildi', sub: 'adrese ulaştı' },
      ]

  const getStatusBadgeClass = () => {
    if (isDelivered) return styles.statusDelivered
    if (isShipped) return styles.statusShipped
    if (isConfirmed) return styles.statusConfirmed
    if (isCancelled) return styles.statusCancelled
    return styles.statusPaymentPending
  }

  const getStatusText = () => {
    switch (order.status) {
      case 'PAYMENT_PENDING':
        return 'ödeme bekliyor'
      case 'CONFIRMED':
        return 'onaylandı'
      case 'PREPARING':
        return 'hazırlanıyor'
      case 'SHIPPED':
        return 'kargoya verildi'
      case 'DELIVERED':
        return 'teslim edildi'
      case 'CANCELLED':
        return 'iptal edildi'
      default:
        return order.status.toLowerCase()
    }
  }

  return (
    <div className={styles.pageContainer}>
      {/* Editorial Header */}
      <header className={styles.orderHeader}>
        <div>
          <span className={styles.eyebrow}>zuulab / sipariş / #{order.orderNumber}</span>
          <div className={styles.titleRow}>
            <h1 className={styles.orderTitle}>sipariş #{order.orderNumber}</h1>
            <span className={`${styles.statusBadge} ${getStatusBadgeClass()}`}>
              {getStatusText()}
            </span>
          </div>

          <div className={styles.orderDate}>
            {new Date(order.createdAt).toLocaleDateString('tr-TR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>

        <div className={styles.headerActions}>
          {(order.status === 'PAYMENT_PENDING' || order.status === 'CONFIRMED') && (
            <button
              type="button"
              onClick={() => setCancelModalOpen(true)}
              disabled={cancelling}
              className={styles.cancelBtn}
            >
              {cancelling ? 'iptal ediliyor...' : 'siparişi iptal et'}
            </button>
          )}

          {(isDelivered || order.status === 'DELIVERED' || order.fulfillmentStatus === 'DELIVERED') && (
            <Link
              href={`/hesap/siparisler/${order.orderNumber}/iade`}
              className={styles.returnBtn}
            >
              iade / değişim talebi
            </Link>
          )}

          <Link href="/hesap/siparisler" className={styles.backBtn}>
            ← siparişlerime dön
          </Link>
        </div>
      </header>

      {/* Havale/EFT still to be paid: the bank details again */}
      {order.status === 'PAYMENT_PENDING' && order.paymentMethod === 'BANK_TRANSFER' && (
        <section className={styles.transferBox} aria-label="Havale / EFT bilgileri">
          <p className={styles.transferTitle}>ödemen bekleniyor · havale / eft</p>
          <dl className={styles.transferList}>
            <dt>banka</dt>
            <dd>{BANK_ACCOUNT.bank}</dd>
            <dt>alıcı</dt>
            <dd>{BANK_ACCOUNT.holder}</dd>
            <dt>iban</dt>
            <dd className={styles.transferIban}>{formatIban(BANK_ACCOUNT.iban)}</dd>
            <dt>tutar</dt>
            <dd>{formatPrice(order.totalAmount)}</dd>
          </dl>
          <p className={styles.transferNote}>
            {order.paymentExpiresAt
              ? `ürünlerin ${new Date(order.paymentExpiresAt).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} tarihine kadar ayrıldı. `
              : ''}
            ödemen onaylandığında siparişin hazırlanıp kargoya teslim edilecek.
          </p>
        </section>
      )}

      {/* Kapıda ödeme: what is paid, when and to whom */}
      {order.paymentMethod === 'CASH_ON_DELIVERY' && order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED' && (
        <section className={styles.transferBox} aria-label="Kapıda ödeme">
          <p className={styles.transferTitle}>kapıda ödeme · ptt kargo</p>
          <p className={styles.transferNote} style={{ marginTop: 0 }}>
            {formatPrice(order.totalAmount)} tutarını paket size teslim edilirken PTT Kargo görevlisine ödeyeceksiniz.
          </p>
        </section>
      )}

      {/* Return Requests Timeline if active */}
      {orderReturns.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-6)' }}>
          {orderReturns.map((ret: any) => (
            <div key={ret.id || ret.returnNumber} className={styles.returnCard}>
              <div className={styles.returnHeader}>
                <div>
                  <span className={styles.eyebrow}>
                    {ret.type === 'EXCHANGE' ? 'ürün değişimi' : 'iade talebi'}
                  </span>
                  <h3 className={styles.returnTitle}>talep #{ret.returnNumber}</h3>
                </div>

                <span className={styles.statusBadge}>
                  {ret.status === 'REQUESTED' ? 'talep alındı' :
                   ret.status === 'APPROVED' ? 'onaylandı' :
                   ret.status === 'IN_TRANSIT' ? 'kargoda' :
                   ret.status === 'COMPLETED' ? 'tamamlandı' :
                   ret.status === 'REJECTED' ? 'reddedildi' : ret.status.toLowerCase()}
                </span>
              </div>

              {ret.items && ret.items.length > 0 && (
                <ul className={styles.returnItemsUl}>
                  {ret.items.map((it: any, i: number) => (
                    <li key={i}>
                      {it.productName || it.orderItemId} · {it.quantity} adet {it.reason ? `(${it.reason})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Minimal Order Status Timeline */}
      {!isCancelled ? (
        <div className={styles.timelineCard}>
          <div className={`${styles.timelineTrack} ${timeline.length === 5 ? styles.timelineTrackFive : ''}`}>
            {timeline.map((step) => (
              <div key={step.key} className={`${styles.timelineStep} ${!step.done ? styles.timelineStepInactive : ''}`}>
                <span className={styles.timelineDot}>{step.done ? '●' : '○'}</span>
                <span className={styles.timelineStepLabel}>{step.label}</span>
                <span className={styles.timelineStepSub}>{step.sub}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.cancelledBanner}>
          bu sipariş iptal edilmiştir. stok rezervasyonu serbest bırakılmıştır.
        </div>
      )}

      {/* Two Columns: Items & Address Breakdown */}
      <div className={styles.detailGrid}>
        {/* Left: Purchased Items */}
        <section className={styles.itemsSection}>
          <h2 className={styles.sectionHeading}>sipariş edilen ürünler ({order.items.length})</h2>

          <div className={styles.itemsList}>
            {order.items.map((item) => (
              <div key={item.productId} className={styles.itemRow}>
                <div className={styles.itemImageLink}>
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.productName}
                      fill
                      className={styles.itemImage}
                    />
                  ) : (
                    <div className={styles.itemNoImage} />
                  )}
                </div>

                <div className={styles.itemInfo}>
                  <Link
                    href={`/urun/${item.slug || item.productId}`}
                    className={styles.itemName}
                  >
                    {item.productName.toLocaleLowerCase('tr-TR')}
                  </Link>
                  <span className={styles.itemMeta}>
                    sku: {item.sku} · adet: {item.quantity}
                  </span>
                </div>

                <div className={styles.itemPriceCol}>
                  <div className={styles.itemRowTotal}>
                    {formatPrice(item.totalAmount)}
                  </div>
                  <div className={styles.itemUnitCalc}>
                    {item.quantity} x {formatPrice(item.unitPrice)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Payment & Shipping Info */}
        <aside className={styles.sidebarColumn}>
          {/* Price Summary Card */}
          <div className={styles.sidebarCard}>
            <h3 className={styles.cardTitle}>ödeme özeti</h3>

            <div className={styles.priceBreakdown}>
              <div className={styles.priceRow}>
                <span>ara toplam</span>
                <span className={styles.num}>{formatPrice(order.subtotal)}</span>
              </div>

              {order.discountAmount > 0 && (
                <div className={`${styles.priceRow} ${styles.discountRow}`}>
                  <span>indirim {order.couponCode ? `(${order.couponCode})` : ''}</span>
                  <span className={styles.num}>-{formatPrice(order.discountAmount)}</span>
                </div>
              )}

              <div className={styles.priceRow}>
                <span>kargo</span>
                <span className={styles.num}>
                  {order.shippingAmount === 0 ? 'ücretsiz' : formatPrice(order.shippingAmount)}
                </span>
              </div>

              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>toplam</span>
                <span className={styles.totalVal}>{formatPrice(order.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Delivery Address Card */}
          <div className={styles.sidebarCard}>
            <h3 className={styles.cardTitle}>teslimat adresi</h3>
            <div className={styles.addressContent}>
              <div className={styles.addressName}>{order.shippingAddress.fullName}</div>
              <div>{order.shippingAddress.phone}</div>
              <div style={{ marginTop: 4 }}>{order.shippingAddress.addressLine}</div>
              <div>
                {order.shippingAddress.district} / {order.shippingAddress.city}{' '}
                {order.shippingAddress.postalCode}
              </div>
            </div>
          </div>

          {/* Shipping & Tracking Card if available */}
          {customerShipping && (
            <div className={styles.sidebarCard}>
              <h3 className={styles.cardTitle}>kargo takibi</h3>
              <div className={styles.addressContent}>
                <div>
                  <strong>firma:</strong> {carrierDisplayName(customerShipping.provider).toLocaleLowerCase('tr-TR')}
                </div>
                <div>
                  <strong>takip no:</strong>{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{customerShipping.trackingNumber}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyTracking(customerShipping.trackingNumber)}
                    className={styles.copyCodeBtn}
                  >
                    {copied ? 'kopyalandı ✓' : 'kopyala'}
                  </button>
                </div>
                {customerShipping.shippedAt && (
                  <div>
                    <strong>sevk tarihi:</strong> {new Date(customerShipping.shippedAt).toLocaleDateString('tr-TR')}
                  </div>
                )}

                {customerShipping.trackingUrl && (
                  <a
                    href={customerShipping.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.actionLinkBtn}
                  >
                    <span>kargoyu takip et</span>
                    <span>→</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Invoice Card if available */}
          {customerInvoice && customerInvoice.status === 'ISSUED' && (
            <div className={styles.sidebarCard}>
              <h3 className={styles.cardTitle}>resmi fatura</h3>
              <div className={styles.addressContent}>
                <div><strong>fatura no:</strong> {customerInvoice.invoiceNumber}</div>
                {customerInvoice.invoiceDate && (
                  <div><strong>tarih:</strong> {new Date(customerInvoice.invoiceDate).toLocaleDateString('tr-TR')}</div>
                )}
                {customerInvoice.documentUrl && (
                  <a
                    href={customerInvoice.documentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.actionLinkBtn}
                  >
                    <span>faturayı görüntüle (pdf)</span>
                    <span>→</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => {
          if (!cancelling) setCancelModalOpen(false)
        }}
        maxWidth="420px"
        ariaLabel="Siparişi İptal Etme Onayı"
      >
        <div style={{ padding: 'var(--sp-2) 0' }}>
          <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-medium)', margin: '0 0 var(--sp-2) 0', color: 'var(--text-primary)' }}>
            siparişi iptal et
          </h3>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '0 0 var(--sp-6) 0', lineHeight: 1.5 }}>
            #{order.orderNumber} numaralı siparişinizi iptal etmek istediğinize emin misiniz? bu işlem geri alınamaz.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)' }}>
            <button
              type="button"
              disabled={cancelling}
              onClick={() => setCancelModalOpen(false)}
              className={styles.backBtn}
              style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}
            >
              vazgeç
            </button>
            <button
              type="button"
              disabled={cancelling}
              onClick={handleConfirmCancel}
              className={styles.cancelBtn}
              style={{ padding: '8px 16px', background: 'var(--error, #ef4444)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}
            >
              {cancelling ? 'iptal ediliyor...' : 'siparişi iptal et'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
