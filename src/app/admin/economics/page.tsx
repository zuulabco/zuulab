'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { formatPrice } from '@/lib/utils'
import Modal from '@/components/common/Modal'
import styles from '../admin.module.css'

interface EconomicsSummary {
  period: string
  channel: string
  totalProducts: number
  productsWithCompleteCost: number
  productsWithPartialCost: number
  productsWithMissingCost: number
  totalUnitsSold: number
  totalGrossRevenueTl: number
  totalEstimatedProductionCostTl: number | null
  totalEstimatedContributionTl: number | null
  averageEstimatedContributionTl: number | null
  overallMarginPercent: number | null
  isEstimate: boolean
  hasSufficientData: boolean
  unavailabilityNotice?: string
}

interface SalesItemRow {
  productId: string
  productName: string
  sku: string
  channel: string
  unitsSold: number
  grossRevenueTl: number
  estimatedProductionCostTl: number | null
  commissionDeductionTl: number | null
  shippingDeductionTl: number | null
  paymentFeeDeductionTl: number | null
  totalKnownDeductionsTl: number
  estimatedContributionTl: number | null
  marginPercent: number | null
  dataCompleteness: 'COMPLETE' | 'PARTIAL' | 'MISSING'
  isEstimate: boolean
}

interface MaterialItem {
  id: string
  name: string
  pricePerKgTl: number
  currency: string
  effectiveFrom: string
  notes?: string
}

interface FeeConfigItem {
  id: string
  channel: string
  commissionPercent: number | null
  commissionFixedTl: number | null
  estimatedShippingCostTl: number | null
  estimatedPaymentFeePercent: number | null
  estimatedPaymentFeeFixedTl: number | null
  notes?: string
}

export default function AdminEconomicsPage() {
  const { token, canFetch } = useAuthStore()

  const [activeTab, setActiveTab] = useState<'sales' | 'materials' | 'fees'>('sales')
  const [period, setPeriod] = useState('this_month')
  const [channel, setChannel] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<EconomicsSummary | null>(null)
  const [salesRows, setSalesRows] = useState<SalesItemRow[]>([])
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [feeConfigs, setFeeConfigs] = useState<FeeConfigItem[]>([])

  // Modal edit for materials (UI-16 Global Modal)
  const [editingMaterial, setEditingMaterial] = useState<{ id?: string; name: string; pricePerKg: number; notes: string } | null>(null)
  const [savingMaterial, setSavingMaterial] = useState(false)

  // Modal edit for channel fees (UI-16 Global Modal)
  const [editingFee, setEditingFee] = useState<{ id?: string; channel: string; commissionPercent: number; shippingCost: number } | null>(null)
  const [savingFee, setSavingFee] = useState(false)

  const loadData = async () => {
    if (!canFetch) return
    setLoading(true)
    try {
      const [sumRes, salesRes, matRes, feeRes] = await Promise.all([
        fetch(`/api/admin/economics/summary?period=${period}&channel=${channel}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/admin/economics/sales?period=${period}&channel=${channel}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/economics/materials', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/economics/fees', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      const [sumData, salesData, matData, feeData] = await Promise.all([
        sumRes.json(),
        salesRes.json(),
        matRes.json(),
        feeRes.json(),
      ])

      if (sumData.success) setSummary(sumData.summary)
      if (salesData.success) setSalesRows(salesData.sales || [])
      if (matData.success) setMaterials(matData.materials || [])
      if (feeData.success) setFeeConfigs(feeData.configs || [])
    } catch (err: any) {
      console.error('Economics data fetch error:', err)
      toast.error('Ekonomi verileri alınırken bağlantı hatası oluştu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [token, canFetch, period, channel])

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch || !editingMaterial) return
    setSavingMaterial(true)
    try {
      const res = await fetch('/api/admin/economics/materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editingMaterial.name,
          pricePerKgTl: editingMaterial.pricePerKg,
          notes: editingMaterial.notes,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Hammadde / filament fiyatı başarıyla güncellendi.')
        setEditingMaterial(null)
        loadData()
      } else {
        toast.error(data.error || 'Kaydedilemedi.')
      }
    } catch (err: any) {
      toast.error(err.message || 'Bağlantı hatası.')
    } finally {
      setSavingMaterial(false)
    }
  }

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch || !editingFee) return
    setSavingFee(true)
    try {
      const res = await fetch('/api/admin/economics/fees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel: editingFee.channel,
          commissionPercent: editingFee.commissionPercent,
          estimatedShippingCostTl: editingFee.shippingCost,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Kanal komisyon ve masraf parametreleri güncellendi.')
        setEditingFee(null)
        loadData()
      } else {
        toast.error(data.error || 'Kaydedilemedi.')
      }
    } catch (err: any) {
      toast.error(err.message || 'Bağlantı hatası.')
    } finally {
      setSavingFee(false)
    }
  }

  const filteredSales = useMemo(() => {
    if (!searchQuery.trim()) return salesRows
    const q = searchQuery.toLowerCase()
    return salesRows.filter((r) => r.productName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q))
  }, [salesRows, searchQuery])

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ürün Ekonomisi & Kârlılık</h1>
          <p className={styles.pageSubtitle}>
            Hammadde (filament) gramajı, sarf giderleri ve kanal komisyonları bazlı gerçekçi operasyonel katkı payı analizi.
          </p>
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Brüt Satış Cirosu</div>
          <div className={styles.metricValue}>{summary ? formatPrice(summary.totalGrossRevenueTl) : '—'}</div>
          <div className={styles.metricSub}>{summary ? `${summary.totalUnitsSold} adet ürün satışı` : 'Tüm kanallar'}</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Tahmini Üretim Maliyeti</div>
          <div className={`${styles.metricValue} ${styles.metricWarning}`}>
            {summary?.totalEstimatedProductionCostTl != null ? formatPrice(summary.totalEstimatedProductionCostTl) : '—'}
          </div>
          <div className={styles.metricSub}>Filament & Sarf Giderleri</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Tahmini Net Katkı</div>
          <div className={`${styles.metricValue} ${styles.metricSuccess}`}>
            {summary?.totalEstimatedContributionTl != null ? formatPrice(summary.totalEstimatedContributionTl) : '—'}
          </div>
          <div className={styles.metricSub}>
            {summary?.overallMarginPercent != null ? `Ortalama Marj: %${summary.overallMarginPercent}` : 'Kanal masrafları sonrası'}
          </div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Maliyet Veri Sağlığı</div>
          <div className={styles.metricValue} style={{ fontSize: 20 }}>
            {summary?.productsWithCompleteCost ?? 0} / {summary?.totalProducts ?? 0}
          </div>
          <div className={styles.metricSub}>
            {summary?.productsWithMissingCost ? `${summary.productsWithMissingCost} ürün profili eksik` : 'Tüm ürünler tam'}
          </div>
        </div>
      </div>

      {/* Operational Notice if any */}
      {summary?.unavailabilityNotice && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--warning)',
            fontSize: 12,
            marginBottom: 20,
          }}
        >
          ℹ️ {summary.unavailabilityNotice}
        </div>
      )}

      {/* Tabs */}
      <div className={styles.operationalTabs} style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          className={`${styles.operationalTabItem} ${activeTab === 'sales' ? styles.operationalTabItemActive : ''}`}
        >
          Ürün Satış & Katkı Analizi
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('materials')}
          className={`${styles.operationalTabItem} ${activeTab === 'materials' ? styles.operationalTabItemActive : ''}`}
        >
          Hammadde & Filament Fiyatları ({materials.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('fees')}
          className={`${styles.operationalTabItem} ${activeTab === 'fees' ? styles.operationalTabItemActive : ''}`}
        >
          Kanal Komisyon & Sevk Parametreleri
        </button>
      </div>

      {/* TAB 1: SALES & CONTRIBUTION */}
      {activeTab === 'sales' && (
        <div>
          {/* Filters */}
          <div className={styles.filterCard}>
            <div className={styles.filterRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Dönem:</span>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="today">Bugün</option>
                  <option value="7days">Son 7 Gün</option>
                  <option value="30days">Son 30 Gün</option>
                  <option value="this_month">Bu Ay</option>
                  <option value="all">Tüm Zamanlar</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Kanal:</span>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="ALL">Tüm Satış Kanalları</option>
                  <option value="ZUULAB">ZUULAB Mağaza</option>
                  <option value="TRENDYOL">Trendyol Pazaryeri</option>
                  <option value="HEPSIBURADA">Hepsiburada</option>
                </select>
              </div>

              <input
                type="text"
                placeholder="Ürün adı veya SKU ile filtrele..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.filterInput}
                style={{ minWidth: 220 }}
              />

              <button
                type="button"
                onClick={loadData}
                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
              >
                Yenile
              </button>
            </div>
          </div>

          {/* Table */}
          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>Ürün & SKU</th>
                    <th>Kanal</th>
                    <th style={{ textAlign: 'right' }}>Satılan Adet</th>
                    <th style={{ textAlign: 'right' }}>Brüt Ciro</th>
                    <th style={{ textAlign: 'right' }}>Tahmini Maliyet</th>
                    <th style={{ textAlign: 'right' }}>Komisyon</th>
                    <th style={{ textAlign: 'right' }}>Kargo</th>
                    <th style={{ textAlign: 'right' }}>Tahmini Net Katkı</th>
                    <th style={{ textAlign: 'right' }}>Marj (%)</th>
                    <th style={{ textAlign: 'center' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                        Karlılık verileri hesaplanıyor...
                      </td>
                    </tr>
                  ) : filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={10}>
                        <div className={styles.emptyState}>
                          <div className={styles.emptyStateTitle}>Satış ve ekonomi kaydı bulunamadı</div>
                          <div className={styles.emptyStateDesc}>
                            Seçilen dönem ve kanal için satış gerçekleşmemiş veya maliyet profili eşleşmesi yok.
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((row, idx) => (
                      <tr key={`${row.productId}-${row.channel}-${idx}`}>
                        <td>
                          <Link
                            href={`/admin/products/${row.productId}`}
                            style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }}
                          >
                            {row.productName}
                          </Link>
                          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted)', marginTop: 2 }}>
                            {row.sku}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              row.channel === 'ZUULAB'
                                ? styles.badgeActive
                                : row.channel === 'TRENDYOL'
                                ? styles.badgeWarning
                                : styles.badgeInfo
                            }`}
                          >
                            {row.channel}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
                          {row.unitsSold}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
                          {formatPrice(row.grossRevenueTl)}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono, monospace)' }}>
                          {row.estimatedProductionCostTl != null ? formatPrice(row.estimatedProductionCostTl) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                          {row.commissionDeductionTl != null ? formatPrice(row.commissionDeductionTl) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                          {row.shippingDeductionTl != null ? formatPrice(row.shippingDeductionTl) : '—'}
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono, monospace)',
                            color: row.estimatedContributionTl && row.estimatedContributionTl > 0 ? '#059669' : 'var(--danger)',
                          }}
                        >
                          {row.estimatedContributionTl != null ? formatPrice(row.estimatedContributionTl) : 'Hesaplanamıyor'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
                          {row.marginPercent != null ? `%${row.marginPercent}` : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Link
                            href={`/admin/products/${row.productId}`}
                            className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                          >
                            Maliyet Profili ↗
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MATERIALS */}
      {activeTab === 'materials' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                Filament & Hammadde Birim Fiyatları
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                Burada tanımlanan kilogram alış maliyetleri ürünlerin 3D baskı gramajına göre net maliyet oluşturur.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingMaterial({ name: '', pricePerKg: 700, notes: '' })}
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              + Yeni Malzeme Ekle
            </button>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>Malzeme Adı</th>
                    <th style={{ textAlign: 'right' }}>Kilogram Fiyatı (TL/kg)</th>
                    <th>Geçerlilik Tarihi</th>
                    <th>Açıklama / Not</th>
                    <th style={{ textAlign: 'center' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: 'var(--brand-blue, var(--zuu-blue))' }}>
                        {formatPrice(m.pricePerKgTl)} / kg
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(m.effectiveFrom).toLocaleDateString('tr-TR')}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {m.notes || '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setEditingMaterial({ id: m.id, name: m.name, pricePerKg: m.pricePerKgTl, notes: m.notes || '' })}
                          className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                        >
                          Fiyat Güncelle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FEES CONFIG */}
      {activeTab === 'fees' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              Satış Kanalı Komisyon & Sevk Parametreleri
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Sipariş bazında gerçek kesinti gelmediğinde tahmini katkı hesaplamasında bu oranlar kullanılır.
            </p>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>Satış Kanalı</th>
                    <th style={{ textAlign: 'right' }}>Komisyon (%)</th>
                    <th style={{ textAlign: 'right' }}>Tahmini Kargo Ücreti</th>
                    <th style={{ textAlign: 'right' }}>Ödeme Kuruluşu Komisyonu</th>
                    <th style={{ textAlign: 'center' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {feeConfigs.map((f) => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600 }}>{f.channel}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                        {f.commissionPercent != null ? `%${f.commissionPercent}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                        {f.estimatedShippingCostTl != null ? formatPrice(f.estimatedShippingCostTl) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {f.estimatedPaymentFeePercent != null ? `%${f.estimatedPaymentFeePercent} + ${formatPrice(f.estimatedPaymentFeeFixedTl || 0)}` : 'Dahil / Yok'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingFee({
                              id: f.id,
                              channel: f.channel,
                              commissionPercent: f.commissionPercent || 0,
                              shippingCost: f.estimatedShippingCostTl || 40,
                            })
                          }
                          className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                        >
                          Parametreleri Düzenle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Material Edit Modal (UI-16 Global Modal) */}
      {editingMaterial && (
        <Modal
          isOpen={Boolean(editingMaterial)}
          onClose={() => setEditingMaterial(null)}
          ariaLabel="Hammadde Fiyatı Düzenleme"
          maxWidth={460}
        >
          <form onSubmit={handleSaveMaterial} style={{ padding: '4px 0' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 16px', color: 'var(--text-primary)' }}>
              {editingMaterial.id ? 'Hammadde Fiyatı Güncelle' : 'Yeni Hammadde Ekle'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Malzeme / Filament Adı</label>
                <input
                  type="text"
                  required
                  placeholder="örn: PLA+ Matte, PETG-CF"
                  value={editingMaterial.name}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, name: e.target.value })}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Kilogram Alış Fiyatı (TL / kg)</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={editingMaterial.pricePerKg}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, pricePerKg: Number(e.target.value) })}
                  className={styles.formInput}
                  style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Not / Tedarikçi / Marka</label>
                <input
                  type="text"
                  placeholder="örn: eSun PLA filament, 1.75mm"
                  value={editingMaterial.notes}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, notes: e.target.value })}
                  className={styles.formInput}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setEditingMaterial(null)}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={savingMaterial}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                {savingMaterial ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Fee Config Edit Modal (UI-16 Global Modal) */}
      {editingFee && (
        <Modal
          isOpen={Boolean(editingFee)}
          onClose={() => setEditingFee(null)}
          ariaLabel="Kanal Masraf Parametreleri"
          maxWidth={460}
        >
          <form onSubmit={handleSaveFee} style={{ padding: '4px 0' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 16px', color: 'var(--text-primary)' }}>
              {editingFee.channel} Masraf Parametreleri
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Pazaryeri Komisyon Oranı (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  required
                  value={editingFee.commissionPercent}
                  onChange={(e) => setEditingFee({ ...editingFee, commissionPercent: Number(e.target.value) })}
                  className={styles.formInput}
                  style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tahmini Sevk & Kargo Ücreti (TL)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={editingFee.shippingCost}
                  onChange={(e) => setEditingFee({ ...editingFee, shippingCost: Number(e.target.value) })}
                  className={styles.formInput}
                  style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setEditingFee(null)}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={savingFee}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                {savingFee ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
