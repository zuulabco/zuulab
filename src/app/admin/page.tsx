'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { auditIconName, describeAudit } from '@/lib/admin/audit-labels'
import AdminIcon from './AdminIcon'
import styles from './admin.module.css'

interface DashboardStats {
  orders?: {
    total?: number
    newOrders?: number
    processing?: number
    inProduction?: number
    awaitingShipment?: number
    shippedToday?: number
  }
  production?: {
    active?: number
    queued?: number
    completedToday?: number
    recentOrders?: any[]
  }
  products?: {
    total?: number
    lowStockCount?: number
  }
  lowStock?: Array<{
    productId: string
    productName: string
    currentStock: number
    minimumStock: number
    suggestedProductionQuantity?: number
  }>
  fulfillment?: {
    toPick?: number
    packing?: number
    readyToShip?: number
  }
}

interface AuditLog {
  id: string
  action: string
  entity: string
  entityId?: string | null
  metadata?: any
  createdAt: string
}

export default function AdminDashboardPage() {
  const { token, canFetch } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [todayData, setTodayData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadDashboard() {
      if (!canFetch) return
      setLoading(true)
      try {
        const [statsRes, logsRes, todayRes] = await Promise.all([
          fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/admin/audit-logs', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/admin/today', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        ])

        const statsJson = await statsRes.json()
        const logsJson = await logsRes.json()

        if (statsJson.success) {
          setStats(statsJson.stats)
        } else {
          setError(statsJson.error || 'Operasyon verileri alınamadı.')
        }

        if (logsJson.success && Array.isArray(logsJson.logs)) {
          setLogs(logsJson.logs)
        }

        if (todayRes && todayRes.ok) {
          const tJson = await todayRes.json().catch(() => ({}))
          if (tJson.success) setTodayData(tJson)
        }
      } catch (err: any) {
        setError(err.message || 'Veriler yüklenirken bağlantı hatası oluştu.')
      } finally {
        setLoading(false)
      }
    }
    loadDashboard()
  }, [token, canFetch, canFetch])

  // Calculated Real Operational KPIs
  const newOrders = stats?.orders?.newOrders ?? 0
  const processingOrders = stats?.orders?.processing ?? 0
  const awaitingShipment = stats?.orders?.awaitingShipment ?? (todayData?.shipping?.stats?.etiketHazir ?? 0)
  const activePrints = stats?.production?.active ?? 0
  const queuedPrints = stats?.production?.queued ?? 0
  const criticalStockCount = stats?.products?.lowStockCount ?? (todayData?.summary?.kritikStokUrun ?? 0)
  const lowStockList = stats?.lowStock ?? []

  // Attention Items compiled from real operational state
  const attentionItems: Array<{ id: string; label: string; count: number; href: string; severity: 'high' | 'medium' | 'info' }> = []

  if (criticalStockCount > 0) {
    attentionItems.push({
      id: 'crit-stock',
      label: `${criticalStockCount} ürün kritik stok eşiğinde veya tükendi`,
      count: criticalStockCount,
      href: '/admin/inventory',
      severity: 'high',
    })
  }

  if (queuedPrints > 0) {
    attentionItems.push({
      id: 'queue-prints',
      label: `${queuedPrints} adet 3D üretim emri atölye tablası bekliyor`,
      count: queuedPrints,
      href: '/admin/production',
      severity: 'medium',
    })
  }

  if (awaitingShipment > 0) {
    attentionItems.push({
      id: 'await-ship',
      label: `${awaitingShipment} adet sipariş kargo kurye teslimine hazır`,
      count: awaitingShipment,
      href: '/admin/shipping?quickFilter=ready',
      severity: 'info',
    })
  }

  if (processingOrders > 0) {
    attentionItems.push({
      id: 'proc-orders',
      label: `${processingOrders} adet sipariş hazırlanıyor / paketleme aşamasında`,
      count: processingOrders,
      href: '/admin/orders?status=PREPARING',
      severity: 'info',
    })
  }

  return (
    <div className={styles.pageContainer}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            ZUULAB ATÖLYE & MAĞAZA
          </div>
          <h1 className={styles.pageTitle}>Yönetim Merkezi</h1>
          <p className={styles.pageSubtitle}>
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — Gerçek zamanlı üretim, stok, sipariş ve vitrin operasyon özeti.
          </p>
        </div>

        {/* Quick Actions Strip */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link href="/admin/products/new" className={`${styles.btn} ${styles.btnSecondary}`}>
            + Ürün Ekle
          </Link>
          <Link href="/admin/production/new" className={`${styles.btn} ${styles.btnSecondary}`}>
            + Üretim Emri
          </Link>
          <Link href="/admin/today" className={`${styles.btn} ${styles.btnPrimary}`}>
            Günün Operasyonu →
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px', marginBottom: '20px', borderRadius: 'var(--radius-sm)' }}>
          <strong>Hata:</strong> {error}
        </div>
      )}

      {/* ── SECTION 1: PRIMARY KPI STRIP ────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div className={styles.card} style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Bugünkü Sipariş
          </span>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
            {loading ? '—' : newOrders}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Onay & Hazırlık Bekliyor
          </div>
        </div>

        <div className={styles.card} style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Hazırlanan Sipariş
          </span>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '4px', color: processingOrders > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
            {loading ? '—' : processingOrders}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Depo toplama & paketleme
          </div>
        </div>

        <div className={styles.card} style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Gönderilecek Kargo
          </span>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '4px', color: awaitingShipment > 0 ? '#10b981' : 'var(--text-primary)' }}>
            {loading ? '—' : awaitingShipment}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Etiket hazır / kurye bekliyor
          </div>
        </div>

        <div className={styles.card} style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            3D Baskıda
          </span>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '4px', color: 'var(--brand-blue, #0284c7)' }}>
            {loading ? '—' : activePrints}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {queuedPrints} üretim sırada
          </div>
        </div>

        <div className={styles.card} style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Kritik Stok
          </span>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '4px', color: criticalStockCount > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {loading ? '—' : criticalStockCount}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Eşik altı ürün adedi
          </div>
        </div>
      </div>

      {/* ── SECTION 2: CRITICAL ACTIONS / ATTENTION AREA ───────────────────── */}
      {attentionItems.length > 0 && (
        <div className={styles.attentionCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em', margin: 0, color: 'var(--text-primary)' }}>
              Dikkat Gerektiren Operasyonlar
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {attentionItems.length} kritik durum
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {attentionItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  backgroundColor: 'var(--surface-1)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor:
                        item.severity === 'high' ? 'var(--danger)' : item.severity === 'medium' ? 'var(--warning)' : 'var(--zuu-blue)',
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {item.label}
                  </span>
                </div>

                <Link
                  href={item.href}
                  className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                >
                  İşleme Git →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION 3: OPERATIONS CENTER (PIPELINE BREAKDOWN) ──────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.75rem',
        }}
      >
        {/* Orders Pipeline */}
        <div className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Sipariş Akışı</h3>
            <Link href="/admin/orders" style={{ fontSize: '0.75rem', color: 'var(--brand-blue, #2563eb)', textDecoration: 'none', fontWeight: 600 }}>
              Tüm Siparişler &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Yeni / Onay Bekleyen</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{newOrders}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>İşleniyor / Paketleme</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{processingOrders}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>3D Baskıda</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{stats?.orders?.inProduction ?? 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Kargoya Hazır / Etiketli</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{awaitingShipment}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Bugün Sevk Edilen</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#10b981' }}>{stats?.orders?.shippedToday ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Production & 3D Printing Pipeline */}
        <div className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>3D Atölye & Üretim</h3>
            <Link href="/admin/production" style={{ fontSize: '0.75rem', color: 'var(--brand-blue, #2563eb)', textDecoration: 'none', fontWeight: 600 }}>
              Üretim Masası &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Aktif Yazıcı Baskıları</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--brand-blue, #2563eb)' }}>{activePrints}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Kuyrukta Bekleyen Baskılar</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{queuedPrints}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Bugün Tamamlanan Baskı</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#10b981' }}>{stats?.production?.completedToday ?? 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Kritik Stok Uyarısı</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: criticalStockCount > 0 ? '#ef4444' : 'inherit' }}>
                {criticalStockCount} ürün
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Malzeme Durumu</span>
              <Link href="/admin/materials" style={{ fontSize: '0.8rem', color: 'var(--text-primary)', textDecoration: 'underline' }}>
                Filament Masası &rarr;
              </Link>
            </div>
          </div>
        </div>

        {/* Fulfillment & Warehouse Waves */}
        <div className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Fulfillment & Depo</h3>
            <Link href="/admin/warehouse/waves" style={{ fontSize: '0.75rem', color: 'var(--brand-blue, #2563eb)', textDecoration: 'none', fontWeight: 600 }}>
              Dalgalar &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Toplanacak Kalemler</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{stats?.fulfillment?.toPick ?? 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Paketleme İstasyonunda</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{stats?.fulfillment?.packing ?? processingOrders}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Kargoya Hazır Koliler</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#10b981' }}>{awaitingShipment}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Koli & Sevkiyat Çıkışı</span>
              <Link href="/admin/warehouse/manifests" style={{ fontSize: '0.8rem', color: 'var(--text-primary)', textDecoration: 'underline' }}>
                Manifestolar &rarr;
              </Link>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Stok Lokasyonları</span>
              <Link href="/admin/warehouse/locations" style={{ fontSize: '0.8rem', color: 'var(--text-primary)', textDecoration: 'underline' }}>
                Lokasyon Listesi &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 4: LOW STOCK DETAIL & RECENT AUDIT ACTIVITY ───────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {/* Critical Stock Table */}
        <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Kritik Stok Takibi</h3>
            <Link href="/admin/inventory" style={{ fontSize: '0.75rem', color: 'var(--brand-blue, #2563eb)', textDecoration: 'none', fontWeight: 600 }}>
              Tüm Stok &rarr;
            </Link>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Mevcut</th>
                  <th>Min Eşik</th>
                  <th style={{ textAlign: 'right' }}>Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {lowStockList.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      Tüm ürün stokları güvenli seviyede.
                    </td>
                  </tr>
                ) : (
                  lowStockList.slice(0, 5).map((item) => (
                    <tr key={item.productId}>
                      <td style={{ fontWeight: 500 }}>{item.productName}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: item.currentStock === 0 ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
                        {item.currentStock} adet
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {item.minimumStock} adet
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link
                          href={`/admin/production/new?productId=${item.productId}&quantity=${item.suggestedProductionQuantity || 10}&priority=HIGH`}
                          className={styles.secondaryButton}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', textDecoration: 'none' }}
                        >
                          + {item.suggestedProductionQuantity || 10} Üret
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Real Audit Activity Feed */}
        <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Son Sistem ve Operasyon Hareketleri</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Son 6 hareket
            </span>
          </div>

          <div style={{ padding: '0.5rem 1rem' }}>
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Henüz sistem hareket kaydı bulunmuyor.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {logs.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.65rem 0',
                      borderBottom: '1px solid var(--border-subtle, var(--border))',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 500, color: 'var(--text-primary)', minWidth: 0 }}>
                      <span
                        aria-hidden
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          flex: '0 0 28px',
                          borderRadius: 8,
                          background: 'var(--surface-1)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <AdminIcon name={auditIconName(log.action)} size={16} />
                      </span>
                      <span>{describeAudit(log)}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {new Date(log.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}