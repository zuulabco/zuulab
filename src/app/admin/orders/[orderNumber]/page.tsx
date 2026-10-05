'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { formatPrice } from '@/lib/utils'
import {
  getOrderStatusConfig,
  getPaymentStatusConfig,
  getShipmentStatusConfig,
  getInvoiceStatusConfig,
} from '@/lib/constants/admin-status'
import { carrierDisplayName } from '@/lib/constants/carriers'
import styles from '../../admin.module.css'
import { SkeletonPage } from '@/components/common/Skeleton'

export default function AdminOrderDetailPage() {
  const params = useParams()
  const orderNumber = params.orderNumber as string
  const { token, canFetch, user } = useAuthStore()
  const router = useRouter()

  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Internal Note State
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  // Sürat Kargo tracking number entered by hand
  const [trackingNumber, setTrackingNumber] = useState('')
  const [updatingShipping, setUpdatingShipping] = useState(false)
  const [downloadingLabel, setDownloadingLabel] = useState(false)

  // Invoice State
  const [invoice, setInvoice] = useState<any>(null)
  const [loadingInvoice, setLoadingInvoice] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)

  // Shipping & Fulfillment State
  const [shipment, setShipment] = useState<any>(null)
  const [loadingShipment, setLoadingShipment] = useState(false)
  const [creatingShipment, setCreatingShipment] = useState(false)
  const [syncingShipment, setSyncingShipment] = useState(false)
  const [cancellingShipment, setCancellingShipment] = useState(false)

  // Notifications State
  const [orderNotifications, setOrderNotifications] = useState<any[]>([])
  const [retryingNotificationId, setRetryingNotificationId] = useState<string | null>(null)

  // Modals (UI-16 Global Modal)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [targetStatus, setTargetStatus] = useState('PREPARING')
  const [statusNote, setStatusNote] = useState('')
  const [statusUpdating, setStatusUpdating] = useState(false)

  const [showCancelShipmentModal, setShowCancelShipmentModal] = useState(false)
  const [cancelShipmentReason, setCancelShipmentReason] = useState('Müşteri talebiyle iptal')

  const [showCancelOrderModal, setShowCancelOrderModal] = useState(false)
  // Permanent deletion (Super Admin): the order number has to be typed back
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [cancelOrderReason, setCancelOrderReason] = useState('')
  const [cancellingOrder, setCancellingOrder] = useState(false)

  const loadOrder = useCallback(() => {
    if (!canFetch || !orderNumber) return
    setLoading(true)

    fetch(`/api/admin/orders/${orderNumber}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.order) {
          setOrder(data.order)
        } else {
          setError(data.error || 'Sipariş detayları alınamadı.')
        }
      })
      .catch((err) => setError(err.message || 'Sipariş yüklenirken hata oluştu.'))
      .finally(() => setLoading(false))
  }, [token, canFetch, orderNumber])

  const loadInvoice = useCallback(() => {
    if (!canFetch || !orderNumber) return
    setLoadingInvoice(true)
    fetch(`/api/admin/orders/${orderNumber}/invoice`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setInvoice(data.invoice)
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingInvoice(false))
  }, [token, canFetch, orderNumber])

  const loadShipment = useCallback(() => {
    if (!canFetch || !orderNumber) return
    setLoadingShipment(true)
    fetch(`/api/admin/orders/${orderNumber}/shipping`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.shipment) {
          setShipment(data.shipment)
          setTrackingNumber(data.shipment.trackingNumber || '')
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingShipment(false))
  }, [token, canFetch, orderNumber])

  const loadNotifications = useCallback(() => {
    if (!canFetch || !orderNumber) return
    fetch(`/api/admin/orders/${orderNumber}/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setOrderNotifications(data.notifications || [])
        }
      })
      .catch((err) => console.error(err))
  }, [token, canFetch, orderNumber])

  useEffect(() => {
    loadOrder()
    loadInvoice()
    loadShipment()
    loadNotifications()
  }, [loadOrder, loadInvoice, loadShipment, loadNotifications])

  // Status Change via Modal
  const confirmStatusChange = async () => {
    if (!canFetch) return
    setStatusUpdating(true)
    const note = statusNote.trim() || `Yönetici panelinden '${targetStatus}' durumuna güncellendi.`

    try {
      const res = await fetch(`/api/orders/${orderNumber}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: targetStatus, note }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Sipariş durumu '${targetStatus}' olarak güncellendi.`)
        setShowStatusModal(false)
        setStatusNote('')
        loadOrder()
      } else {
        toast.error(data.error || 'Durum güncellenemedi.')
      }
    } catch {
      toast.error('İşlem sırasında bağlantı hatası oluştu.')
    } finally {
      setStatusUpdating(false)
    }
  }

  // Create Shipment
  const handleCreateShipment = async () => {
    if (!canFetch) return
    setCreatingShipment(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/shipping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packageCount: 1, totalWeightKg: 1 }),
      })
      const data = await res.json()
      if (data.success && data.shipment) {
        setShipment(data.shipment)
        setTrackingNumber(data.shipment.trackingNumber)
        toast.success(`Kargo kaydı oluşturuldu: ${data.shipment.trackingNumber}`)
        loadOrder()
      } else {
        toast.error(data.error || 'Kargo oluşturulamadı.')
      }
    } catch {
      toast.error('Kargo oluşturulurken bağlantı hatası oluştu.')
    } finally {
      setCreatingShipment(false)
    }
  }

  // Sync Tracking
  const handleSyncShipment = async () => {
    if (!canFetch) return
    setSyncingShipment(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/shipping/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (data.success && data.shipment) {
        setShipment(data.shipment)
        toast.success('Kargo durumu taşıyıcı kargo firmasıyla eşitlendi.')
        loadOrder()
      } else {
        toast.error(data.error || 'Kargo güncellemesi başarısız.')
      }
    } catch {
      toast.error('Bağlantı hatası oluştu.')
    } finally {
      setSyncingShipment(false)
    }
  }

  const confirmDeleteOrder = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: deleteConfirm }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Sipariş #${orderNumber} silindi.`)
        router.push('/orders')
      } else {
        toast.error(data.error || 'Sipariş silinemedi.')
      }
    } catch {
      toast.error('Bağlantı hatası oluştu.')
    } finally {
      setDeleting(false)
    }
  }

  // Cancel Shipment via Modal
  const confirmCancelShipment = async () => {
    if (!canFetch) return
    setCancellingShipment(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/shipping/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: cancelShipmentReason }),
      })
      const data = await res.json()
      if (data.success && data.shipment) {
        setShipment(data.shipment)
        toast.success('Kargo gönderisi iptal edildi.')
        setShowCancelShipmentModal(false)
        loadOrder()
      } else {
        toast.error(data.error || 'Kargo iptal edilemedi.')
      }
    } catch {
      toast.error('Bağlantı hatası oluştu.')
    } finally {
      setCancellingShipment(false)
    }
  }

  // Create Invoice
  const handleCreateInvoice = async () => {
    if (!canFetch) return
    setCreatingInvoice(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (data.success && data.invoice) {
        setInvoice(data.invoice)
        toast.success('e-Fatura / e-Arşiv başarıyla oluşturuldu.')
      } else {
        toast.error(data.error || 'Fatura oluşturulamadı.')
      }
    } catch {
      toast.error('Fatura oluşturulurken bağlantı hatası oluştu.')
    } finally {
      setCreatingInvoice(false)
    }
  }

  // Sync Invoice with Uyumsoft
  const handleSyncInvoice = async () => {
    if (!canFetch) return
    setLoadingInvoice(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/invoice`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.invoice) {
        setInvoice(data.invoice)
        toast.success('Fatura durumu Uyumsoft ile senkronize edildi.')
      } else {
        toast.error(data.error || 'Fatura senkronizasyonu başarısız.')
      }
    } catch {
      toast.error('Fatura senkronizasyonunda bağlantı hatası oluştu.')
    } finally {
      setLoadingInvoice(false)
    }
  }

  // Retry failed notification
  const handleRetryNotification = async (notificationId: string) => {
    if (!canFetch) return
    setRetryingNotificationId(notificationId)
    try {
      const res = await fetch(`/api/admin/notifications/${notificationId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Bildirim kuyruğa tekrar eklendi.')
        loadNotifications()
      } else {
        toast.error(data.error || 'Yeniden gönderim başarısız.')
      }
    } catch {
      toast.error('İstek gönderilemedi.')
    } finally {
      setRetryingNotificationId(null)
    }
  }

  // Save Tracking Number
  const handleSaveShipping = async () => {
    if (!canFetch) return
    setUpdatingShipping(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/shipping/manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ trackingNumber }),
      })
      const data = await res.json()
      if (data.success) {
        setShipment(data.shipment)
        toast.success('Sipariş Sürat Kargo ile kargoya verildi; müşteriye takip numarası gönderildi.')
        loadOrder()
      } else {
        toast.error(data.error || 'Kargo bilgisi kaydedilemedi.')
      }
    } catch {
      toast.error('Kargo bilgisi kaydedilirken hata oluştu.')
    } finally {
      setUpdatingShipping(false)
    }
  }

  // Geliver PTT label (PDF), opened in a new tab for printing
  const handleDownloadLabel = async () => {
    if (!canFetch) return
    // Opened before the await so the popup is not blocked
    const win = window.open('', '_blank')
    setDownloadingLabel(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/shipping/label`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok || !res.headers.get('content-type')?.includes('pdf')) {
        const data = await res.json().catch(() => ({}))
        win?.close()
        toast.error(data.error || 'Kargo etiketi alınamadı.')
        return
      }
      const url = URL.createObjectURL(await res.blob())
      if (win) win.location.href = url
      else window.location.href = url
    } catch {
      win?.close()
      toast.error('Kargo etiketi indirilirken bağlantı hatası oluştu.')
    } finally {
      setDownloadingLabel(false)
    }
  }

  // Cancel the order; an open shipment is cancelled with the carrier first
  const confirmCancelOrder = async () => {
    if (!canFetch) return
    setCancellingOrder(true)
    try {
      if (shipment && shipment.status !== 'CANCELLED') {
        const res = await fetch(`/api/admin/orders/${orderNumber}/shipping/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: 'Sipariş iptal edildi.' }),
        })
        const data = await res.json()
        if (!data.success) {
          toast.error(`Kargo kaydı iptal edilemedi, sipariş iptal edilmedi: ${data.error || ''}`)
          return
        }
        setShipment(data.shipment)
      }
      const res = await fetch(`/api/orders/${orderNumber}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'CANCELLED', note: cancelOrderReason.trim() || 'Yönetici panelinden iptal edildi.' }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Sipariş iptal edildi; stok geri alındı ve müşteriye bilgi verildi.')
        setShowCancelOrderModal(false)
        setCancelOrderReason('')
        loadOrder()
      } else {
        toast.error(data.error || 'Sipariş iptal edilemedi.')
      }
    } catch {
      toast.error('İptal sırasında bağlantı hatası oluştu.')
    } finally {
      setCancellingOrder(false)
    }
  }

  // Add Internal Note
  const [confirmingTransfer, setConfirmingTransfer] = useState(false)
  const handleConfirmBankTransfer = async () => {
    if (!canFetch) return
    if (!window.confirm(`#${orderNumber} için havale/EFT ödemesinin hesaba geçtiğini onaylıyor musun? Sipariş onaylanır ve müşteriye e-posta gider.`)) return
    setConfirmingTransfer(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/bank-transfer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.message)
        loadOrder()
      } else {
        toast.error(data.error || 'Ödeme onaylanamadı.')
      }
    } catch {
      toast.error('Ödeme onaylanırken hata oluştu.')
    } finally {
      setConfirmingTransfer(false)
    }
  }

  const handleAddInternalNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch || !newNote.trim()) return

    setAddingNote(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: newNote.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setNewNote('')
        toast.success('Dahili operasyon notu eklendi.')
        loadOrder()
      } else {
        toast.error(data.error || 'Not eklenemedi.')
      }
    } catch {
      toast.error('Not eklenirken hata oluştu.')
    } finally {
      setAddingNote(false)
    }
  }

  if (loading) {
    return (
      <SkeletonPage />
    )
  }

  if (!order) {
    return (
      <div className={styles.formCard} style={{ textAlign: 'center', padding: 40 }}>
        <h2 style={{ fontSize: 16, color: '#dc2626', margin: '0 0 10px' }}>Sipariş Bulunamadı</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          {error || `#${orderNumber} numaralı sipariş sistemde mevcut değil.`}
        </p>
        <Link href="/admin/orders" className={`${styles.btn} ${styles.btnSecondary}`}>
          ← Sipariş Listesine Dön
        </Link>
      </div>
    )
  }

  const orderStatusCfg = getOrderStatusConfig(order.status)
  const paymentStatusCfg = getPaymentStatusConfig(order.paymentStatus)
  const shipmentStatusCfg = getShipmentStatusConfig(shipment?.status || order.fulfillmentStatus)
  const invoiceStatusCfg = getInvoiceStatusConfig(invoice?.status || 'PENDING')
  // Kapıda ödeme ships PTT Kargo through Geliver; card and havale ship Sürat Kargo by hand
  const isCod = order.paymentMethod === 'CASH_ON_DELIVERY'
  const activeShipment = shipment && shipment.status !== 'CANCELLED' ? shipment : null
  const canShip = ['CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING'].includes(order.status)
  const canCancelOrder = ['PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING'].includes(order.status)

  return (
    <div className={styles.pageContainer} style={{ maxWidth: 1160 }}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            <Link href="/admin/orders" style={{ color: 'inherit', textDecoration: 'none' }}>
              ← Sipariş Listesine Dön
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h1 className={styles.pageTitle} style={{ fontFamily: 'monospace' }}>
              #{order.orderNumber}
            </h1>
            <span
              className={`${styles.badge} ${
                order.channel === 'TRENDYOL'
                  ? styles.badgeWarning
                  : order.channel === 'HEPSIBURADA'
                  ? styles.badgeWarning
                  : styles.badgeInfo
              }`}
            >
              {order.channel === 'TRENDYOL'
                ? 'Trendyol'
                : order.channel === 'HEPSIBURADA'
                ? 'Hepsiburada'
                : 'ZUULAB Direct'}
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Oluşturulma: {new Date(order.createdAt).toLocaleString('tr-TR')} · Kanal: {order.channel || 'DIRECT'}
          </p>
        </div>

        {/* Quick Action Button Group */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setTargetStatus(order.status)
              setShowStatusModal(true)
            }}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            Durumu Güncelle
          </button>

          {isCod && !activeShipment && canShip && (
            <button
              type="button"
              disabled={creatingShipment}
              onClick={handleCreateShipment}
              className={`${styles.btn} ${styles.btnSecondary}`}
            >
              {creatingShipment ? 'Etiket oluşturuluyor...' : 'Kargoya Hazırla (PTT etiketi)'}
            </button>
          )}

          {activeShipment?.provider === 'GELIVER' && (
            <button
              type="button"
              disabled={downloadingLabel}
              onClick={handleDownloadLabel}
              className={`${styles.btn} ${styles.btnSecondary}`}
            >
              {downloadingLabel ? 'Etiket açılıyor...' : 'Kargo Etiketini Yazdır'}
            </button>
          )}

          {!invoice && (
            <button
              type="button"
              disabled={creatingInvoice}
              onClick={handleCreateInvoice}
              className={`${styles.btn} ${styles.btnSecondary}`}
            >
              {creatingInvoice ? 'Kesiliyor...' : 'e-Fatura Oluştur'}
            </button>
          )}

          {canCancelOrder && (
            <button
              type="button"
              onClick={() => setShowCancelOrderModal(true)}
              className={`${styles.btn} ${styles.btnDanger}`}
            >
              Siparişi İptal Et
            </button>
          )}
          {user?.role === 'SUPER_ADMIN' && order.channel === 'DIRECT' && (
            <button
              type="button"
              onClick={() => {
                setDeleteConfirm('')
                setShowDeleteModal(true)
              }}
              className={`${styles.btn} ${styles.btnDanger}`}
            >
              Siparişi Sil
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Detail Grid */}
      <div className={styles.detailGrid}>
        {/* Left Column: Products, Shipping, Invoicing, Notes, Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 1. Products in Order */}
          <div className={styles.formCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 className={styles.formCardTitle} style={{ borderBottom: 'none', margin: 0, padding: 0 }}>
                Sipariş Kalemleri ({order.items?.length || 0})
              </h2>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                3D Atölye ve Stok Eşlemesi
              </span>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>Görsel</th>
                    <th>Ürün & SKU</th>
                    <th style={{ textAlign: 'center' }}>Adet</th>
                    <th style={{ textAlign: 'right' }}>Birim Fiyat</th>
                    <th style={{ textAlign: 'right' }}>Toplam</th>
                    <th style={{ textAlign: 'center' }}>Stok / Üretim</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((item: any, idx: number) => {
                    const img = item.imageUrl || '/placeholder.png'
                    const hasShortage = item.hasStockShortage

                    return (
                      <tr key={idx}>
                        <td>
                          <div className={styles.itemThumb}>
                            <Image src={img} alt={item.productName} fill style={{ objectFit: 'cover' }} sizes="44px" />
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {item.productName || item.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {item.sku || '—'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatPrice(item.unitPrice || item.price)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {formatPrice(item.totalAmount || item.total || (item.unitPrice || item.price) * item.quantity)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {hasShortage ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                              <span className={`${styles.badge} ${styles.badgeDanger}`}>
                                Stok Yetersiz ({item.availableStock ?? 0})
                              </span>
                              <Link
                                href={`/admin/production/new?productId=${item.productId}&quantity=${item.quantity}&orderNumber=${order.orderNumber}&priority=HIGH`}
                                className={`${styles.btn} ${styles.btnSm} ${styles.btnWarning || styles.btnSecondary}`}
                                style={{ background: '#fec80f', color: '#000', fontWeight: 700, padding: '2px 6px', fontSize: 10 }}
                              >
                                + 3D Üret
                              </Link>
                            </div>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeSuccess}`}>Stokta Hazır</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Shipping & Delivery Card */}
          <div className={styles.formCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 className={styles.formCardTitle} style={{ borderBottom: 'none', margin: 0, padding: 0 }}>
                Kargo · {isCod ? 'PTT Kargo (kapıda ödeme, Geliver)' : 'Sürat Kargo'}
              </h2>
              <span className={`${styles.badge} ${styles[shipmentStatusCfg.badgeClass] || styles.badgeNeutral}`}>
                {shipmentStatusCfg.label}
              </span>
            </div>

            {activeShipment ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, background: 'var(--surface-1)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Kargo Firması</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {carrierDisplayName(activeShipment.provider)}
                      {activeShipment.provider === 'GELIVER' && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · Geliver</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {activeShipment.provider === 'GELIVER' ? 'Barkod / Takip No' : 'Takip Numarası'}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--zuu-blue)' }}>
                      {activeShipment.trackingNumber || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gönderi Durumu</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{shipmentStatusCfg.label}</div>
                  </div>
                </div>

                {activeShipment.provider === 'GELIVER' && activeShipment.status === 'LABEL_CREATED' && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    PTT etiketi Geliver&apos;de oluşturuldu. Etiketi yazdırıp paketin üzerine yapıştır ve paketi PTT&apos;ye teslim et;
                    PTT paketi kabul edince sipariş otomatik olarak &quot;Kargoya Verildi&quot; olur. Tahsilat ({formatPrice(order.totalAmount)}) teslimatta PTT tarafından yapılır.
                  </p>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {activeShipment.provider === 'GELIVER' && (
                    <>
                      <button
                        type="button"
                        disabled={downloadingLabel}
                        onClick={handleDownloadLabel}
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                      >
                        {downloadingLabel ? 'Etiket açılıyor...' : 'Kargo Etiketini Yazdır (PDF)'}
                      </button>
                      <button
                        type="button"
                        disabled={syncingShipment}
                        onClick={handleSyncShipment}
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                      >
                        {syncingShipment ? 'Eşitleniyor...' : 'Kargo Durumunu Güncelle'}
                      </button>
                    </>
                  )}

                  {activeShipment.trackingUrl && (
                    <a
                      href={activeShipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                    >
                      ↗ {carrierDisplayName(activeShipment.provider)} Takip Sayfası
                    </a>
                  )}

                  {activeShipment.status !== 'DELIVERED' && (
                    <button
                      type="button"
                      onClick={() => setShowCancelShipmentModal(true)}
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                    >
                      Kargo Kaydını İptal Et
                    </button>
                  )}
                </div>
              </div>
            ) : isCod ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Kapıda ödemeli sipariş PTT Kargo ile gider. &quot;Kargoya Hazırla&quot; Geliver&apos;de kapıda ödemeli ({formatPrice(order.totalAmount)}) PTT gönderisini açar
                  ve etiketi oluşturur; gönderi ancak bundan sonra Geliver panelinde görünür.
                </p>
                <div>
                  <button
                    type="button"
                    disabled={creatingShipment || !canShip}
                    onClick={handleCreateShipment}
                    className={`${styles.btn} ${styles.btnPrimary}`}
                  >
                    {creatingShipment ? 'Etiket oluşturuluyor...' : 'Kargoya Hazırla – PTT Etiketi Oluştur'}
                  </button>
                  {!canShip && (
                    <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                      Bu durumdaki sipariş için etiket oluşturulamaz.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Paketi Sürat Kargo&apos;ya teslim ettikten sonra takip numarasını gir. Sipariş &quot;Kargoya Verildi&quot; olur ve müşteriye takip bağlantısıyla e-posta gider.
                </p>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className={styles.formGroup} style={{ flex: 1, minWidth: 200 }}>
                    <label className={styles.formLabel}>Sürat Kargo Takip Numarası</label>
                    <input
                      type="text"
                      placeholder="Örn: 139847192837"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      className={styles.formInput}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={updatingShipping || !canShip || !trackingNumber.trim()}
                    onClick={handleSaveShipping}
                    className={`${styles.btn} ${styles.btnPrimary}`}
                  >
                    {updatingShipping ? 'Kaydediliyor...' : 'Kargoya Verildi Olarak Kaydet'}
                  </button>
                </div>
                {!canShip && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {order.status === 'PAYMENT_PENDING' ? 'Ödeme onaylanınca kargoya verilebilir.' : 'Bu durumdaki sipariş kargoya verilemez.'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 3. Invoice & Fiscal e-Belge Card */}
          <div className={styles.formCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 className={styles.formCardTitle} style={{ borderBottom: 'none', margin: 0, padding: 0 }}>
                e-Fatura / e-Arşiv Belgesi
              </h2>
              <span className={`${styles.badge} ${styles[invoiceStatusCfg.badgeClass] || styles.badgeNeutral}`}>
                {invoiceStatusCfg.label}
              </span>
            </div>

            {invoice ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, background: 'var(--surface-1)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fatura No</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{invoice.invoiceNumber || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Entegratör</div>
                    <div style={{ fontWeight: 600 }}>Uyumsoft WS-Security</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Düzenleme Tarihi</div>
                    <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('tr-TR') : '—'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    disabled={loadingInvoice}
                    onClick={handleSyncInvoice}
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                  >
                    {loadingInvoice ? 'Eşitleniyor...' : 'Uyumsoft Durumunu Sorgula'}
                  </button>

                  <a
                    href={`/api/orders/${orderNumber}/invoice/document?format=pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                  >
                    ↓ Fatura PDF İndir
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Bu siparişe ait henüz e-Fatura/e-Arşiv belgesi düzenlenmedi.
                </p>
                <button
                  type="button"
                  disabled={creatingInvoice}
                  onClick={handleCreateInvoice}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
                  {creatingInvoice ? 'Düzenleniyor...' : '+ Uyumsoft e-Fatura Kes'}
                </button>
              </div>
            )}
          </div>

          {/* 4. Internal Notes & Audit Timeline */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Dahili Notlar & Durum Zaman Çizelgesi</h2>

            {/* Append internal note form */}
            <form onSubmit={handleAddInternalNote} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Bu sipariş için sadece yöneticilerin göreceği bir not ekleyin..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className={styles.formInput}
              />
              <button
                type="submit"
                disabled={addingNote || !newNote.trim()}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                {addingNote ? 'Ekleniyor...' : 'Not Ekle'}
              </button>
            </form>

            {/* Timeline */}
            <div className={styles.timeline}>
              {order.statusHistory?.map((hist: any) => (
                <div key={hist.id} className={styles.timelineItem}>
                  <div className={styles.timelineDot} />
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineHeader}>
                      <span className={styles.timelineStatus}>{hist.status}</span>
                      <span className={styles.timelineTime}>
                        {new Date(hist.createdAt).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {hist.note && <div className={styles.timelineNote}>{hist.note}</div>}
                    {hist.createdBy && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        İşlemi yapan: {hist.createdBy}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Order Overview, Customer, Payment, Financials */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Order Status & Financial Summary Card */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Sipariş Özeti</h2>

            <div className={styles.orderSummaryBox}>
              <div className={styles.summaryRow}>
                <span>Sipariş Durumu:</span>
                <span className={`${styles.badge} ${styles[orderStatusCfg.badgeClass] || styles.badgeNeutral}`}>
                  {orderStatusCfg.label}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>Ödeme Durumu:</span>
                <span className={`${styles.badge} ${styles[paymentStatusCfg.badgeClass] || styles.badgeNeutral}`}>
                  {paymentStatusCfg.label}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>Sevkiyat:</span>
                <span className={`${styles.badge} ${styles[shipmentStatusCfg.badgeClass] || styles.badgeNeutral}`}>
                  {shipmentStatusCfg.label}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>Ara Toplam:</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPrice(order.subtotal || order.totalAmount)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className={styles.summaryRow} style={{ color: '#059669' }}>
                  <span>İndirim (kampanya, kupon, havale):</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>-{formatPrice(order.discountAmount)}</span>
                </div>
              )}
              <div className={styles.summaryRow}>
                <span>Kargo Bedeli:</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {order.shippingAmount > 0 ? formatPrice(order.shippingAmount) : 'Ücretsiz'}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>KDV (%20 Dahil):</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPrice(order.taxAmount || order.totalAmount * 0.2)}</span>
              </div>
              <div className={styles.summaryRowTotal}>
                <span>Genel Toplam:</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--zuu-blue)' }}>
                  {formatPrice(order.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Information Card */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Müşteri & İletişim</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Müşteri Adı</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {order.shippingAddressSnapshot?.fullName || 'Bilinmiyor'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>E-posta</div>
                <div style={{ color: 'var(--text-primary)' }}>{order.customerEmail || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Telefon</div>
                <div style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {order.shippingAddressSnapshot?.phone || '—'}
                </div>
              </div>
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Teslimat Adresi</div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {order.shippingAddressSnapshot?.addressLine}
                  <br />
                  {order.shippingAddressSnapshot?.district}, {order.shippingAddressSnapshot?.city}{' '}
                  {order.shippingAddressSnapshot?.postalCode}
                </div>
              </div>

              {order.customerNote && (
                <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Müşterinin Sipariş Notu:</div>
                  <div style={{ color: 'var(--text-secondary)' }}>"{order.customerNote}"</div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Information Card */}
          <div className={styles.formCard}>
            <h2 className={styles.formCardTitle}>Ödeme Bilgileri</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Ödeme Yöntemi:</span>
                <span style={{ fontWeight: 600 }}>
                  {order.paymentMethod === 'BANK_TRANSFER' ? 'Havale / EFT' : order.paymentMethod === 'CASH_ON_DELIVERY' ? 'Kapıda Ödeme' : 'Kredi / Banka Kartı'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sağlayıcı:</span>
                <span style={{ fontWeight: 600 }}>
                  {order.paymentMethod === 'BANK_TRANSFER' ? 'Banka hesabı' : order.paymentMethod === 'CASH_ON_DELIVERY' ? 'PTT Kargo (Geliver)' : 'PayTR'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Ödeme Durumu:</span>
                <span className={`${styles.badge} ${styles[paymentStatusCfg.badgeClass] || styles.badgeNeutral}`}>
                  {paymentStatusCfg.label}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {order.paidAt ? 'Tahsil Edilen:' : order.paymentMethod === 'CASH_ON_DELIVERY' ? 'Kapıda Tahsil Edilecek:' : 'Beklenen Tutar:'}
                </span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatPrice(order.totalAmount)}</span>
              </div>
              {order.paymentMethod === 'BANK_TRANSFER' && !order.paidAt && ['PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(order.status) && (
                <>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {order.status === 'PAYMENT_FAILED'
                      ? '48 saatlik ödeme süresi doldu; ödeme yine de geldiyse onaylayabilirsin (stok yeniden düşülür).'
                      : `Havale bekleniyor${order.paymentExpiresAt ? ` · son gün ${new Date(order.paymentExpiresAt).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : ''}. Tutar hesabına geçtiğinde onayla.`}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmBankTransfer}
                    disabled={confirmingTransfer}
                    style={{ marginTop: 4 }}
                  >
                    {confirmingTransfer ? 'onaylanıyor…' : 'havale ödemesi geldi'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── UI-16 Global Modal: Order Status Change ── */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        ariaLabel="Sipariş Durumu Güncelle"
        maxWidth={480}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Sipariş Durumunu Güncelle
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
            #{order.orderNumber} numaralı siparişi yeni bir operasyon durumuna geçirin.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Yeni Durum *</label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                className={styles.formSelect}
              >
                <option value="CONFIRMED">Onaylandı (CONFIRMED)</option>
                <option value="PREPARING">Hazırlanıyor (PREPARING)</option>
                <option value="IN_PRODUCTION">3D Baskıda (IN_PRODUCTION)</option>
                <option value="PACKING">Paketleniyor (PACKING)</option>
                <option value="SHIPPED">Kargoya Verildi (SHIPPED)</option>
                <option value="DELIVERED">Teslim Edildi (DELIVERED)</option>
                <option value="CANCELLED">İptal Edildi (CANCELLED)</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>İşlem Gerekçesi / Not</label>
              <input
                type="text"
                placeholder="Örn: Atölye üretimi tamamlandı, sevkiyata verildi."
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                className={styles.formInput}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setShowStatusModal(false)}
              disabled={statusUpdating}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${targetStatus === 'CANCELLED' ? styles.btnDanger : styles.btnPrimary}`}
              onClick={confirmStatusChange}
              disabled={statusUpdating}
            >
              {statusUpdating ? 'Güncelleniyor...' : 'Onayla ve Güncelle'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Cancel Order Confirmation ── */}
      <Modal
        isOpen={showCancelOrderModal}
        onClose={() => setShowCancelOrderModal(false)}
        ariaLabel="Sipariş İptal Onayı"
        maxWidth={480}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#dc2626' }}>
            Siparişi İptal Et
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
            #{order.orderNumber} iptal edilecek: ayrılan stok geri alınır ve müşteriye iptal e-postası gider.
            {activeShipment && ` Açık kargo kaydı (${carrierDisplayName(activeShipment.provider)}) de iptal edilir.`}
            {order.paidAt && ' Ödeme alınmış: iadeyi PayTR / banka üzerinden ayrıca yapman gerekir.'}
          </p>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>İptal Gerekçesi (müşteriye gider)</label>
            <input
              type="text"
              placeholder="Örn: Ürün stokta kalmadı."
              value={cancelOrderReason}
              onChange={(e) => setCancelOrderReason(e.target.value)}
              className={styles.formInput}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setShowCancelOrderModal(false)}
              disabled={cancellingOrder}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={confirmCancelOrder}
              disabled={cancellingOrder}
            >
              {cancellingOrder ? 'İptal Ediliyor...' : 'Evet, Siparişi İptal Et'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} ariaLabel="Siparişi Kalıcı Olarak Sil" maxWidth={480}>
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#dc2626' }}>Siparişi kalıcı olarak sil</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px' }}>
            #{order.orderNumber} ve ona bağlı ödeme, kargo ve e-posta kayıtları <strong>geri alınamaz şekilde silinir</strong>. Ayrılan ya da düşülen stok rafa geri eklenir.
            Müşteriye bir e-posta gitmez. Gerçek bir müşteri siparişiyse bunun yerine “Siparişi İptal Et” kullanın.
          </p>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            Onaylamak için sipariş numarasını yazın: <strong>{order.orderNumber}</strong>
          </label>
          <input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={order.orderNumber}
            autoComplete="off"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" className={styles.btn} onClick={() => setShowDeleteModal(false)} disabled={deleting}>
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={confirmDeleteOrder}
              disabled={deleting || deleteConfirm.trim() !== order.orderNumber}
            >
              {deleting ? 'Siliniyor…' : 'Kalıcı olarak sil'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── UI-16 Global Modal: Cancel Shipment Confirmation ── */}
      <Modal
        isOpen={showCancelShipmentModal}
        onClose={() => setShowCancelShipmentModal(false)}
        ariaLabel="Kargo Gönderisi İptal Onayı"
        maxWidth={480}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#dc2626' }}>
            Kargo Gönderisini İptal Et
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
            Mevcut kargo takip numarası iptal edilecek ve kargo firması entegrasyonu düşürülecektir. Siparişin kendisi silinmez.
          </p>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>İptal Gerekçesi</label>
            <input
              type="text"
              value={cancelShipmentReason}
              onChange={(e) => setCancelShipmentReason(e.target.value)}
              className={styles.formInput}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setShowCancelShipmentModal(false)}
              disabled={cancellingShipment}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={confirmCancelShipment}
              disabled={cancellingShipment}
            >
              {cancellingShipment ? 'İptal Ediliyor...' : 'Evet, Kargo Kaydını İptal Et'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
