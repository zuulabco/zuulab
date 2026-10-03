'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import styles from '../admin.module.css'

interface TodayData {
  date: {
    isoDate: string
    formattedDate: string
    formattedDay: string
    formattedFull: string
    timezone: string
  }
  summary: {
    kargoGonderilecek: number
    uretimUretilecek: number
    kritikStokUrun: number
    bekleyenSiparis: number
  }
  priorities: Array<{
    id: string
    level: 'P0' | 'P1' | 'P2' | 'P3'
    levelLabel: string
    badge: string
    title: string
    description: string
    actionLabel: string
    actionHref: string
    count: number
    deterministicRank: number
  }>
  production: {
    recommendations: Array<{
      productId: string
      productName: string
      sku: string
      orderDemand: number
      physicalStock: number
      reservedStock: number
      availableStock: number
      requiredProduction: number
      priority: 'P0' | 'P2' | 'P3'
      priorityLabel: string
      hasActiveProduction: boolean
      activeProductionStatus?: string | null
      activeProductionQty?: number
      printerReference?: string | null
      actionUrl: string
    }>
    active: Array<{
      id: string
      productId: string
      productName: string
      sku: string
      quantity: number
      completedQuantity: number
      acceptedQuantity: number
      failedQuantity: number
      status: string
      priority: string
      printerReference: string | null
      progressPercent: number
      createdAt: string
    }>
    totalActiveJobs: number
    totalUnitsToProduce: number
  }
  shipping: {
    stats: {
      kargoyaHazir: number
      etiketHazir: number
      etiketBekliyor: number
      kargoyaVerildi: number
      todayTotal: number
    }
    shipments: Array<{
      id: string
      orderNumber: string
      channel: 'DIRECT' | 'MARKETPLACE'
      carrier: string
      provider: string
      trackingNumber: string | null
      status: string
      labelReady: boolean
      createdAt: string
    }>
  }
  blockers: Array<{
    orderId: string
    orderNumber: string
    channel: 'DIRECT' | 'MARKETPLACE'
    storeId?: string | null
    customerName: string
    createdAt: string
    items: Array<{
      productId: string
      productName: string
      sku: string
      quantity: number
      availableStock: number
      physicalStock: number
      reservedStock: number
      missingQuantity: number
      hasStockShortage: boolean
    }>
    blockerReason: string
    hasActiveProduction: boolean
    actionUrl: string
    actionLabel: string
    priority: 'P0' | 'P1'
  }>
  lowStock: Array<{
    productId: string
    productName: string
    sku: string
    currentStock: number
    allocatedStock: number
    availableStock: number
    minimumStock: number
    suggestedProductionQty: number
    printerReference: string | null
    hasActiveProduction: boolean
    actionUrl: string
  }>
  materials?: {
    totalMaterialGrams: number
    totalMaterialValueTl: number
    criticalMaterialCount: number
    blockingMaterialCount: number
    todayRequiredGrams: number
    productionDemandCount: number
    producibleCount: number
    blockedCount: number
    materials: Array<{
      materialName: string
      color: string | null
      availableGrams: number
      requiredGrams: number
      minimumGrams: number
      remainingGrams: number
      missingGrams: number
      status: 'READY' | 'LOW' | 'BLOCKED' | 'UNKNOWN'
      stockId?: string | null
      isBlocked: boolean
    }>
    blockers: Array<{
      productId: string
      productName: string
      sku: string
      productionQuantity: number
      materialName: string
      color: string | null
      requiredGrams: number
      availableGrams: number
      missingGrams: number
      status: 'READY' | 'LOW' | 'BLOCKED' | 'UNKNOWN'
      actionUrl: string
    }>
  }
}

export default function TodayOperationsPage() {
  const { token, user, canFetch } = useAuthStore()
  const [data, setData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadTodayOperations = useCallback(async () => {
    if (!canFetch) return
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/today', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await res.json()
      if (result.success) {
        setData(result)
        setError(null)
      } else {
        setError(result.error || 'Operasyon verisi alınamadı.')
      }
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası oluştu.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token, canFetch, canFetch])

  useEffect(() => {
    loadTodayOperations()
  }, [loadTodayOperations])

  if (loading) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>Günün operasyon planı hesaplanıyor...</div>
        <div style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
          Mevcut siparişler, yetkili stoklar ve üretim kuyruğu taranıyor
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pageContainer} style={{ paddingBottom: 60 }}>
      {/* ── 1. TODAY HEADER ──────────────────────────────────────────────── */}
      <div
        id="today-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          paddingBottom: 20,
          borderBottom: '1px solid var(--border)',
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                background: '#0080c4',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: 3,
              }}
            >
              BUGÜN
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Zaman Dilimi: {data?.date?.timezone || 'Europe/Istanbul'}
            </span>
          </div>
          <h1
            id="today-date-heading"
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 4px 0',
              letterSpacing: '-0.02em',
            }}
          >
            {data?.date?.formattedDate || '29 Eylül 2026'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600 }}>{data?.date?.formattedDay || 'Pazartesi'}</span>
            <span style={{ color: 'var(--text-disabled)' }}>·</span>
            <span>Atölye Günlük Operasyon Merkezi</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={loadTodayOperations}
            disabled={refreshing}
            id="btn-today-refresh"
            style={{
              padding: '7px 14px',
              background: 'var(--surface-0)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 4,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{refreshing ? '↻ Yenileniyor...' : '↻ Yenile'}</span>
          </button>
          <Link
            href="/admin/production/new"
            style={{
              padding: '7px 14px',
              background: 'var(--surface-0)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              borderRadius: 4,
            }}
          >
            + Üretim Başlat
          </Link>
          <Link
            href="/admin/shipping"
            style={{
              padding: '7px 14px',
              background: '#0080c4',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              borderRadius: 4,
            }}
          >
            Kargo Masası →
          </Link>
        </div>
      </div>

      {error && (
        <div
          id="today-error-alert"
          style={{
            padding: '12px 16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: 13,
            marginBottom: 24,
            borderRadius: 4,
          }}
        >
          <strong>Hata:</strong> {error}
        </div>
      )}

      {/* ── 2. TOP SUMMARY (4 OPERATIONAL KPIS) ───────────────────────────── */}
      <div
        id="today-kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          marginBottom: 28,
        }}
      >
        {/* KPI 1: KARGO */}
        <Link
          href="/admin/shipping?quickFilter=ready"
          id="kpi-kargo"
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderLeft: '4px solid #10b981',
            borderRadius: 4,
            padding: '14px 16px',
            textDecoration: 'none',
            display: 'block',
            transition: 'background-color 0.15s',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#10b981' }}>
            KARGO
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
            {data?.summary?.kargoGonderilecek ?? 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Gönderilecek
          </div>
        </Link>

        {/* KPI 2: ÜRETİM */}
        <Link
          href="/admin/production"
          id="kpi-uretim"
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderLeft: '4px solid #f59e0b',
            borderRadius: 4,
            padding: '14px 16px',
            textDecoration: 'none',
            display: 'block',
            transition: 'background-color 0.15s',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#f59e0b' }}>
            ÜRETİM
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
            {data?.summary?.uretimUretilecek ?? 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Üretilecek Ürün
          </div>
        </Link>

        {/* KPI 3: KRİTİK STOK */}
        <Link
          href="/admin/inventory"
          id="kpi-kritik-stok"
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderLeft: '4px solid #ef4444',
            borderRadius: 4,
            padding: '14px 16px',
            textDecoration: 'none',
            display: 'block',
            transition: 'background-color 0.15s',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#ef4444' }}>
            KRİTİK STOK
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
            {data?.summary?.kritikStokUrun ?? 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Ürün Eşik Altında
          </div>
        </Link>

        {/* KPI 4: BEKLEYEN SİPARİŞ */}
        <Link
          href="/admin/orders"
          id="kpi-bekleyen-siparis"
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderLeft: '4px solid #0080c4',
            borderRadius: 4,
            padding: '14px 16px',
            textDecoration: 'none',
            display: 'block',
            transition: 'background-color 0.15s',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#0080c4' }}>
            BEKLEYEN SİPARİŞ
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
            {data?.summary?.bekleyenSiparis ?? 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Hazırlanacak
          </div>
        </Link>

        {/* KPI 5: MALZEME DURUMU */}
        <Link
          href="/admin/materials"
          id="kpi-malzeme"
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderLeft: `4px solid ${
              (data?.materials?.blockedCount || 0) > 0
                ? '#ef4444'
                : (data?.materials?.criticalMaterialCount || 0) > 0
                ? '#f59e0b'
                : '#10b981'
            }`,
            borderRadius: 4,
            padding: '14px 16px',
            textDecoration: 'none',
            display: 'block',
            transition: 'background-color 0.15s',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color:
                (data?.materials?.blockedCount || 0) > 0
                  ? '#ef4444'
                  : (data?.materials?.criticalMaterialCount || 0) > 0
                  ? '#f59e0b'
                  : '#10b981',
            }}
          >
            MALZEME
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
            {data?.materials?.productionDemandCount || 0} Üretim İhtiyacı
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ color: '#10b981', fontWeight: 600 }}>{data?.materials?.producibleCount || 0} üretilebilir</span>
            {(data?.materials?.blockedCount || 0) > 0 ? (
              <span style={{ color: '#ef4444', fontWeight: 600 }}> · {data?.materials?.blockedCount} malzeme bekliyor</span>
            ) : null}
          </div>
          <div style={{ fontSize: 11, color: '#0080c4', fontWeight: 600, marginTop: 4 }}>
            Malzemeleri Gör →
          </div>
        </Link>
      </div>

      {/* ── 3. "BUGÜN NE YAPMALIYIM?" (DETERMINISTIC PRIORITY ENGINE) ──────── */}
      <div
        id="section-today-priorities"
        style={{
          background: 'var(--surface-0)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '18px 20px',
          marginBottom: 32,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              BUGÜN NE YAPMALIYIM?
            </h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              (Deterministik Operasyon Sırası)
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {data?.priorities?.length || 0} Aksiyon Gereksinimi
          </span>
        </div>

        {(!data?.priorities || data.priorities.length === 0) ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Tebrikler! Şu an için bekleyen acil operasyonel görev bulunmuyor.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.priorities.map((item, idx) => (
              <div
                key={item.id}
                id={`priority-item-${idx + 1}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, width: 28, textAlign: 'center', color: 'var(--text-muted)' }}>
                    {idx + 1}
                  </div>
                  <div style={{ fontSize: 18 }}>{item.badge}</div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 3,
                          background:
                            item.level === 'P0'
                              ? '#fef2f2'
                              : item.level === 'P1'
                              ? '#fffbeb'
                              : item.level === 'P2'
                              ? '#fefce8'
                              : '#eff6ff',
                          color:
                            item.level === 'P0'
                              ? '#b91c1c'
                              : item.level === 'P1'
                              ? '#b45309'
                              : item.level === 'P2'
                              ? '#a16207'
                              : '#1d4ed8',
                        }}
                      >
                        {item.level} {item.levelLabel}
                      </span>
                      <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{item.title}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.description}</div>
                  </div>
                </div>

                <div>
                  <Link
                    href={item.actionHref}
                    id={`btn-action-${idx + 1}`}
                    style={{
                      padding: '6px 14px',
                      background: item.level === 'P0' ? '#b91c1c' : '#0080c4',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                      borderRadius: 4,
                      display: 'inline-block',
                    }}
                  >
                    [{item.actionLabel}]
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 4. ORDER BLOCKERS (SİPARİŞ BLOKE EDENLER) ────────────────────── */}
      <div
        id="section-order-blockers"
        style={{
          background: 'var(--surface-0)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '18px 20px',
          marginBottom: 32,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#b91c1c',
                margin: 0,
              }}
            >
              SİPARİŞ BLOKE EDENLER
            </h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              (Üretim Eksikliği Nedeniyle Gönderilemeyen Siparişler)
            </span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {data?.blockers?.length || 0} Bloke Sipariş
          </span>
        </div>

        {(!data?.blockers || data.blockers.length === 0) ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Harika! Stok yetersizliği nedeniyle bloke edilmiş sipariş bulunmuyor.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.blockers.map((b) => (
              <div
                key={b.orderId}
                style={{
                  padding: '12px 16px',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderLeft: b.hasActiveProduction ? '4px solid #f59e0b' : '4px solid #ef4444',
                  borderRadius: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      #{b.orderNumber}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '1px 6px',
                        background: 'var(--surface-2)',
                        borderRadius: 3,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {b.channel}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Müşteri: {b.customerName}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {b.items
                      .filter((i) => i.hasStockShortage)
                      .map((i) => (
                        <span key={i.productId} style={{ marginRight: 12 }}>
                          <strong>{i.productName}</strong> × {i.quantity} adet (Mevcut: {i.availableStock}, Gerekli: {i.quantity}, Eksik: {i.missingQuantity})
                        </span>
                      ))}
                  </div>

                  <div style={{ fontSize: 12, color: b.hasActiveProduction ? '#b45309' : '#b91c1c', fontWeight: 600 }}>
                    → {b.blockerReason}
                  </div>
                </div>

                <div>
                  <Link
                    href={b.actionUrl}
                    style={{
                      padding: '6px 14px',
                      background: b.hasActiveProduction ? 'var(--surface-0)' : '#b91c1c',
                      border: b.hasActiveProduction ? '1px solid var(--border)' : 'none',
                      color: b.hasActiveProduction ? 'var(--text-primary)' : '#ffffff',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                      borderRadius: 4,
                      display: 'inline-block',
                    }}
                  >
                    [{b.actionLabel}]
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 4B. MATERIAL BLOCKERS (MALZEME BLOKERLERİ) ──────────────────── */}
      <div
        id="section-material-blockers"
        style={{
          background: 'var(--surface-0)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '18px 20px',
          marginBottom: 32,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#b91c1c',
                margin: 0,
              }}
            >
              MALZEME BLOKERLERİ
            </h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              (Hammadde ve Filament Eksikliği Nedeniyle Bloke Üretimler)
            </span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {data?.materials?.blockers?.length || 0} Malzeme Bloke
          </span>
        </div>

        {(!data?.materials?.blockers || data.materials.blockers.length === 0) ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Harika! Üretim için gerekli tüm hammadde ve sarf malzemeleri yeterli seviyede.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.materials.blockers.map((b) => (
              <div
                key={b.productId}
                style={{
                  padding: '12px 16px',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderLeft: '4px solid #ef4444',
                  borderRadius: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={styles.tabDot} style={{ background: '#ef4444', width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
                    <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                      {b.productName}
                    </strong>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      ({b.sku})
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Üretim: <strong>{b.productionQuantity} adet</strong> · Gerekli: <strong>{b.requiredGrams}g {b.materialName} {b.color ? `(${b.color})` : ''}</strong> · Mevcut: <strong>{b.availableGrams}g</strong> · Eksik: <strong style={{ color: '#dc2626' }}>{b.missingGrams}g</strong>
                  </div>
                </div>

                <div>
                  <Link
                    href={b.actionUrl || '/admin/materials'}
                    style={{
                      padding: '6px 14px',
                      background: '#0080c4',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                      borderRadius: 4,
                      display: 'inline-block',
                    }}
                  >
                    Malzemeyi Gör
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 5. PRODUCTION RECOMMENDATIONS & ACTIVE PRODUCTION (2 COLS) ───── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 20, marginBottom: 32 }}>
        {/* ÜRETİM ÖNERİLERİ */}
        <div
          id="section-production-recommendations"
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              ÜRETİM ÖNERİLERİ
            </h2>
            <Link href="/admin/production" style={{ fontSize: 12, color: '#0080c4', fontWeight: 600, textDecoration: 'none' }}>
              Tüm Üretim →
            </Link>
          </div>

          {(!data?.production?.recommendations || data.production.recommendations.length === 0) ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Sipariş veya stok kaynaklı üretim önerisi bulunmuyor.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 6px', fontWeight: 600 }}>Ürün</th>
                    <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'center' }}>Talep</th>
                    <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'center' }}>Mevcut</th>
                    <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'center' }}>Üretilecek</th>
                    <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'center' }}>Öncelik</th>
                    <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'right' }}>Aksiyon</th>
                  </tr>
                </thead>
                <tbody>
                  {data.production.recommendations.slice(0, 10).map((r) => (
                    <tr key={r.productId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 6px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.productName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.sku}</div>
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600 }}>
                        {r.orderDemand}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {r.availableStock}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: r.requiredProduction > 0 ? '#b91c1c' : 'inherit' }}>
                        {r.requiredProduction}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: r.priority === 'P0' ? '#fef2f2' : r.priority === 'P2' ? '#fffbeb' : '#f3f4f6',
                            color: r.priority === 'P0' ? '#b91c1c' : r.priority === 'P2' ? '#b45309' : '#374151',
                          }}
                        >
                          {r.priority}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                        <Link
                          href={r.actionUrl}
                          style={{
                            padding: '4px 10px',
                            background: r.requiredProduction > 0 ? '#0080c4' : 'var(--surface-2)',
                            color: r.requiredProduction > 0 ? '#ffffff' : 'var(--text-primary)',
                            fontSize: 11,
                            fontWeight: 600,
                            textDecoration: 'none',
                            borderRadius: 3,
                            display: 'inline-block',
                          }}
                        >
                          + Üret
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* AKTİF ÜRETİMLER */}
        <div
          id="section-active-production"
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                AKTİF ÜRETİMLER
              </h2>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ({data?.production?.active?.length || 0} İşlemde)
              </span>
            </div>
            <Link href="/admin/production" style={{ fontSize: 12, color: '#0080c4', fontWeight: 600, textDecoration: 'none' }}>
              Yazıcı Kuyruğu →
            </Link>
          </div>

          {(!data?.production?.active || data.production.active.length === 0) ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Şu anda çalışan veya kuyrukta olan aktif üretim emri bulunmuyor.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.production.active.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                        {job.productName}
                      </span>
                      {job.printerReference && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                          [{job.printerReference}]
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 3,
                        background:
                          job.status === 'IN_PROGRESS'
                            ? '#dbeafe'
                            : job.status === 'COMPLETED'
                            ? '#d1fae5'
                            : '#fef3c7',
                        color:
                          job.status === 'IN_PROGRESS'
                            ? '#1d4ed8'
                            : job.status === 'COMPLETED'
                            ? '#065f46'
                            : '#92400e',
                      }}
                    >
                      {job.status === 'IN_PROGRESS'
                        ? 'ÜRETİLİYOR'
                        : job.status === 'QUEUED'
                        ? 'KUYRUKTA'
                        : job.status}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: 'var(--border)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${job.progressPercent}%`,
                          height: '100%',
                          background: job.status === 'COMPLETED' ? '#10b981' : '#0080c4',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 60, textAlign: 'right' }}>
                      {job.completedQuantity} / {job.quantity} ({job.progressPercent}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 6. SHIPPING TODAY & LOW STOCK (2 COLS) ───────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 20, marginBottom: 32 }}>
        {/* BUGÜNÜN KARGOLARI */}
        <div
          id="section-today-shipping"
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: 'var(--text-primary)',
                  margin: '0 0 2px 0',
                }}
              >
                BUGÜNÜN KARGOLARI
              </h2>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {data?.shipping?.stats?.kargoyaHazir ?? 0} Gönderi: {data?.shipping?.stats?.etiketHazir ?? 0} Etiket hazır · {data?.shipping?.stats?.etiketBekliyor ?? 0} Etiket bekliyor
              </div>
            </div>
            <Link
              href="/admin/shipping"
              style={{
                padding: '6px 12px',
                background: '#0080c4',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
                borderRadius: 4,
              }}
            >
              Kargo Masasına Git →
            </Link>
          </div>

          {(!data?.shipping?.shipments || data.shipping.shipments.length === 0) ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Bugün sevk edilecek kargo gönderisi bulunmuyor.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.shipping.shipments.slice(0, 6).map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>#{s.orderNumber}</span>
                    <span style={{ fontSize: 10, padding: '1px 5px', background: 'var(--surface-2)', borderRadius: 2 }}>
                      {s.carrier}
                    </span>
                    {s.trackingNumber && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Takip: {s.trackingNumber}
                      </span>
                    )}
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 3,
                        background: s.labelReady ? '#d1fae5' : '#fef3c7',
                        color: s.labelReady ? '#065f46' : '#92400e',
                      }}
                    >
                      {s.labelReady ? 'ETİKET HAZIR' : 'ETİKET BEKLİYOR'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* KRİTİK STOK */}
        <div
          id="section-low-stock"
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              KRİTİK STOK
            </h2>
            <Link href="/admin/inventory" style={{ fontSize: 12, color: '#0080c4', fontWeight: 600, textDecoration: 'none' }}>
              Stok Yönetimi →
            </Link>
          </div>

          {(!data?.lowStock || data.lowStock.length === 0) ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Tüm ürünlerin stok seviyesi güvenlik eşiğinin üzerindedir.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 6px', fontWeight: 600 }}>Ürün</th>
                    <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'center' }}>Mevcut</th>
                    <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'center' }}>Minimum</th>
                    <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'center' }}>Durum</th>
                    <th style={{ padding: '8px 6px', fontWeight: 600, textAlign: 'right' }}>Aksiyon</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowStock.slice(0, 6).map((item) => (
                    <tr key={item.productId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 6px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.productName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.sku}</div>
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>
                        {item.availableStock}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {item.minimumStock}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: item.hasActiveProduction ? '#dbeafe' : '#fef2f2',
                            color: item.hasActiveProduction ? '#1d4ed8' : '#b91c1c',
                          }}
                        >
                          {item.hasActiveProduction ? 'ÜRETİLİYOR' : 'KRİTİK'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                        <Link
                          href={item.actionUrl}
                          style={{
                            padding: '4px 10px',
                            background: 'var(--surface-0)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-primary)',
                            fontSize: 11,
                            fontWeight: 600,
                            textDecoration: 'none',
                            borderRadius: 3,
                            display: 'inline-block',
                          }}
                        >
                          Üret
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── 7. TODAY TIMELINE (BUGÜNÜN AKIŞI) ─────────────────────────────── */}
      <div
        id="section-today-timeline"
        style={{
          background: 'var(--surface-0)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '18px 20px',
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--text-primary)',
              margin: '0 0 4px 0',
            }}
          >
            BUGÜNÜN AKIŞI (OPERASYON REHBERİ)
          </h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Zuulab günlük üretim ve sevkiyat disiplini görsel kılavuzu
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            alignItems: 'stretch',
          }}
        >
          {[
            { step: '09:00', title: 'Sipariş Kontrolü', desc: 'Yeni gelen siparişleri gözden geçir' },
            { step: '09:30', title: 'Üretimi Başlat', desc: 'Eksik ürünler için 3D baskıyı çalıştır' },
            { step: '11:00', title: 'Paketleme', desc: 'Hazır siparişleri koruyucu kutula' },
            { step: '14:00', title: 'Etiketleme', desc: '100x100 termal etiketleri oluştur' },
            { step: '16:30', title: 'Kargo Teslimi', desc: 'Paketleri kuryeye teslim et' },
            { step: '17:00', title: 'SHIPPED Onayı', desc: 'Fiziksel stok otomatik commit edilir' },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: '12px',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#0080c4',
                    background: 'var(--surface-2)',
                    padding: '2px 5px',
                    borderRadius: 2,
                  }}
                >
                  {item.step}
                </span>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: '8px 0 4px' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
