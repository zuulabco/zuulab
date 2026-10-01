'use client'

import React, { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getMarketplaceStatusConfig } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'

interface MarketplaceStore {
  id: string
  provider: 'HEPSIBURADA' | 'TRENDYOL'
  name: string
  code: string
  displayName: string
  externalMerchantId: string
  environment: 'STAGE' | 'PRODUCTION'
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING'
  lastSuccessfulSync: string | null
  lastFailedSync: string | null
  lastError: string | null
  lastConnectionCheck: string | null
  createdAt: string
}

export default function AdminMarketplacesPage() {
  const { token, canFetch } = useAuthStore()
  const [stores, setStores] = useState<MarketplaceStore[]>([])
  const [loading, setLoading] = useState(true)
  const [filterProvider, setFilterProvider] = useState<string>('ALL')

  // Action states
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    storeId: string
    success: boolean
    message: string
    code?: string
    details?: any
  } | null>(null)

  // Rotate Modal state
  const [rotateStore, setRotateStore] = useState<MarketplaceStore | null>(null)
  const [rotateKey, setRotateKey] = useState('')
  const [rotateSecret, setRotateSecret] = useState('')
  const [rotateLoading, setRotateLoading] = useState(false)

  // Add Store Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newProvider, setNewProvider] = useState<'HEPSIBURADA' | 'TRENDYOL'>('HEPSIBURADA')
  const [newName, setNewName] = useState('')
  const [newMerchantId, setNewMerchantId] = useState('')
  const [newEnvironment, setNewEnvironment] = useState<'STAGE' | 'PRODUCTION'>('STAGE')
  const [newApiKey, setNewApiKey] = useState('')
  const [newApiSecret, setNewApiSecret] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const [notification, setNotification] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  const loadStores = () => {
    if (!canFetch) return
    setLoading(true)
    fetch('/api/admin/marketplaces/stores', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.stores)) {
          setStores(data.stores)
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadStores()
  }, [token, canFetch, canFetch])

  const handleTestConnection = async (storeId: string) => {
    if (!canFetch) return
    setTestingId(storeId)
    setTestResult(null)
    setNotification(null)

    try {
      const res = await fetch(`/api/admin/marketplaces/stores/${storeId}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()

      if (data.result) {
        setTestResult({
          storeId,
          success: data.result.success,
          message: data.result.message,
          code: data.result.code,
          details: data.result.details,
        })
      } else {
        setTestResult({
          storeId,
          success: false,
          message: data.error || 'Bağlantı testi başarısız oldu.',
          code: 'PROVIDER_ERROR',
        })
      }
      loadStores()
    } catch (err: any) {
      setTestResult({
        storeId,
        success: false,
        message: err.message || 'Ağ hatası oluştu.',
        code: 'NETWORK_ERROR',
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleRotateCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch || !rotateStore) return

    setRotateLoading(true)
    setNotification(null)

    try {
      const res = await fetch(
        `/api/admin/marketplaces/stores/${rotateStore.id}/rotate-credentials`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            apiKey: rotateKey,
            apiSecret: rotateSecret,
          }),
        }
      )
      const data = await res.json()

      if (data.success) {
        setNotification({
          text: `[${rotateStore.name}] API anahtarları v${data.version} olarak döndürüldü.`,
          type: 'success',
        })
        setRotateStore(null)
        setRotateKey('')
        setRotateSecret('')
        loadStores()
      } else {
        setNotification({
          text: data.error || 'Anahtar döndürme başarısız oldu.',
          type: 'error',
        })
      }
    } catch (err: any) {
      setNotification({
        text: err.message || 'İşlem sırasında bir hata oluştu.',
        type: 'error',
      })
    } finally {
      setRotateLoading(false)
    }
  }

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch) return

    setAddLoading(true)
    setNotification(null)

    try {
      const res = await fetch('/api/admin/marketplaces/stores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: newProvider,
          name: newName,
          externalMerchantId: newMerchantId,
          environment: newEnvironment,
          apiKey: newApiKey || undefined,
          apiSecret: newApiSecret || undefined,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setNotification({
          text: `Yeni mağaza "${data.store.name}" başarıyla eklendi.`,
          type: 'success',
        })
        setShowAddModal(false)
        setNewName('')
        setNewMerchantId('')
        setNewApiKey('')
        setNewApiSecret('')
        loadStores()
      } else {
        setNotification({
          text: data.error || 'Mağaza oluşturulamadı.',
          type: 'error',
        })
      }
    } catch (err: any) {
      setNotification({
        text: err.message || 'Bağlantı hatası.',
        type: 'error',
      })
    } finally {
      setAddLoading(false)
    }
  }

  const filteredStores = stores.filter((s) => {
    if (filterProvider === 'ALL') return true
    return s.provider === filterProvider
  })

  return (
    <div className={styles.adminPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Pazaryeri Entegrasyon Merkezi</h1>
          <p className={styles.pageSubtitle}>
            Hepsiburada ve Trendyol mağaza bağlantıları, kimlik doğrulama ve operasyonel durumlar
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={styles.primaryButton}
            onClick={() => setShowAddModal(true)}
          >
            + Yeni Mağaza Ekle
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

      {/* Architecture Readiness Notice */}
      <div
        style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 'var(--radius-sm)',
          padding: '14px 16px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <strong style={{ color: '#b45309', fontSize: '13px' }}>
            Phase 16 — Marketplace Architecture Foundation
          </strong>
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: '#92400e', lineHeight: '1.5' }}>
          ZUULAB çoklu mağaza mimarisi (2 Hepsiburada + 2 Trendyol) ve V2 OMS order contract hazırlandı.
          Güvenlik gereği canlı API anahtarları bağlanmamış olup, operasyonel sipariş akışı ve stok senkronizasyonu
          Phase 17+ kapsamında canlıya alınacaktır.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className={styles.operationalTabs}>
        {(['ALL', 'HEPSIBURADA', 'TRENDYOL'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilterProvider(tab)}
            className={`${styles.operationalTabItem} ${filterProvider === tab ? styles.active : ''}`}
          >
            {tab === 'ALL'
              ? 'Tüm Mağazalar'
              : tab === 'HEPSIBURADA'
              ? 'Hepsiburada (2)'
              : 'Trendyol (2)'}
          </button>
        ))}
      </div>

      {/* Stores Table */}
      <div className={styles.tableCard}>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Mağaza bağlantıları yükleniyor...
          </div>
        ) : filteredStores.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Kayıtlı mağaza bulunamadı.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pazaryeri</th>
                <th>Mağaza / Görünüm</th>
                <th>Satıcı ID</th>
                <th>Ortam</th>
                <th>Durum</th>
                <th>Son Senkronizasyon</th>
                <th>Bağlantı Kontrolü</th>
                <th style={{ textAlign: 'right' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredStores.map((store) => (
                <tr key={store.id}>
                  <td>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor:
                          store.provider === 'HEPSIBURADA'
                            ? '#ea580c'
                            : '#f59e0b',
                        color: '#fff',
                      }}
                    >
                      {store.provider}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {store.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {store.displayName}
                    </div>
                  </td>
                  <td>
                    <code style={{ fontSize: '11px', color: 'var(--zuu-blue)', background: 'var(--surface-2)', padding: '2px 5px', borderRadius: 3 }}>
                      {store.externalMerchantId}
                    </code>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        backgroundColor: 'var(--surface-2)',
                        color: store.environment === 'PRODUCTION' ? '#166534' : '#854d0e',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {store.environment}
                    </span>
                  </td>
                  <td>
                    {(() => {
                      const statusCfg = getMarketplaceStatusConfig(store.status)
                      return (
                        <span className={`${styles.badge} ${styles[statusCfg.badgeClass] || styles.badgeNeutral}`}>
                          {statusCfg.label}
                        </span>
                      )
                    })()}
                  </td>
                  <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {store.lastSuccessfulSync ? (
                      new Date(store.lastSuccessfulSync).toLocaleString('tr-TR')
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Henüz senkronize edilmedi</span>
                    )}
                  </td>
                  <td style={{ fontSize: '11px' }}>
                    {store.lastConnectionCheck ? (
                      <div>
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>Hazır</span>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {new Date(store.lastConnectionCheck).toLocaleTimeString('tr-TR')}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Test Edilmedi</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => handleTestConnection(store.id)}
                        disabled={testingId === store.id}
                        className={styles.secondaryButton}
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                      >
                        {testingId === store.id ? 'Test Ediliyor...' : 'Bağlantı Testi'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRotateStore(store)
                          setRotateKey('')
                          setRotateSecret('')
                        }}
                        className={styles.secondaryButton}
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                      >
                        Anahtar Döndür
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Connection Test Result Modal / Drawer */}
      {testResult && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#f8fafc' }}>
              Bağlantı Mimarisi Doğrulama Sonucu
            </h3>
            <div
              style={{
                padding: '12px',
                borderRadius: '6px',
                fontSize: '13px',
                backgroundColor: testResult.success
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${
                  testResult.success ? '#059669' : '#dc2626'
                }`,
                color: testResult.success ? '#6ee7b7' : '#fca5a5',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                {testResult.success ? 'BAĞLANTI BAŞARILI' : 'BAĞLANTI HATASI'}
                {testResult.code ? ` (${testResult.code})` : ''}
              </div>
              <div>{testResult.message}</div>
            </div>

            {testResult.details && (
              <pre
                style={{
                  background: '#0f172a',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: '#94a3b8',
                  overflowX: 'auto',
                }}
              >
                {JSON.stringify(testResult.details, null, 2)}
              </pre>
            )}

            <div style={{ textAlign: 'right', marginTop: '16px' }}>
              <button
                className={styles.secondaryButton}
                onClick={() => setTestResult(null)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rotate Credentials Modal */}
      {rotateStore && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '480px',
              width: '90%',
            }}
          >
            <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#f8fafc' }}>
              API Anahtarlarını Güvenli Döndür (Rotation)
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#94a3b8' }}>
              {rotateStore.name} ({rotateStore.provider}) için yeni API anahtarlarını giriniz.
              Girdiğiniz anahtarlar şifrelenerek saklanır ve asla açık metin olarak loglanmaz.
            </p>

            <form onSubmit={handleRotateCredentials}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                  Yeni API Key
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••••••"
                  value={rotateKey}
                  onChange={(e) => setRotateKey(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #475569',
                    backgroundColor: '#0f172a',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                  Yeni API Secret
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••••••"
                  value={rotateSecret}
                  onChange={(e) => setRotateSecret(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #475569',
                    backgroundColor: '#0f172a',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setRotateStore(null)}
                  disabled={rotateLoading}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={rotateLoading}
                >
                  {rotateLoading ? 'Döndürülüyor...' : 'Anahtarları Güncelle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Store Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '520px',
              width: '90%',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#f8fafc' }}>
              Yeni Pazaryeri Mağazası Ekle
            </h3>

            <form onSubmit={handleAddStore}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                    Pazaryeri Sağlayıcısı
                  </label>
                  <select
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid #475569',
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  >
                    <option value="HEPSIBURADA">Hepsiburada</option>
                    <option value="TRENDYOL">Trendyol</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                    Çalışma Ortamı
                  </label>
                  <select
                    value={newEnvironment}
                    onChange={(e) => setNewEnvironment(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid #475569',
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  >
                    <option value="STAGE">STAGE (Test)</option>
                    <option value="PRODUCTION">PRODUCTION</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                  Mağaza Tanım Adı
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: ZUULAB Hepsiburada Mağaza 3"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #475569',
                    backgroundColor: '#0f172a',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                  {newProvider === 'HEPSIBURADA' ? 'Satıcı ID (merchantId)' : 'Tedarikçi ID (supplierId)'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: hb-merch-003 veya 100984"
                  value={newMerchantId}
                  onChange={(e) => setNewMerchantId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #475569',
                    backgroundColor: '#0f172a',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                    API Key (Opsiyonel)
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••••••"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid #475569',
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                    API Secret (Opsiyonel)
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••••••"
                    value={newApiSecret}
                    onChange={(e) => setNewApiSecret(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid #475569',
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setShowAddModal(false)}
                  disabled={addLoading}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={addLoading}
                >
                  {addLoading ? 'Kaydediliyor...' : 'Mağazayı Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
