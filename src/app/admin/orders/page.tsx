'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { formatPrice } from '@/lib/utils'
import {
  getOrderStatusConfig,
  getPaymentStatusConfig,
} from '@/lib/constants/admin-status'
import styles from '../admin.module.css'

interface OrderItem {
  productId: string
  productName: string
  sku?: string
  quantity: number
  unitPrice: number
  totalAmount: number
  imageUrl?: string | null
}

interface AdminOrder {
  id: string
  orderNumber: string
  userId: string
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  totalAmount: number
  subtotal: number
  discountAmount: number
  shippingAmount: number
  customerEmail?: string
  createdAt: string
  channel?: 'DIRECT' | 'TRENDYOL' | 'HEPSIBURADA'
  shippingAddressSnapshot: {
    fullName: string
    phone: string
    city: string
    district: string
    addressLine: string
  }
  items: OrderItem[]
  customerNote?: string | null
  statusHistory?: Array<{
    id: string
    status: string
    note?: string | null
    createdAt: string
    createdBy?: string | null
  }>
}

export default function AdminOrdersPage() {
  const { token } = useAuthStore()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [paymentFilter, setPaymentFilter] = useState('ALL')
  const [channelFilter, setChannelFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [actionLoading, setActionLoading] = useState(false)

  // Modals (UI-16 Global Modal)
  const [quickViewOrder, setQuickViewOrder] = useState<AdminOrder | null>(null)
  const [statusChangeModal, setStatusChangeModal] = useState<{
    isOpen: boolean
    order: AdminOrder | null
    targetStatus: string
    note: string
  }>({
    isOpen: false,
    order: null,
    targetStatus: 'CONFIRMED',
    note: '',
  })
  const [bulkStatusModal, setBulkStatusModal] = useState<{
    isOpen: boolean
    targetStatus: string
    note: string
  }>({
    isOpen: false,
    targetStatus: 'PREPARING',
    note: '',
  })

  const loadOrders = useCallback(() => {
    if (!token) return
    setLoading(true)

    const params = new URLSearchParams()
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    if (paymentFilter !== 'ALL') params.set('paymentStatus', paymentFilter)
    if (channelFilter !== 'ALL') params.set('channel', channelFilter)
    if (search.trim()) params.set('search', search.trim())
    params.set('limit', String(pageSize))
    params.set('offset', String((currentPage - 1) * pageSize))

    fetch(`/api/admin/orders?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.orders)) {
          setOrders(data.orders)
          setTotal(data.total !== undefined ? data.total : data.orders.length)
        } else {
          toast.error(data.error || 'Siparişler yüklenemedi.')
        }
      })
      .catch((err) => {
        console.error(err)
        toast.error('Bağlantı hatası: Siparişler alınamadı.')
      })
      .finally(() => setLoading(false))
  }, [token, statusFilter, paymentFilter, channelFilter, search, currentPage, pageSize])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setCurrentPage(1)
    loadOrders()
  }

  const handleResetFilters = () => {
    setStatusFilter('ALL')
    setPaymentFilter('ALL')
    setChannelFilter('ALL')
    setSearch('')
    setCurrentPage(1)
  }

  // Single Order Status Change via Modal
  const confirmStatusChange = async () => {
    if (!statusChangeModal.order || !token) return
    const orderNumber = statusChangeModal.order.orderNumber
    const targetStatus = statusChangeModal.targetStatus
    const note = statusChangeModal.note.trim() || `Yönetici panelinden '${targetStatus}' durumuna güncellendi.`

    setActionLoading(true)
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
        toast.success(`Sipariş #${orderNumber} '${targetStatus}' olarak güncellendi.`)
        setStatusChangeModal({ isOpen: false, order: null, targetStatus: 'CONFIRMED', note: '' })
        loadOrders()
      } else {
        toast.error(data.error || 'Durum güncellenemedi.')
      }
    } catch {
      toast.error('İşlem sırasında bağlantı hatası oluştu.')
    } finally {
      setActionLoading(false)
    }
  }

  // Bulk Status Change via Modal
  const confirmBulkStatusChange = async () => {
    if (selectedIds.length === 0 || !token) return
    const targetStatus = bulkStatusModal.targetStatus
    const note = bulkStatusModal.note.trim() || `Toplu yönetici güncellemesi: ${targetStatus}`

    setActionLoading(true)
    let successCount = 0
    let failCount = 0

    try {
      await Promise.all(
        selectedIds.map(async (orderNumber) => {
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
            if (data.success) successCount++
            else failCount++
          } catch {
            failCount++
          }
        })
      )

      if (successCount > 0) {
        toast.success(`${successCount} sipariş başarıyla '${targetStatus}' durumuna alındı.`)
      }
      if (failCount > 0) {
        toast.warning(`${failCount} sipariş güncellenemedi (durum geçiş kuralları).`)
      }

      setSelectedIds([])
      setBulkStatusModal({ isOpen: false, targetStatus: 'PREPARING', note: '' })
      loadOrders()
    } catch {
      toast.error('Toplu işlem sırasında hata oluştu.')
    } finally {
      setActionLoading(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === orders.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(orders.map((o) => o.orderNumber))
    }
  }

  const toggleSelect = (orderNumber: string) => {
    setSelectedIds((prev) =>
      prev.includes(orderNumber) ? prev.filter((id) => id !== orderNumber) : [...prev, orderNumber]
    )
  }

  const totalPages = Math.ceil(total / pageSize) || 1
  const startItem = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, total)
  const isFiltered = search !== '' || statusFilter !== 'ALL' || paymentFilter !== 'ALL' || channelFilter !== 'ALL'

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Sipariş Yönetimi</h1>
          <p className={styles.pageSubtitle}>
            Müşteri siparişleri, ödeme doğrulamaları, üretim gereksinimleri ve kargo sevkiyatları.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="/api/admin/export?type=orders"
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            <span>↓</span>
            <span>CSV Dışa Aktar</span>
          </a>
        </div>
      </div>

      {/* Operational Quick Segmented Tabs */}
      <div className={styles.operationalTabs}>
        {[
          { label: 'Tüm Siparişler', status: 'ALL' },
          { label: 'Hazırlanacaklar', status: 'PREPARING' },
          { label: 'Ödeme Bekleyen', status: 'PAYMENT_PENDING' },
          { label: 'Kargoya Verildi', status: 'SHIPPED' },
          { label: 'Teslim Edildi', status: 'DELIVERED' },
          { label: 'İptal Edilenler', status: 'CANCELLED' },
        ].map((tab) => {
          const isActive = statusFilter === tab.status
          return (
            <button
              key={tab.status}
              type="button"
              onClick={() => {
                setStatusFilter(tab.status)
                setCurrentPage(1)
              }}
              className={`${styles.operationalTabItem} ${isActive ? styles.operationalTabItemActive : ''}`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.filterCard}>
        <div className={styles.filterRow}>
          <form onSubmit={handleSearchSubmit} style={{ flex: 2, minWidth: 260, display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Sipariş no, müşteri adı, e-posta veya şehir ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.filterInput}
            />
            <button type="submit" className={`${styles.btn} ${styles.btnSecondary}`}>
              Ara
            </button>
          </form>

          <select
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value)
              setCurrentPage(1)
            }}
            className={styles.filterSelect}
            style={{ flex: 1, minWidth: 160 }}
          >
            <option value="ALL">Tüm Satış Kanalları</option>
            <option value="DIRECT">ZUULAB Direct</option>
            <option value="TRENDYOL">Trendyol</option>
            <option value="HEPSIBURADA">Hepsiburada</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            className={styles.filterSelect}
            style={{ minWidth: 160 }}
          >
            <option value="ALL">Tüm Sipariş Durumları</option>
            <option value="PAYMENT_PENDING">Ödeme Bekliyor</option>
            <option value="CONFIRMED">Onaylandı</option>
            <option value="PREPARING">Hazırlanıyor (Üretim)</option>
            <option value="SHIPPED">Kargoya Verildi</option>
            <option value="DELIVERED">Teslim Edildi</option>
            <option value="CANCELLED">İptal Edildi</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => {
              setPaymentFilter(e.target.value)
              setCurrentPage(1)
            }}
            className={styles.filterSelect}
            style={{ minWidth: 160 }}
          >
            <option value="ALL">Tüm Ödeme Durumları</option>
            <option value="PAID">Ödendi (PAID)</option>
            <option value="PENDING">Beklemede</option>
            <option value="FAILED">Başarısız</option>
          </select>

          {isFiltered && (
            <button
              type="button"
              onClick={handleResetFilters}
              className={`${styles.btn} ${styles.btnGhost}`}
              style={{ fontSize: 12 }}
            >
              Filtreleri Sıfırla
            </button>
          )}
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.length > 0 && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong>{selectedIds.length}</strong> sipariş seçildi
            </span>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setBulkStatusModal({ isOpen: true, targetStatus: 'PREPARING', note: '' })}
                className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              >
                Toplu Hazırla (Atölye)
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setBulkStatusModal({ isOpen: true, targetStatus: 'SHIPPED', note: '' })}
                className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              >
                Toplu Kargoya Ver
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setBulkStatusModal({ isOpen: true, targetStatus: 'CANCELLED', note: '' })}
                className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
              >
                Toplu İptal Et
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Orders Table Card */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedIds.length === orders.length}
                    onChange={toggleSelectAll}
                    aria-label="Tümünü seç"
                  />
                </th>
                <th>Sipariş No</th>
                <th>Kanal</th>
                <th>Müşteri</th>
                <th>Tarih</th>
                <th style={{ textAlign: 'right' }}>Tutar</th>
                <th style={{ textAlign: 'center' }}>Ödeme</th>
                <th style={{ textAlign: 'center' }}>Durum</th>
                <th style={{ textAlign: 'right' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Siparişler yükleniyor...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Kriterlere uygun sipariş bulunamadı.
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const isSelected = selectedIds.includes(o.orderNumber)
                  const orderStatusCfg = getOrderStatusConfig(o.status)
                  const paymentStatusCfg = getPaymentStatusConfig(o.paymentStatus)

                  return (
                    <tr key={o.id} className={isSelected ? styles.tableRowSelected : undefined}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(o.orderNumber)}
                          aria-label={`${o.orderNumber} seç`}
                        />
                      </td>
                      <td>
                        <Link
                          href={`/admin/orders/${o.orderNumber}`}
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            textDecoration: 'none',
                            fontFamily: 'monospace',
                            fontSize: 13,
                          }}
                        >
                          #{o.orderNumber}
                        </Link>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            o.channel === 'TRENDYOL'
                              ? styles.badgeWarning
                              : o.channel === 'HEPSIBURADA'
                              ? styles.badgeWarning
                              : styles.badgeInfo
                          }`}
                        >
                          {o.channel === 'TRENDYOL'
                            ? 'Trendyol'
                            : o.channel === 'HEPSIBURADA'
                            ? 'Hepsiburada'
                            : 'Direct'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {o.shippingAddressSnapshot?.fullName || o.customerEmail || 'Müşteri'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {o.shippingAddressSnapshot?.city
                            ? `${o.shippingAddressSnapshot.district ? `${o.shippingAddressSnapshot.district}, ` : ''}${o.shippingAddressSnapshot.city}`
                            : '—'}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(o.createdAt).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(o.totalAmount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`${styles.badge} ${styles[paymentStatusCfg.badgeClass] || styles.badgeNeutral}`}>
                          {paymentStatusCfg.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`${styles.badge} ${styles[orderStatusCfg.badgeClass] || styles.badgeNeutral}`}>
                          {orderStatusCfg.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setQuickViewOrder(o)}
                            className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                            title="Hızlı Önizleme"
                          >
                            Özet
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setStatusChangeModal({
                                isOpen: true,
                                order: o,
                                targetStatus: o.status,
                                note: '',
                              })
                            }
                            className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                            title="Durumu Güncelle"
                          >
                            Durum
                          </button>
                          <Link
                            href={`/admin/orders/${o.orderNumber}`}
                            className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                          >
                            Detay →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className={styles.paginationBar}>
          <div>
            Toplam <strong>{total}</strong> siparişten <strong>{startItem} - {endItem}</strong> arası gösteriliyor
          </div>

          <div className={styles.paginationActions}>
            <button
              type="button"
              className={styles.pageNavBtn}
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              ← Önceki
            </button>

            <span style={{ fontSize: 12, padding: '0 8px', color: 'var(--text-secondary)' }}>
              Sayfa {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              className={styles.pageNavBtn}
              disabled={currentPage >= totalPages || loading}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Sonraki →
            </button>
          </div>
        </div>
      </div>

      {/* ── UI-16 Global Modal: Single Order Status Change ── */}
      <Modal
        isOpen={statusChangeModal.isOpen}
        onClose={() => setStatusChangeModal({ isOpen: false, order: null, targetStatus: 'CONFIRMED', note: '' })}
        ariaLabel="Sipariş Durumu Güncelleme"
        maxWidth={480}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Sipariş Durumunu Değiştir
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
            #{statusChangeModal.order?.orderNumber} numaralı siparişin operasyonel durumunu güncelleyin.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Yeni Durum *</label>
              <select
                value={statusChangeModal.targetStatus}
                onChange={(e) =>
                  setStatusChangeModal((prev) => ({ ...prev, targetStatus: e.target.value }))
                }
                className={styles.formSelect}
              >
                <option value="CONFIRMED">Onaylandı (CONFIRMED)</option>
                <option value="PREPARING">Hazırlanıyor / Atölye (PREPARING)</option>
                <option value="IN_PRODUCTION">3D Baskıda (IN_PRODUCTION)</option>
                <option value="PACKING">Paketleniyor (PACKING)</option>
                <option value="SHIPPED">Kargoya Verildi (SHIPPED)</option>
                <option value="DELIVERED">Teslim Edildi (DELIVERED)</option>
                <option value="CANCELLED">İptal Edildi (CANCELLED)</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Operasyon Notu (İsteğe Bağlı)</label>
              <input
                type="text"
                placeholder="Örn: Müşteri talebiyle kargoya verildi"
                value={statusChangeModal.note}
                onChange={(e) =>
                  setStatusChangeModal((prev) => ({ ...prev, note: e.target.value }))
                }
                className={styles.formInput}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() =>
                setStatusChangeModal({ isOpen: false, order: null, targetStatus: 'CONFIRMED', note: '' })
              }
              disabled={actionLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${
                statusChangeModal.targetStatus === 'CANCELLED' ? styles.btnDanger : styles.btnPrimary
              }`}
              onClick={confirmStatusChange}
              disabled={actionLoading}
            >
              {actionLoading ? 'Kaydediliyor...' : 'Durumu Güncelle'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── UI-16 Global Modal: Bulk Status Change ── */}
      <Modal
        isOpen={bulkStatusModal.isOpen}
        onClose={() => setBulkStatusModal({ isOpen: false, targetStatus: 'PREPARING', note: '' })}
        ariaLabel="Toplu Sipariş Durum Değişikliği"
        maxWidth={480}
      >
        <div style={{ padding: '8px 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Toplu Sipariş Güncelleme
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Seçilen <strong>{selectedIds.length}</strong> adet siparişin durumunu toplu olarak güncelleyin.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Hedef Durum *</label>
              <select
                value={bulkStatusModal.targetStatus}
                onChange={(e) => setBulkStatusModal((prev) => ({ ...prev, targetStatus: e.target.value }))}
                className={styles.formSelect}
              >
                <option value="PREPARING">Hazırlanıyor (PREPARING)</option>
                <option value="IN_PRODUCTION">3D Baskıda (IN_PRODUCTION)</option>
                <option value="PACKING">Paketleniyor (PACKING)</option>
                <option value="SHIPPED">Kargoya Verildi (SHIPPED)</option>
                <option value="DELIVERED">Teslim Edildi (DELIVERED)</option>
                <option value="CANCELLED">İptal Edildi (CANCELLED)</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Toplu İşlem Notu</label>
              <input
                type="text"
                placeholder="Örn: Toplu sevkiyat yapıldı"
                value={bulkStatusModal.note}
                onChange={(e) => setBulkStatusModal((prev) => ({ ...prev, note: e.target.value }))}
                className={styles.formInput}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => setBulkStatusModal({ isOpen: false, targetStatus: 'PREPARING', note: '' })}
              disabled={actionLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={`${styles.btn} ${
                bulkStatusModal.targetStatus === 'CANCELLED' ? styles.btnDanger : styles.btnPrimary
              }`}
              onClick={confirmBulkStatusChange}
              disabled={actionLoading}
            >
              {actionLoading ? 'İşleniyor...' : 'Toplu Güncelle'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── UI-16 Global Modal: Quick View Order ── */}
      <Modal
        isOpen={Boolean(quickViewOrder)}
        onClose={() => setQuickViewOrder(null)}
        ariaLabel="Sipariş Hızlı Önizleme"
        maxWidth={580}
      >
        {quickViewOrder && (
          <div style={{ padding: '8px 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, fontFamily: 'monospace' }}>
                #{quickViewOrder.orderNumber}
              </h3>
              <span className={`${styles.badge} ${styles[getOrderStatusConfig(quickViewOrder.status).badgeClass]}`}>
                {getOrderStatusConfig(quickViewOrder.status).label}
              </span>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              <div><strong>Alıcı:</strong> {quickViewOrder.shippingAddressSnapshot?.fullName}</div>
              <div><strong>Şehir:</strong> {quickViewOrder.shippingAddressSnapshot?.district}, {quickViewOrder.shippingAddressSnapshot?.city}</div>
              <div><strong>İletişim:</strong> {quickViewOrder.shippingAddressSnapshot?.phone}</div>
              {quickViewOrder.customerNote && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-xs)', fontSize: 12, color: 'var(--text-primary)' }}>
                  <strong>Müşteri Notu:</strong> {quickViewOrder.customerNote}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                Ürünler ({quickViewOrder.items?.length || 0})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {quickViewOrder.items?.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--surface-1)', borderRadius: 'var(--radius-xs)', fontSize: 13 }}>
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.productName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>SKU: {item.sku || '—'} · {item.quantity} Adet</div>
                    </div>
                    <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {formatPrice(item.totalAmount || item.unitPrice * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Toplam: {formatPrice(quickViewOrder.totalAmount)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={() => setQuickViewOrder(null)}
                >
                  Kapat
                </button>
                <Link
                  href={`/admin/orders/${quickViewOrder.orderNumber}`}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
                  Detaylı Yönetim Sayfası →
                </Link>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
