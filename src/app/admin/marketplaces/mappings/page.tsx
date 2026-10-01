'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { getMappingStatusConfig } from '@/lib/constants/admin-status'
import Modal from '@/components/common/Modal'
import styles from '../../admin.module.css'

interface MarketplaceProductMapping {
  id: string
  storeId: string
  productId: string
  productName: string
  productSku: string
  productBarcode: string | null
  externalProductId: string | null
  externalSku: string
  externalBarcode: string | null
  status: string
  lastSyncedAt: string | null
  createdAt: string
}

interface MarketplaceStore {
  id: string
  name: string
  provider: string
}

export default function AdminMarketplaceMappingsPage() {
  const { token } = useAuthStore()
  const [mappings, setMappings] = useState<MarketplaceProductMapping[]>([])
  const [stores, setStores] = useState<MarketplaceStore[]>([])
  const [loading, setLoading] = useState(true)

  // Products from catalog
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string; barcode?: string }>>([])

  // Add Modal state (UI-16 Global Modal)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [externalSku, setExternalSku] = useState('')
  const [externalBarcode, setExternalBarcode] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Delete Confirmation Modal (UI-16 Global Modal)
  const [deleteConfirmMapping, setDeleteConfirmMapping] = useState<MarketplaceProductMapping | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const loadData = () => {
    if (!token) return
    setLoading(true)

    Promise.all([
      fetch('/api/admin/marketplaces/mappings', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
      fetch('/api/admin/marketplaces/stores', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
      fetch('/api/admin/products?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .catch(() => ({ products: [] })),
    ])
      .then(([mappingsData, storesData, productsData]) => {
        if (mappingsData.success && Array.isArray(mappingsData.mappings)) {
          setMappings(mappingsData.mappings)
        }
        if (storesData.success && Array.isArray(storesData.stores)) {
          setStores(storesData.stores)
          if (storesData.stores.length > 0 && !selectedStoreId) {
            setSelectedStoreId(storesData.stores[0].id)
          }
        }
        if (productsData.success && Array.isArray(productsData.products)) {
          setProducts(productsData.products)
          if (productsData.products.length > 0 && !selectedProductId) {
            setSelectedProductId(productsData.products[0].id)
          }
        }
      })
      .catch((err) => {
        console.error('Mappings fetch error:', err)
        toast.error('Eşleştirme verileri alınamadı.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [token])

  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    setAddLoading(true)
    try {
      const res = await fetch('/api/admin/marketplaces/mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storeId: selectedStoreId,
          productId: selectedProductId,
          externalSku: externalSku.trim(),
          externalBarcode: externalBarcode.trim() || undefined,
        }),
      })
      const data = await res.json()

      if (data.success) {
        toast.success(`"${data.mapping?.productName || 'Ürün'}" için SKU eşleştirmesi oluşturuldu.`)
        setShowAddModal(false)
        setExternalSku('')
        setExternalBarcode('')
        loadData()
      } else {
        toast.error(data.error || 'Eşleştirme oluşturulamadı.')
      }
    } catch (err: any) {
      toast.error(err.message || 'Bağlantı hatası.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleDeleteConfirmed = async () => {
    if (!token || !deleteConfirmMapping) return
    setDeleteLoading(true)

    try {
      const res = await fetch(`/api/admin/marketplaces/mappings/${deleteConfirmMapping.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()

      if (data.success) {
        toast.success('Eşleştirme başarıyla kaldırıldı.')
        setDeleteConfirmMapping(null)
        loadData()
      } else {
        toast.error(data.error || 'Silme işlemi başarısız oldu.')
      }
    } catch (err: any) {
      toast.error(err.message || 'Hata oluştu.')
    } finally {
      setDeleteLoading(false)
    }
  }

  const getStoreName = (storeId: string) => {
    const s = stores.find((st) => st.id === storeId)
    return s ? `${s.name} (${s.provider})` : storeId
  }

  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ürün Eşleştirme (Product Mapping)</h1>
          <p className={styles.pageSubtitle}>
            ZUULAB katalog ürünlerinin Trendyol ve Hepsiburada SKU/barkodlarıyla deterministik birebir eşleştirmesi.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/admin/marketplaces" className={`${styles.btn} ${styles.btnSecondary}`}>
            ← Mağazalara Dön
          </Link>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setShowAddModal(true)}
          >
            + Yeni Eşleştirme Ekle
          </button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Aktif Eşleştirme</div>
          <div className={`${styles.metricValue} ${styles.metricSuccess}`}>{mappings.length}</div>
          <div className={styles.metricSub}>Katalog ile Senkron</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Bağlı Mağazalar</div>
          <div className={styles.metricValue}>{stores.length}</div>
          <div className={styles.metricSub}>Pazaryeri Entegrasyonu</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Katalog Ürün Havuzu</div>
          <div className={styles.metricValue}>{products.length}</div>
          <div className={styles.metricSub}>Eşleşmeye Hazır</div>
        </div>
      </div>

      {/* Mappings Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>ZUULAB Ürünü</th>
                <th>Katalog SKU</th>
                <th>Hedef Pazaryeri</th>
                <th>Pazaryeri SKU</th>
                <th>Pazaryeri Barkod</th>
                <th>Durum</th>
                <th style={{ textAlign: 'center' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Eşleştirmeler yükleniyor...
                  </td>
                </tr>
              ) : mappings.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.emptyState}>
                      <div className={styles.emptyStateTitle}>Kayıtlı ürün eşleştirmesi bulunamadı</div>
                      <div className={styles.emptyStateDesc}>
                        Pazaryerlerinden gelen siparişlerin depoda doğru ürünle toplanabilmesi için ürün SKU eşleştirmesi ekleyin.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                mappings.map((m) => {
                  const statusCfg = getMappingStatusConfig(m.status || 'MATCHED')
                  return (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>
                        <Link
                          href={`/admin/products/${m.productId}`}
                          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                        >
                          {m.productName}
                        </Link>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: 'var(--brand-blue, var(--zuu-blue))' }}>
                        {m.productSku}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                          {getStoreName(m.storeId)}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: 'var(--warning)' }}>
                        {m.externalSku}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-muted)' }}>
                        {m.externalBarcode || '—'}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles[statusCfg.badgeClass] || styles.badgeSuccess}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmMapping(m)}
                          className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`}
                        >
                          Kaldır
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Mapping Modal (UI-16 Global Modal) */}
      {showAddModal && (
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          ariaLabel="Yeni Ürün Eşleştirmesi"
          maxWidth={500}
        >
          <form onSubmit={handleCreateMapping} style={{ padding: '4px 0' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 16px', color: 'var(--text-primary)' }}>
              Yeni Ürün Eşleştirmesi Ekle
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Hedef Pazaryeri Mağazası</label>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className={styles.formSelect}
                  required
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>ZUULAB Katalog Ürünü</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className={styles.formSelect}
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (SKU: {p.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Pazaryeri SKU / Barkod Kodu *</label>
                <input
                  type="text"
                  required
                  placeholder="örn: TY-DINO-01 veya HB-88392"
                  value={externalSku}
                  onChange={(e) => setExternalSku(e.target.value)}
                  className={styles.formInput}
                  style={{ fontFamily: 'var(--font-mono, monospace)' }}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Pazaryeri EAN / Barkod (Opsiyonel)</label>
                <input
                  type="text"
                  placeholder="örn: 8680000000000"
                  value={externalBarcode}
                  onChange={(e) => setExternalBarcode(e.target.value)}
                  className={styles.formInput}
                  style={{ fontFamily: 'var(--font-mono, monospace)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={addLoading}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                {addLoading ? 'Kaydediliyor...' : 'Eşleştirmeyi Kaydet'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal (UI-16 Global Modal) */}
      {deleteConfirmMapping && (
        <Modal
          isOpen={Boolean(deleteConfirmMapping)}
          onClose={() => setDeleteConfirmMapping(null)}
          ariaLabel="Eşleştirme Silme Onayı"
          maxWidth={440}
        >
          <div style={{ padding: '4px 0' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>
              Eşleştirmeyi Kaldır
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 18px' }}>
              <strong>{deleteConfirmMapping.productName}</strong> ürününün pazaryeri SKU ({deleteConfirmMapping.externalSku}) bağlantısı kaldırılacaktır. Onaylıyor musunuz?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmMapping(null)}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDeleteConfirmed}
                className={`${styles.btn} ${styles.btnDanger}`}
              >
                {deleteLoading ? 'Kaldırılıyor...' : 'Evet, Kaldır'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
