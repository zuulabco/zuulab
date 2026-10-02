'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import styles from '../admin.module.css'

type Provider = 'HEPSIBURADA' | 'TRENDYOL'
type Environment = 'STAGE' | 'PRODUCTION'

interface MarketplaceStore {
  id: string
  provider: Provider
  name: string
  externalMerchantId: string
  environment: Environment
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING'
  stockSyncEnabled: boolean
  priceSyncEnabled: boolean
  orderImportEnabled: boolean
  priceMarkupPercent: number
  hasCredentials: boolean
  credentialHint: string | null
  credentialVersion: number | null
  lastSuccessfulSync: string | null
  lastError: string | null
  lastConnectionCheck: string | null
}

interface ConnectionResult {
  success: boolean
  message: string
  code?: string
  latencyMs?: number
  details?: Record<string, unknown>
}

const PROVIDER_LABEL: Record<Provider, string> = { TRENDYOL: 'Trendyol', HEPSIBURADA: 'Hepsiburada' }

// Where each marketplace shows the values, and what they are called there.
const PROVIDER_FIELDS: Record<Provider, { sellerId: string; apiKey: string; apiSecret: string; help: string }> = {
  TRENDYOL: {
    sellerId: 'Satıcı ID (Supplier ID)',
    apiKey: 'API Key',
    apiSecret: 'API Secret',
    help: 'Trendyol Satıcı Paneli → Hesap Bilgilerim → Entegrasyon Bilgileri',
  },
  HEPSIBURADA: {
    sellerId: 'Merchant ID',
    apiKey: 'API kullanıcı adı',
    apiSecret: 'API şifresi / servis anahtarı',
    help: 'Hepsiburada Satıcı Paneli → Hesabım → Entegrasyon Bilgileri',
  },
}

interface StoreForm {
  provider: Provider
  name: string
  externalMerchantId: string
  environment: Environment
  apiKey: string
  apiSecret: string
  priceMarkupPercent: string
}

const EMPTY_FORM: StoreForm = {
  provider: 'TRENDYOL',
  name: '',
  externalMerchantId: '',
  environment: 'PRODUCTION',
  apiKey: '',
  apiSecret: '',
  priceMarkupPercent: '0',
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('tr-TR') : '—'
}

export default function AdminMarketplacesPage() {
  const { token, canFetch } = useAuthStore()
  const [stores, setStores] = useState<MarketplaceStore[]>([])
  const [loading, setLoading] = useState(true)
  const [filterProvider, setFilterProvider] = useState<'ALL' | Provider>('ALL')
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<(ConnectionResult & { storeName: string }) | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<StoreForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [keyStore, setKeyStore] = useState<MarketplaceStore | null>(null)
  const [keyForm, setKeyForm] = useState({ apiKey: '', apiSecret: '' })

  const [editStore, setEditStore] = useState<MarketplaceStore | null>(null)
  const [editForm, setEditForm] = useState({ name: '', environment: 'PRODUCTION' as Environment, priceMarkupPercent: '0' })

  const authHeaders = useCallback(
    (json = false): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }),
    [token]
  )

  // Initial state is already 'loading'; later reloads refresh the table in place.
  const loadStores = useCallback(() => {
    if (!canFetch) return
    fetch('/api/admin/marketplaces/stores', { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.stores)) setStores(data.stores)
        else setNotification({ text: data.error || 'Mağazalar yüklenemedi.', type: 'error' })
      })
      .catch(() => setNotification({ text: 'Mağazalar yüklenemedi.', type: 'error' }))
      .finally(() => setLoading(false))
  }, [canFetch, authHeaders])

  useEffect(() => {
    loadStores()
  }, [loadStores])

  async function patchStore(store: MarketplaceStore, changes: Record<string, unknown>, successText?: string) {
    setBusyId(store.id)
    setNotification(null)
    try {
      const res = await fetch(`/api/admin/marketplaces/stores/${store.id}`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify(changes),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Mağaza güncellenemedi.')
      setStores((list) => list.map((s) => (s.id === store.id ? data.store : s)))
      if (successText) setNotification({ text: successText, type: 'success' })
      return true
    } catch (err) {
      setNotification({ text: err instanceof Error ? err.message : 'Mağaza güncellenemedi.', type: 'error' })
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function handleTest(store: MarketplaceStore) {
    setTestingId(store.id)
    setTestResult(null)
    try {
      const res = await fetch(`/api/admin/marketplaces/stores/${store.id}/test`, { method: 'POST', headers: authHeaders() })
      const data = await res.json()
      setTestResult({
        storeName: store.name,
        ...(data.result ?? { success: false, message: data.error || 'Bağlantı testi yapılamadı.', code: 'PROVIDER_ERROR' }),
      })
      loadStores()
    } catch {
      setTestResult({ storeName: store.name, success: false, message: 'Ağ hatası oluştu.', code: 'NETWORK_ERROR' })
    } finally {
      setTestingId(null)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setNotification(null)
    try {
      const res = await fetch('/api/admin/marketplaces/stores', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          provider: form.provider,
          name: form.name,
          externalMerchantId: form.externalMerchantId,
          environment: form.environment,
          apiKey: form.apiKey || undefined,
          apiSecret: form.apiSecret || undefined,
          priceMarkupPercent: Number(form.priceMarkupPercent || 0),
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Mağaza oluşturulamadı.')
      setShowAdd(false)
      setForm(EMPTY_FORM)
      setNotification({
        text: `"${data.store.name}" eklendi.${data.store.hasCredentials ? ' Şimdi "Bağlantı testi" ile anahtarları doğrulayın.' : ''}`,
        type: 'success',
      })
      loadStores()
    } catch (err) {
      setNotification({ text: err instanceof Error ? err.message : 'Mağaza oluşturulamadı.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleKeys(e: React.FormEvent) {
    e.preventDefault()
    if (!keyStore) return
    setSaving(true)
    setNotification(null)
    try {
      const res = await fetch(`/api/admin/marketplaces/stores/${keyStore.id}/rotate-credentials`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(keyForm),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Anahtarlar kaydedilemedi.')
      const store = keyStore
      setKeyStore(null)
      setKeyForm({ apiKey: '', apiSecret: '' })
      setNotification({ text: `${store.name}: API anahtarları şifrelenerek kaydedildi. Bağlantı test ediliyor…`, type: 'success' })
      loadStores()
      await handleTest(store)
    } catch (err) {
      setNotification({ text: err instanceof Error ? err.message : 'Anahtarlar kaydedilemedi.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editStore) return
    setSaving(true)
    const ok = await patchStore(
      editStore,
      {
        name: editForm.name,
        environment: editForm.environment,
        priceMarkupPercent: Number(editForm.priceMarkupPercent || 0),
      },
      `${editForm.name} güncellendi.`
    )
    setSaving(false)
    if (ok) setEditStore(null)
  }

  async function handleDelete(store: MarketplaceStore) {
    if (!window.confirm(`"${store.name}" mağazası ve kayıtlı API anahtarları silinsin mi?`)) return
    setBusyId(store.id)
    try {
      const res = await fetch(`/api/admin/marketplaces/stores/${store.id}`, { method: 'DELETE', headers: authHeaders() })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Mağaza silinemedi.')
      setStores((list) => list.filter((s) => s.id !== store.id))
      setNotification({ text: `"${store.name}" silindi.`, type: 'success' })
    } catch (err) {
      setNotification({ text: err instanceof Error ? err.message : 'Mağaza silinemedi.', type: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  const filtered = stores.filter((s) => filterProvider === 'ALL' || s.provider === filterProvider)
  const count = (p: Provider) => stores.filter((s) => s.provider === p).length
  const fields = PROVIDER_FIELDS[form.provider]

  return (
    <div className={styles.adminPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Pazaryeri Mağazaları</h1>
          <p className={styles.pageSubtitle}>
            Trendyol ve Hepsiburada mağazalarınızın API bağlantıları ve senkronizasyon ayarları
          </p>
        </div>
        <button className={styles.primaryButton} onClick={() => { setForm(EMPTY_FORM); setShowAdd(true) }}>
          + Mağaza Ekle
        </button>
      </div>

      {notification && (
        <div
          role="status"
          className={`${styles.badge} ${notification.type === 'success' ? styles.badgeSuccess : styles.badgeDanger}`}
          style={{ display: 'block', padding: '10px 14px', marginBottom: 16, fontSize: 13, whiteSpace: 'normal' }}
        >
          {notification.text}
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
        API anahtarları veritabanında şifreli saklanır ve bir daha gösterilmez; yalnızca son 4 karakteri görünür.
        Stok ve fiyat gönderimi her mağaza için ayrı ayrı açılır. Kapalıyken pazaryerine hiçbir değişiklik yazılmaz.
      </p>

      <div className={styles.operationalTabs}>
        {(['ALL', 'TRENDYOL', 'HEPSIBURADA'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilterProvider(tab)}
            className={`${styles.operationalTabItem} ${filterProvider === tab ? styles.active : ''}`}
          >
            {tab === 'ALL' ? `Tümü (${stores.length})` : `${PROVIDER_LABEL[tab]} (${count(tab)})`}
          </button>
        ))}
      </div>

      <div className={styles.tableCard}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Yükleniyor…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            Henüz mağaza yok. &quot;+ Mağaza Ekle&quot; ile API bilgilerinizi girin.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Mağaza</th>
                <th>Satıcı ID / Ortam</th>
                <th>API Anahtarı</th>
                <th>Bağlantı</th>
                <th>Sipariş al</th>
                <th>Stok gönder</th>
                <th>Fiyat gönder</th>
                <th>Fiyat farkı</th>
                <th>Durum</th>
                <th style={{ textAlign: 'right' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((store) => {
                const busy = busyId === store.id
                return (
                  <tr key={store.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{store.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{PROVIDER_LABEL[store.provider]}</div>
                    </td>
                    <td>
                      <code style={{ fontSize: 11 }}>{store.externalMerchantId}</code>
                      <div style={{ fontSize: 10, color: store.environment === 'PRODUCTION' ? '#166534' : '#854d0e' }}>
                        {store.environment === 'PRODUCTION' ? 'Canlı' : 'Test (Stage)'}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {store.hasCredentials ? (
                        <>
                          <code>{store.credentialHint}</code>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>v{store.credentialVersion}</div>
                        </>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeWarning}`}>Girilmedi</span>
                      )}
                    </td>
                    <td style={{ fontSize: 11, maxWidth: 220 }}>
                      {!store.lastConnectionCheck ? (
                        <span style={{ color: 'var(--text-muted)' }}>Test edilmedi</span>
                      ) : store.lastError ? (
                        <span title={store.lastError} style={{ color: '#dc2626', fontWeight: 600 }}>
                          Hata · {formatDate(store.lastConnectionCheck)}
                        </span>
                      ) : (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>
                          Başarılı · {formatDate(store.lastConnectionCheck)}
                        </span>
                      )}
                    </td>
                    {(['orderImportEnabled', 'stockSyncEnabled', 'priceSyncEnabled'] as const).map((key) => (
                      <td key={key}>
                        <input
                          type="checkbox"
                          aria-label={key}
                          checked={store[key]}
                          disabled={busy}
                          onChange={(e) => patchStore(store, { [key]: e.target.checked })}
                        />
                      </td>
                    ))}
                    <td style={{ fontSize: 12 }}>%{store.priceMarkupPercent.toLocaleString('tr-TR')}</td>
                    <td>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => patchStore(store, { status: store.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
                        className={`${styles.badge} ${store.status === 'ACTIVE' ? styles.badgeSuccess : styles.badgeNeutral}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        title="Aktif/Pasif yap"
                      >
                        {store.status === 'ACTIVE' ? 'Aktif' : store.status === 'ERROR' ? 'Hata' : 'Pasif'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          disabled={testingId === store.id || !store.hasCredentials}
                          onClick={() => handleTest(store)}
                        >
                          {testingId === store.id ? 'Test ediliyor…' : 'Bağlantı testi'}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => { setKeyStore(store); setKeyForm({ apiKey: '', apiSecret: '' }) }}
                        >
                          {store.hasCredentials ? 'Anahtarları değiştir' : 'Anahtar gir'}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => {
                            setEditStore(store)
                            setEditForm({
                              name: store.name,
                              environment: store.environment,
                              priceMarkupPercent: String(store.priceMarkupPercent),
                            })
                          }}
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          disabled={busy}
                          onClick={() => handleDelete(store)}
                        >
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {testResult && (
        <div className={styles.modalOverlay} onClick={() => setTestResult(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3 style={{ marginTop: 0 }}>Bağlantı testi: {testResult.storeName}</h3>
            <div
              className={`${styles.badge} ${testResult.success ? styles.badgeSuccess : styles.badgeDanger}`}
              style={{ display: 'block', padding: 12, whiteSpace: 'normal', fontSize: 13, lineHeight: 1.5 }}
            >
              <strong>{testResult.success ? 'Bağlantı başarılı' : 'Bağlantı başarısız'}</strong>
              {testResult.code ? ` (${testResult.code})` : ''}
              {testResult.latencyMs ? ` · ${testResult.latencyMs} ms` : ''}
              <div style={{ marginTop: 4 }}>{testResult.message}</div>
            </div>
            {testResult.details && (
              <pre style={{ fontSize: 11, background: 'var(--surface-2)', padding: 10, borderRadius: 4, overflowX: 'auto' }}>
                {JSON.stringify(testResult.details, null, 2)}
              </pre>
            )}
            <div style={{ textAlign: 'right', marginTop: 12 }}>
              <button className={styles.secondaryButton} onClick={() => setTestResult(null)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className={styles.modalOverlay}>
          <form className={styles.modalContent} onSubmit={handleAdd} style={{ maxWidth: 540 }}>
            <h3 style={{ marginTop: 0 }}>Mağaza ekle</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Pazaryeri</label>
                <select
                  className={styles.select}
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value as Provider })}
                >
                  <option value="TRENDYOL">Trendyol</option>
                  <option value="HEPSIBURADA">Hepsiburada</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ortam</label>
                <select
                  className={styles.select}
                  value={form.environment}
                  onChange={(e) => setForm({ ...form, environment: e.target.value as Environment })}
                >
                  <option value="PRODUCTION">Canlı</option>
                  <option value="STAGE">Test (Stage)</option>
                </select>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Mağaza adı (sizin için)</label>
              <input
                className={styles.input}
                required
                placeholder="Örn: ZUULAB Trendyol Ana Mağaza"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px' }}>
              Bilgilerin yeri: {fields.help}
            </p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{fields.sellerId}</label>
              <input
                className={styles.input}
                required
                inputMode="numeric"
                value={form.externalMerchantId}
                onChange={(e) => setForm({ ...form, externalMerchantId: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{fields.apiKey}</label>
                <input
                  className={styles.input}
                  type="password"
                  autoComplete="off"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{fields.apiSecret}</label>
                <input
                  className={styles.input}
                  type="password"
                  autoComplete="off"
                  value={form.apiSecret}
                  onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Fiyat farkı (%): pazaryeri fiyatı = site fiyatı × (1 + fark/100)</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.priceMarkupPercent}
                onChange={(e) => setForm({ ...form, priceMarkupPercent: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowAdd(false)} disabled={saving}>
                İptal
              </button>
              <button type="submit" className={styles.primaryButton} disabled={saving}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}

      {keyStore && (
        <div className={styles.modalOverlay}>
          <form className={styles.modalContent} onSubmit={handleKeys} style={{ maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>{keyStore.name}: API anahtarları</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {PROVIDER_FIELDS[keyStore.provider].help}. Anahtarlar şifrelenerek saklanır; kayıttan sonra bağlantı
              otomatik test edilir.
            </p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{PROVIDER_FIELDS[keyStore.provider].apiKey}</label>
              <input
                className={styles.input}
                type="password"
                autoComplete="off"
                required
                value={keyForm.apiKey}
                onChange={(e) => setKeyForm({ ...keyForm, apiKey: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{PROVIDER_FIELDS[keyStore.provider].apiSecret}</label>
              <input
                className={styles.input}
                type="password"
                autoComplete="off"
                required
                value={keyForm.apiSecret}
                onChange={(e) => setKeyForm({ ...keyForm, apiSecret: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className={styles.secondaryButton} onClick={() => setKeyStore(null)} disabled={saving}>
                İptal
              </button>
              <button type="submit" className={styles.primaryButton} disabled={saving}>
                {saving ? 'Kaydediliyor…' : 'Kaydet ve test et'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editStore && (
        <div className={styles.modalOverlay}>
          <form className={styles.modalContent} onSubmit={handleEdit} style={{ maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>Mağazayı düzenle</h3>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Mağaza adı</label>
              <input
                className={styles.input}
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Ortam</label>
              <select
                className={styles.select}
                value={editForm.environment}
                onChange={(e) => setEditForm({ ...editForm, environment: e.target.value as Environment })}
              >
                <option value="PRODUCTION">Canlı</option>
                <option value="STAGE">Test (Stage)</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Fiyat farkı (%)</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={editForm.priceMarkupPercent}
                onChange={(e) => setEditForm({ ...editForm, priceMarkupPercent: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className={styles.secondaryButton} onClick={() => setEditStore(null)} disabled={saving}>
                İptal
              </button>
              <button type="submit" className={styles.primaryButton} disabled={saving}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
