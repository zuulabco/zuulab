'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { getMarketplaceOrderStatusConfig, getMappingStatusConfig } from '@/lib/constants/admin-status'
import styles from '../../admin.module.css'

interface MarketplaceOrderItem {
  id: string
  externalLineItemId: string
  externalSku: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  reconciliationStatus?: 'MATCHED' | 'UNMATCHED' | 'PENDING'
  stockStatus?: string
}

interface MarketplaceOrder {
  id: string
  storeId: string
  externalOrderId: string
  externalOrderNumber: string
  status: string
  rawStatus: string
  reconciliationStatus?: 'MATCHED' | 'PARTIALLY_MATCHED' | 'UNMATCHED' | 'ERROR' | 'PENDING'
  customerName: string
  paymentMethod?: string | null
  packageNumber: string | null
  cargoProvider: string | null
  totalAmount: number
  currency: string
  items: MarketplaceOrderItem[]
  unmatchedCount?: number
  orderDate: string
  syncedAt: string
}

interface MarketplaceStore {
  id: string
  name: string
  provider: 'HEPSIBURADA' | 'TRENDYOL'
}

export default function AdminMarketplaceOrdersPage() {
  const { token, canFetch } = useAuthStore()
  const [orders, setOrders] = useState<MarketplaceOrder[]>([])
  const [stores, setStores] = useState<MarketplaceStore[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [selectedProvider, setSelectedProvider] = useState<string>('ALL')
  const [selectedStoreId, setSelectedStoreId] = useState<string>('ALL')
  const [reconciliationFilter, setReconciliationFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Actions
  const [syncingStoreId, setSyncingStoreId] = useState<string | null>(null)
  const [reconciling, setReconciling] = useState(false)
  const [notification, setNotification] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  const loadData = () => {
    if (!canFetch) return
    setLoading(true)

    const params = new URLSearchParams()
    if (selectedProvider !== 'ALL') params.set('provider', selectedProvider)
    if (selectedStoreId !== 'ALL') params.set('storeId', selectedStoreId)
    if (reconciliationFilter !== 'ALL') params.set('reconciliationStatus', reconciliationFilter)
    if (searchQuery.trim()) params.set('orderNumber', searchQuery.trim())

    Promise.all([
      fetch(`/api/admin/marketplaces/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
      fetch('/api/admin/marketplaces/stores', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
    ])
      .then(([ordersData, storesData]) => {
        if (ordersData.success && Array.isArray(ordersData.orders)) {
          setOrders(ordersData.orders)
        }
        if (storesData.success && Array.isArray(storesData.stores)) {
          setStores(storesData.stores)
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [token, canFetch, selectedProvider, selectedStoreId, reconciliationFilter])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loadData()
  }

  const handleManualSync = async (storeId: string) => {
    if (!canFetch) return
    setSyncingStoreId(storeId)
    setNotification(null)

    try {
      const res = await fetch(`/api/admin/marketplaces/stores/${storeId}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()

      if (data.success && data.result) {
        const r = data.result
        setNotification({
          text: `[${r.storeName}] Senkronize edildi: ${r.recordsRead} okundu, ${r.recordsCreated} yeni sipariş eklendi, ${r.unmatched} eşleşmeyen SKU tespit edildi.`,
          type: 'success',
        })
        loadData()
      } else {
        setNotification({
          text: data.error || 'Mağaza senkronizasyonu başarısız oldu.',
          type: 'error',
        })
      }
    } catch (err: any) {
      setNotification({
        text: err.message || 'Senkronizasyon hatası.',
        type: 'error',
      })
    } finally {
      setSyncingStoreId(null)
    }
  }

  const handleReconcileUnmatched = async () => {
    if (!canFetch) return
    setReconciling(true)
    setNotification(null)

    try {
      const res = await fetch('/api/admin/marketplaces/reconcile-unmatched', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storeId: selectedStoreId !== 'ALL' ? selectedStoreId : undefined,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setNotification({
          text: data.message || 'Yeniden eşleştirme tamamlandı.',
          type: 'success',
        })
        loadData()
      } else {
        setNotification({
          text: data.error || 'Yeniden eşleştirme başarısız oldu.',
          type: 'error',
        })
      }
    } catch (err: any) {
      setNotification({
        text: err.message || 'Hata oluştu.',
        type: 'error',
      })
    } finally {
      setReconciling(false)
    }
  }

  const getStoreInfo = (storeId: string) => {
    const s = stores.find((st) => st.id === storeId)
    return s || { name: storeId, provider: 'MARKETPLACE' }
  }

  // Summary counts
  const totalCount = orders.length
  const matchedCount = orders.filter((o) => o.reconciliationStatus === 'MATCHED').length
  const partialCount = orders.filter((o) => o.reconciliationStatus === 'PARTIALLY_MATCHED').length
  const unmatchedCount = orders.filter((o) => o.reconciliationStatus === 'UNMATCHED').length

  return (
    <div className={styles.adminPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Pazaryeri Sipariş Havuzu</h1>
          <p className={styles.pageSubtitle}>
            Hepsiburada ve Trendyol siparişlerinin merkezi normalizasyonu, SKU doğrulaması ve operasyonel durumu
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={handleReconcileUnmatched}
            disabled={reconciling}
          >
            {reconciling ? 'Eşleştiriliyor...' : 'Eşleşmeyenleri Yeniden Eşleştir'}
          </button>
        </div>
      </div>

      {notification && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            backgroundColor:
              notification.type === 'success' ? '#064e3b' : '#7f1d1d',
            color: notification.type === 'success' ? '#a7f3d0' : '#fecaca',
            border: `1px solid ${
              notification.type === 'success' ? '#059669' : '#dc2626'
            }`,
          }}
        >
          {notification.text}
        </div>
      )}

      {/* Metrics Banner */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div className={styles.card} style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Toplam Sipariş
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {totalCount}
          </div>
        </div>

        <div className={styles.card} style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Tam Eşleşen (MATCHED)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {matchedCount}
          </div>
        </div>

        <div className={styles.card} style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Kısmi Eşleşen (PARTIAL)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#d97706', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {partialCount}
          </div>
        </div>

        <div className={styles.card} style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Eşleşmeyen (UNMATCHED)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: unmatchedCount > 0 ? '#dc2626' : 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {unmatchedCount}
          </div>
        </div>
      </div>

      {/* Manual Store Sync Drawer */}
      <div
        style={{
          background: 'var(--surface-0)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          <strong>Mağaza Çekimi (Manual Trigger):</strong> Her mağaza için eşzamanlı kilit korumasıyla sipariş çekimi tetikleyin.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {stores.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => handleManualSync(st.id)}
              disabled={syncingStoreId === st.id}
              className={styles.secondaryButton}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                borderColor: st.provider === 'HEPSIBURADA' ? 'rgba(234, 88, 12, 0.4)' : 'rgba(245, 158, 11, 0.4)',
                color: st.provider === 'HEPSIBURADA' ? '#ea580c' : '#d97706',
              }}
            >
              {syncingStoreId === st.id ? 'Çekiliyor...' : `${st.name} Çek`}
            </button>
          ))}
        </div>
      </div>

      {/* Filters Bar */}
      <div className={styles.filterBar}>
        <select
          value={selectedProvider}
          onChange={(e) => {
            setSelectedProvider(e.target.value)
            setSelectedStoreId('ALL')
          }}
          className={styles.select}
          style={{ width: 'auto', minWidth: '160px' }}
        >
          <option value="ALL">Tüm Sağlayıcılar</option>
          <option value="HEPSIBURADA">Hepsiburada</option>
          <option value="TRENDYOL">Trendyol</option>
        </select>

        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          className={styles.select}
          style={{ width: 'auto', minWidth: '160px' }}
        >
          <option value="ALL">Tüm Mağazalar</option>
          {stores
            .filter((s) => selectedProvider === 'ALL' || s.provider === selectedProvider)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>

        <select
          value={reconciliationFilter}
          onChange={(e) => setReconciliationFilter(e.target.value)}
          className={styles.select}
          style={{ width: 'auto', minWidth: '180px' }}
        >
          <option value="ALL">Tüm Eşleştirme Durumları</option>
          <option value="MATCHED">Eşleşti (MATCHED)</option>
          <option value="PARTIALLY_MATCHED">Kısmi Eşleşti (PARTIALLY_MATCHED)</option>
          <option value="UNMATCHED">Eşleşmedi (UNMATCHED)</option>
        </select>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            placeholder="Sipariş No, Paket No veya SKU ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.secondaryButton}>
            Ara
          </button>
        </form>
      </div>

      {/* Orders Table */}
      <div className={styles.tableCard}>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Pazaryeri siparişleri yükleniyor...
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Filtreleme kriterlerine uygun sipariş bulunamadı.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pazaryeri</th>
                <th>Mağaza</th>
                <th>Harici Sipariş / Paket</th>
                <th>Müşteri</th>
                <th>Ürün</th>
                <th>Tutar</th>
                <th>Sipariş Durumu</th>
                <th>Eşleştirme (Reconciliation)</th>
                <th>Sipariş Tarihi</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((ord) => {
                const storeInfo = getStoreInfo(ord.storeId)
                return (
                  <tr key={ord.id}>
                    <td>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor:
                            storeInfo.provider === 'HEPSIBURADA' ? '#ea580c' : '#f59e0b',
                          color: '#fff',
                        }}
                      >
                        {storeInfo.provider}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {storeInfo.name}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--zuu-blue)' }}>
                        {ord.externalOrderNumber}
                      </div>
                      {ord.packageNumber && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Paket: {ord.packageNumber}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{ord.customerName}</div>
                      {ord.paymentMethod && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          Ödeme: {ord.paymentMethod}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {ord.items.length} kalem
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {ord.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {ord.currency}
                    </td>
                    <td>
                      {(() => {
                        const statusCfg = getMarketplaceOrderStatusConfig(ord.status)
                        return (
                          <div>
                            <span className={`${styles.badge} ${styles[statusCfg.badgeClass] || styles.badgeNeutral}`}>
                              {statusCfg.label}
                            </span>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Raw: {ord.rawStatus}
                            </div>
                          </div>
                        )
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const reconCfg = getMappingStatusConfig(ord.reconciliationStatus || 'PENDING')
                        return (
                          <span className={`${styles.badge} ${styles[reconCfg.badgeClass] || styles.badgeNeutral}`}>
                            {reconCfg.label}
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(ord.orderDate).toLocaleString('tr-TR')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/admin/marketplaces/orders/${ord.id}`}
                        className={styles.secondaryButton}
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                      >
                        Detay Gör
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
