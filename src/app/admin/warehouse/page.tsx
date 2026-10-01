'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import styles from '../admin.module.css'

interface FulfillmentItem {
  id: string
  orderNumber: string | null
  marketplaceOrderNumber: string | null
  channel: string
  storeId: string | null
  status: string
  priority: number
  shipmentId: string | null
  createdAt: string
  items?: Array<{
    id: string
    sku: string
    productNameSnapshot: string
    orderedQuantity: number
    pickedQuantity: number
    packedQuantity: number
    status: string
  }>
}

interface WarehouseKPIs {
  readyToPick: number
  picking: number
  picked: number
  packing: number
  packed: number
  readyForHandover: number
  handedOver: number
  blocked: number
  total: number
}

export default function AdminWarehousePage() {
  const router = useRouter()
  const { token } = useAuthStore()

  const [fulfillments, setFulfillments] = useState<FulfillmentItem[]>([])
  const [kpis, setKpis] = useState<WarehouseKPIs>({
    readyToPick: 0,
    picking: 0,
    picked: 0,
    packing: 0,
    packed: 0,
    readyForHandover: 0,
    handedOver: 0,
    blocked: 0,
    total: 0,
  })

  const [loading, setLoading] = useState(true)
  const [channelFilter, setChannelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [creatingPickList, setCreatingPickList] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchFulfillments = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (channelFilter) params.set('channel', channelFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (searchQuery) params.set('orderNumber', searchQuery)

      const res = await fetch(`/api/admin/warehouse?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setFulfillments(data.fulfillments || [])
        if (data.kpis) setKpis(data.kpis)
      } else {
        setError(data.error || 'Depo kayıtları alınamadı.')
      }
    } catch {
      setError('Depo servisine ulaşılamadı.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFulfillments()
  }, [token, channelFilter, statusFilter])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchFulfillments()
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === fulfillments.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(fulfillments.map((f) => f.id))
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleCreateBulkPickList = async () => {
    if (selectedIds.length === 0 || !token) return
    setCreatingPickList(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/warehouse/pick-lists', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fulfillmentIds: selectedIds }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(
          `Toplu pick listesi #${data.pickList.pickListNumber} oluşturuldu (${selectedIds.length} sipariş).`
        )
        setSelectedIds([])
        fetchFulfillments()
        router.push('/admin/warehouse/picking')
      } else {
        setError(data.error || 'Pick listesi oluşturulamadı.')
      }
    } catch {
      setError('Pick listesi servisine ulaşılamadı.')
    } finally {
      setCreatingPickList(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'READY_TO_PICK':
        return <span className={`${styles.badge} ${styles.badgeWarning}`}>Hazırlanacak</span>
      case 'PICKING':
        return <span className={`${styles.badge} ${styles.badgeInfo}`}>Toplanıyor</span>
      case 'PICKED':
        return <span className={`${styles.badge} ${styles.badgePrimary}`}>Toplandı</span>
      case 'PACKING':
        return <span className={`${styles.badge} ${styles.badgeInfo}`}>Paketleniyor</span>
      case 'PACKED':
        return <span className={`${styles.badge} ${styles.badgeSuccess}`}>Paketlendi</span>
      case 'READY_FOR_HANDOVER':
        return <span className={`${styles.badge} ${styles.badgeWarning}`}>Kargoya Hazır</span>
      case 'HANDED_OVER':
      case 'COMPLETED':
        return <span className={`${styles.badge} ${styles.badgeSuccess}`}>Teslim Edildi</span>
      case 'BLOCKED':
        return <span className={`${styles.badge} ${styles.badgeDanger}`}>Hata / Bloke</span>
      case 'CANCELLED':
        return <span className={`${styles.badge} ${styles.badgeMuted}`}>İptal</span>
      default:
        return <span className={styles.badge}>{status}</span>
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Depo & Çok Kanallı Fulfillment Hub</h1>
          <p className={styles.subtitle}>
            Doğrudan Mağaza, Trendyol ve Hepsiburada siparişlerinin merkezi depo sevk, dalga ve lokasyon paneli
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/warehouse/waves" className={`${styles.btn} ${styles.btnPrimary}`}>
            Dalga Toplama (Waves)
          </Link>
          <Link href="/admin/warehouse/manifests" className={`${styles.btn} ${styles.btnSecondary}`}>
            Zimmet / Manifestolar
          </Link>
          <Link href="/admin/warehouse/counts" className={`${styles.btn} ${styles.btnSecondary}`}>
            Sayım & Denetim
          </Link>
          <Link href="/admin/warehouse/pda" className={`${styles.btn} ${styles.btnSecondary}`}>
            Mobil PDA
          </Link>
          <Link href="/admin/warehouse/cartons" className={`${styles.btn} ${styles.btnSecondary}`}>
            3D Koli Tanımları
          </Link>
          <Link href="/admin/warehouse/locations" className={`${styles.btn} ${styles.btnSecondary}`}>
            Lokasyonlar
          </Link>
          <Link href="/admin/warehouse/returns" className={`${styles.btn} ${styles.btnSecondary}`}>
            İade Kabul (RMA)
          </Link>
          <Link href="/admin/warehouse/printers" className={`${styles.btn} ${styles.btnSecondary}`}>
            Zebra Yazıcılar
          </Link>
          <Link href="/admin/warehouse/picking" className={`${styles.btn} ${styles.btnSecondary}`}>
            Toplama Masası
          </Link>
          <Link href="/admin/warehouse/packing" className={`${styles.btn} ${styles.btnSecondary}`}>
            Paketleme Masası
          </Link>
        </div>
      </div>

      {message && <div className={styles.alertSuccess}>{message}</div>}
      {error && <div className={styles.alertDanger}>{error}</div>}

      {/* Carrier Cutoff Intelligence Banner */}
      <div className={styles.card} style={{ marginBottom: 20, background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⏱️</span>
            <span>Kargo Kesim Saati İstihbaratı (Carrier Cutoff Intelligence)</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Zaman Dilimi: Europe/Istanbul (UTC+3)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>Sürat Kargo</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>
                Normal
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Kesim Saati: <strong>17:00</strong></div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Kalan Süre: <strong style={{ color: '#2563eb' }}>01:42</strong></div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>23 gönderi sevk bekliyor</div>
          </div>

          <div style={{ padding: 12, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>PTT Kargo</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>
                Kritik
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Kesim Saati: <strong>16:30</strong></div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Kalan Süre: <strong style={{ color: '#dc2626' }}>00:42</strong></div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>8 gönderi sevk bekliyor</div>
          </div>

          <div style={{ padding: 12, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>Yurtiçi Kargo</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                Yaklaşıyor
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Kesim Saati: <strong>17:30</strong></div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Kalan Süre: <strong style={{ color: '#d97706' }}>02:12</strong></div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>12 gönderi sevk bekliyor</div>
          </div>
        </div>
      </div>

      {/* Operational KPIs */}
      <div className={styles.statsGrid} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className={styles.statCard}>
          <div className={styles.statTitle}>Hazırlanacak</div>
          <div className={styles.statValue} style={{ color: '#d97706' }}>
            {kpis.readyToPick}
          </div>
          <div className={styles.statDesc}>Toplama listesi bekleyen</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statTitle}>Toplama & Paketleme</div>
          <div className={styles.statValue} style={{ color: '#2563eb' }}>
            {kpis.picking + kpis.picked + kpis.packing}
          </div>
          <div className={styles.statDesc}>Fiziksel işlemde olan</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statTitle}>Kargoya Hazır</div>
          <div className={styles.statValue} style={{ color: '#059669' }}>
            {kpis.packed + kpis.readyForHandover}
          </div>
          <div className={styles.statDesc}>Etiketi basılmış sevk bekleyen</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statTitle}>Bloke / İstisna</div>
          <div className={styles.statValue} style={{ color: '#dc2626' }}>
            {kpis.blocked}
          </div>
          <div className={styles.statDesc}>Eksik / hasarlı / incelemede</div>
        </div>
      </div>

      {/* Filters and Actions Bar */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className={styles.select}
            >
              <option value="">Tüm Kanallar</option>
              <option value="DIRECT">Doğrudan Mağaza</option>
              <option value="MARKETPLACE">Pazaryerleri</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.select}
            >
              <option value="">Tüm Durumlar</option>
              <option value="READY_TO_PICK">Hazırlanacak</option>
              <option value="PICKING">Toplanıyor</option>
              <option value="PICKED">Toplandı</option>
              <option value="PACKING">Paketleniyor</option>
              <option value="PACKED">Paketlendi</option>
              <option value="READY_FOR_HANDOVER">Kargoya Hazır</option>
              <option value="HANDED_OVER">Teslim Edildi</option>
              <option value="BLOCKED">Hata / Bloke</option>
            </select>

            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Sipariş No, SKU veya Barkod..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.input}
                style={{ width: 240 }}
              />
              <button type="submit" className={styles.btnSecondary}>
                Filtrele
              </button>
            </form>
          </div>

          <div>
            <button
              onClick={handleCreateBulkPickList}
              disabled={selectedIds.length === 0 || creatingPickList}
              className={styles.btnPrimary}
            >
              {creatingPickList
                ? 'Oluşturuluyor...'
                : `Toplu Pick Listesi Oluştur (${selectedIds.length})`}
            </button>
          </div>
        </div>
      </div>

      {/* Fulfillments Table */}
      <div className={styles.card}>
        <div className={styles.tableResponsive}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={
                      fulfillments.length > 0 && selectedIds.length === fulfillments.length
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Sipariş No</th>
                <th>Kanal / Mağaza</th>
                <th>Ürünler</th>
                <th>Öncelik</th>
                <th>Durum</th>
                <th>Tarih</th>
                <th style={{ textAlign: 'right' }}>Aksiyonlar</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 24 }}>
                    Yükleniyor...
                  </td>
                </tr>
              ) : fulfillments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 24 }}>
                    Kriterlere uygun depo sevk kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                fulfillments.map((f) => {
                  const orderNum = f.orderNumber || f.marketplaceOrderNumber || f.id
                  const isDirect = f.channel === 'DIRECT'
                  const totalQty = (f.items || []).reduce(
                    (acc, i) => acc + i.orderedQuantity,
                    0
                  )

                  return (
                    <tr key={f.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(f.id)}
                          onChange={() => toggleSelectOne(f.id)}
                        />
                      </td>
                      <td>
                        <strong style={{ fontSize: 13 }}>{orderNum}</strong>
                      </td>
                      <td>
                        <span
                          className={styles.badge}
                          style={{
                            backgroundColor: isDirect ? '#f3f4f6' : '#eff6ff',
                            color: isDirect ? '#374151' : '#1d4ed8',
                          }}
                        >
                          {isDirect ? 'Doğrudan Mağaza' : f.storeId || 'Pazaryeri'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 13 }}>
                          <strong>{totalQty} Adet</strong> ({f.items?.length || 0} Kalem)
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {f.items?.map((i) => i.sku).slice(0, 2).join(', ')}
                          {(f.items?.length || 0) > 2 ? '...' : ''}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: 600,
                            color: f.priority <= 60 ? '#dc2626' : 'inherit',
                          }}
                        >
                          {f.priority <= 60 ? 'Acil SLA' : `P-${f.priority}`}
                        </span>
                      </td>
                      <td>{getStatusBadge(f.status)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {f.createdAt.slice(0, 10)} {f.createdAt.slice(11, 16)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <a
                            href={`/api/admin/warehouse/packing-slip/${f.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.btnSecondary}
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            title="Sevk ve Paketleme Fişi PDF"
                          >
                            Sevk Fişi
                          </a>
                          {f.status === 'READY_TO_PICK' || f.status === 'PICKING' ? (
                            <Link
                              href="/admin/warehouse/picking"
                              className={styles.btnPrimary}
                              style={{ padding: '4px 10px', fontSize: 12 }}
                            >
                              Topla
                            </Link>
                          ) : f.status === 'PICKED' || f.status === 'PACKING' ? (
                            <Link
                              href="/admin/warehouse/packing"
                              className={styles.btnPrimary}
                              style={{ padding: '4px 10px', fontSize: 12 }}
                            >
                              Paketle
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
