'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { getMaterialReadinessStatusConfig } from '@/lib/constants/admin-status'
import styles from '../../admin.module.css'

interface MaterialStockItem {
  id: string
  storeId?: string | null
  materialProfileId?: string | null
  materialName: string
  color: string | null
  quantityGrams: number
  minimumQuantityGrams: number
  location?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  pricePerKgTl?: number | null
  totalValueTl?: number | null
}

interface MaterialMovementItem {
  id: string
  materialStockId: string
  type: 'PURCHASE' | 'MANUAL_ADJUSTMENT' | 'PRODUCTION_CONSUMPTION' | 'WASTE' | 'RETURN'
  quantityGrams: number
  previousQuantityGrams: number
  newQuantityGrams: number
  reason: string
  reference?: string | null
  createdBy: string
  createdAt: string
}

interface MaterialReadinessItem {
  materialName: string
  color: string | null
  availableGrams: number
  requiredGrams: number
  minimumGrams: number
  remainingGrams: number
  missingGrams: number
  status: 'READY' | 'LOW' | 'BLOCKED' | 'UNKNOWN'
}

export default function MaterialDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const { token, user } = useAuthStore()
  const { addToast } = useToastStore()

  const [stock, setStock] = useState<MaterialStockItem | null>(null)
  const [movements, setMovements] = useState<MaterialMovementItem[]>([])
  const [readinessItem, setReadinessItem] = useState<MaterialReadinessItem | null>(null)
  const [loading, setLoading] = useState(true)

  // Adjustment Modal State
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustDelta, setAdjustDelta] = useState<number | ''>('')
  const [adjustType, setAdjustType] = useState<'PURCHASE' | 'MANUAL_ADJUSTMENT'>('MANUAL_ADJUSTMENT')
  const [adjustReason, setAdjustReason] = useState<string>('')
  const [adjustReference, setAdjustReference] = useState<string>('')
  const [submittingAdjust, setSubmittingAdjust] = useState(false)

  const canManage = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const loadData = useCallback(async () => {
    if (!token || !id) return
    setLoading(true)
    try {
      const [stockRes, movRes, readinessRes] = await Promise.all([
        fetch(`/api/admin/materials/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/admin/materials/${id}/movements`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/materials/readiness', { headers: { Authorization: `Bearer ${token}` } }),
      ])

      const stockData = await stockRes.json()
      const movData = await movRes.json()
      const readinessData = await readinessRes.json()

      if (!stockData.success) {
        throw new Error(stockData.error || 'Malzeme detayları yüklenemedi.')
      }

      setStock(stockData.stock)
      setMovements(movData.movements || [])

      if (readinessData.success && readinessData.materials) {
        const found = readinessData.materials.find(
          (m: any) =>
            m.materialName.toLowerCase() === stockData.stock.materialName.toLowerCase() &&
            (m.color || '').toLowerCase() === (stockData.stock.color || '').toLowerCase()
        )
        setReadinessItem(found || null)
      }
    } catch (err: any) {
      addToast(err.message || 'Veriler alınamadı.', 'error')
    } finally {
      setLoading(false)
    }
  }, [id, token, addToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleConfirmAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stock || adjustDelta === '' || adjustDelta === 0) return
    if (!adjustReason.trim()) {
      addToast('Lütfen düzeltme gerekçesini belirtin.', 'error')
      return
    }

    setSubmittingAdjust(true)
    try {
      const idempotencyKey = `adj-detail-${stock.id}-${Date.now()}`
      const res = await fetch(`/api/admin/materials/${stock.id}/adjust`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deltaGrams: Number(adjustDelta),
          type: adjustType,
          reason: adjustReason.trim(),
          reference: adjustReference.trim() || undefined,
          idempotencyKey,
        }),
      })

      const data = await res.json()
      if (!data.success) {
        addToast(data.error || 'Stok düzeltilemedi.', 'error')
      } else {
        addToast('Stok hareketi başarıyla kaydedildi.', 'success')
        setShowAdjustModal(false)
        setAdjustDelta('')
        setAdjustReason('')
        setAdjustReference('')
        loadData()
      }
    } catch {
      addToast('İşlem sırasında hata oluştu.', 'error')
    } finally {
      setSubmittingAdjust(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Malzeme bilgileri yükleniyor...
        </div>
      </div>
    )
  }

  if (!stock) {
    return (
      <div className={styles.page}>
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--danger)', marginBottom: 16 }}>Malzeme kaydı bulunamadı.</p>
          <Link href="/admin/materials" className={styles.secondaryBtn}>
            &larr; Malzeme Listesine Dön
          </Link>
        </div>
      </div>
    )
  }

  const isLow = stock.quantityGrams <= stock.minimumQuantityGrams
  const readinessStatus = readinessItem ? readinessItem.status : isLow ? 'LOW' : 'READY'
  const statusCfg = getMaterialReadinessStatusConfig(readinessStatus)

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Link href="/admin/materials" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13 }}>
              &larr; Malzemeler
            </Link>
            <span style={{ color: 'var(--border)' }}>/</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
              #{stock.id.slice(0, 8)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className={styles.title}>
              {stock.materialName} {stock.color ? `— ${stock.color}` : ''}
            </h1>
            <span className={`${styles.badge} ${statusCfg.badgeClass}`}>
              {statusCfg.label}
            </span>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            Konum: <strong>{stock.location || 'Atölye Rafı'}</strong> · Son Güncelleme: {new Date(stock.updatedAt).toLocaleString('tr-TR')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => loadData()}
            disabled={loading}
          >
            Yenile
          </button>
          {canManage && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setShowAdjustModal(true)}
            >
              + Stok Hareketi Ekle
            </button>
          )}
        </div>
      </div>

      {/* Metrics Strip */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Fiziksel Stok</div>
          <div className={styles.metricValue} style={{ fontFamily: 'var(--font-mono)', color: isLow ? 'var(--warning)' : 'inherit' }}>
            {stock.quantityGrams.toLocaleString('tr-TR')} <span style={{ fontSize: 14, fontWeight: 500 }}>g</span>
          </div>
          <div className={styles.metricSub}>{(stock.quantityGrams / 1000).toFixed(2)} kg net hammadde</div>
        </div>

        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Üretim İhtiyacı</div>
          <div className={styles.metricValue} style={{ fontFamily: 'var(--font-mono)', color: 'var(--zuu-blue, #0284c7)' }}>
            {readinessItem?.requiredGrams ? readinessItem.requiredGrams.toLocaleString('tr-TR') : 0} <span style={{ fontSize: 14, fontWeight: 500 }}>g</span>
          </div>
          <div className={styles.metricSub}>Sırada bekleyen baskı emirleri</div>
        </div>

        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Net Kullanılabilir</div>
          <div className={styles.metricValue} style={{ fontFamily: 'var(--font-mono)', color: (readinessItem?.remainingGrams ?? stock.quantityGrams) <= 0 ? 'var(--danger)' : 'var(--success)' }}>
            {readinessItem ? readinessItem.remainingGrams.toLocaleString('tr-TR') : stock.quantityGrams.toLocaleString('tr-TR')} <span style={{ fontSize: 14, fontWeight: 500 }}>g</span>
          </div>
          <div className={styles.metricSub}>Üretim sonrası serbest bakiye</div>
        </div>

        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Kritik Eşik</div>
          <div className={styles.metricValue} style={{ fontFamily: 'var(--font-mono)' }}>
            {stock.minimumQuantityGrams.toLocaleString('tr-TR')} <span style={{ fontSize: 14, fontWeight: 500 }}>g</span>
          </div>
          <div className={styles.metricSub}>Minimum güvenlik seviyesi</div>
        </div>

        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Envanter Değeri</div>
          <div className={styles.metricValue} style={{ fontFamily: 'var(--font-mono)' }}>
            ₺{stock.pricePerKgTl ? (((stock.quantityGrams / 1000) * stock.pricePerKgTl)).toFixed(0) : '—'}
          </div>
          <div className={styles.metricSub}>{stock.pricePerKgTl ? `Birim: ₺${stock.pricePerKgTl}/kg` : 'Birim fiyat tanımsız'}</div>
        </div>
      </div>

      {/* Movement Ledger Card */}
      <div className={styles.cardPanel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Hammadde Hareket Defteri (Ledger) ({movements.length} kayıt)</span>
        </div>

        <div className={styles.panelBody} style={{ padding: 0 }}>
          {movements.length === 0 ? (
            <div className={styles.emptyState}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                Henüz kayıtlı stok hareketi yok.
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Satın alma girişi veya üretim sarfiyatı yapıldıkça burada listelenecektir.
              </div>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tarih & Saat</th>
                    <th>Hareket Tipi</th>
                    <th style={{ textAlign: 'right' }}>Miktar (Gram)</th>
                    <th style={{ textAlign: 'right' }}>Yeni Stok</th>
                    <th>Gerekçe & Referans</th>
                    <th>İşlemi Yapan</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(m.createdAt).toLocaleString('tr-TR')}
                      </td>
                      <td>
                        <span className={styles.badge} style={{ fontSize: 10 }}>
                          {m.type === 'PURCHASE'
                            ? 'Satın Alma'
                            : m.type === 'PRODUCTION_CONSUMPTION'
                            ? 'Baskı Sarfiyatı'
                            : m.type === 'WASTE'
                            ? 'Fire / Atık'
                            : 'Manuel Düzeltme'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: m.quantityGrams > 0 ? '#16a34a' : 'var(--danger)' }}>
                        {m.quantityGrams > 0 ? `+${m.quantityGrams.toLocaleString('tr-TR')}` : m.quantityGrams.toLocaleString('tr-TR')} g
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                        {m.newQuantityGrams.toLocaleString('tr-TR')} g
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        <div>{m.reason}</div>
                        {m.reference && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            Ref: {m.reference}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {m.createdBy || 'Sistem / Admin'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      {showAdjustModal && (
        <Modal
          isOpen={showAdjustModal}
          onClose={() => setShowAdjustModal(false)}
          ariaLabel="Hammadde Hareketi Ekle"
        >
          <form onSubmit={handleConfirmAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Hammadde Hareketi Kaydet
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              <strong>{stock.materialName} ({stock.color || 'Standart'})</strong> için stok girişi veya sarfiyat düzeltmesi yapıyorsunuz.
              Mevcut Stok: <strong>{stock.quantityGrams.toLocaleString('tr-TR')} g</strong>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Hareket Tipi
                </label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as any)}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 12 }}
                >
                  <option value="PURCHASE">Satın Alma Girişi (Purchase)</option>
                  <option value="MANUAL_ADJUSTMENT">Manuel Düzeltme (Sayım / Fire)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Değişim (Gram) (+ / -)
                </label>
                <input
                  type="number"
                  placeholder="Örn: +1000 veya -250"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                Açıklama / Gerekçe (Zorunlu)
              </label>
              <textarea
                rows={2}
                placeholder="Örn: Yeni rulo açıldı / tabla kalibrasyon firesi..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className={styles.searchBox}
                style={{ width: '100%', fontSize: 12, resize: 'vertical' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                Fatura / Tedarikçi Ref (Opsiyonel)
              </label>
              <input
                type="text"
                placeholder="Örn: IRS-2026-089"
                value={adjustReference}
                onChange={(e) => setAdjustReference(e.target.value)}
                className={styles.searchBox}
                style={{ width: '100%', fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setShowAdjustModal(false)}
                disabled={submittingAdjust}
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={submittingAdjust || adjustDelta === '' || !adjustReason.trim()}
              >
                {submittingAdjust ? 'Kaydediliyor...' : 'Hareketi Kaydet'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
