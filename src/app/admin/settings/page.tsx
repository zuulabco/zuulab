'use client'

import React, { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import styles from '../admin.module.css'

export default function AdminSettingsPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'COMMERCE' | 'ORDERS' | 'INTEGRATIONS' | 'MAINTENANCE'>('GENERAL')

  // Maintenance mode state
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)
  const [maintenanceToggling, setMaintenanceToggling] = useState(false)
  const [maintenanceStatus, setMaintenanceStatus] = useState<{
    enabled: boolean
    source: 'database' | 'env' | 'default'
    allowedIps: string[]
    updatedAt?: string
  }>({
    enabled: false,
    source: 'default',
    allowedIps: [],
  })

  // Store settings
  const [storeName, setStoreName] = useState('')
  const [storeEmail, setStoreEmail] = useState('')
  const [storePhone, setStorePhone] = useState('')
  const [storeAddress, setStoreAddress] = useState('')

  // Commerce
  const [currency, setCurrency] = useState('TRY')
  const [taxRate, setTaxRate] = useState<number | ''>(20)
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | ''>(750)

  // Orders
  const [orderPrefix, setOrderPrefix] = useState('ZUU-2026')
  const [allowCustomerCancellation, setAllowCustomerCancellation] = useState(true)

  const fetchMaintenanceStatus = async () => {
    if (!canFetch) return
    try {
      setMaintenanceLoading(true)
      const res = await fetch('/api/admin/settings/maintenance', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.success && json.data) {
        setMaintenanceStatus(json.data)
      }
    } catch {
      // Non-blocking
    } finally {
      setMaintenanceLoading(false)
    }
  }

  const handleToggleMaintenance = async () => {
    if (!canFetch || maintenanceToggling) return
    const nextState = !maintenanceStatus.enabled
    setMaintenanceToggling(true)

    try {
      const res = await fetch('/api/admin/settings/maintenance', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: nextState }),
      })

      const json = await res.json()
      if (json.success && json.data) {
        setMaintenanceStatus(json.data)
        addToast(
          nextState
            ? 'Bakım modu aktif edildi. Mağaza bakım ekranına alındı.'
            : 'Site yayına alındı. Mağaza vitrini tüm kullanıcılara açıldı.',
          'success'
        )
      } else {
        addToast(json.error || 'Bakım modu güncellenemedi.', 'error')
      }
    } catch {
      addToast('Sunucu ile iletişim kurulamadı.', 'error')
    } finally {
      setMaintenanceToggling(false)
    }
  }

  useEffect(() => {
    if (!canFetch) return
    setLoading(true)

    Promise.all([
      fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.settings) {
            const s = data.settings
            setStoreName(s.storeName || '')
            setStoreEmail(s.storeEmail || '')
            setStorePhone(s.storePhone || '')
            setStoreAddress(s.storeAddress || '')
            setCurrency(s.currency || 'TRY')
            setTaxRate(s.taxRate ?? 20)
            setFreeShippingThreshold(s.freeShippingThreshold ?? 750)
            setOrderPrefix(s.orderPrefix || 'ZUU-2026')
            setAllowCustomerCancellation(!!s.allowCustomerCancellation)
          }
        }),
      fetchMaintenanceStatus(),
    ])
      .catch(() => addToast('Sistem ayarları yüklenemedi.', 'error'))
      .finally(() => setLoading(false))
  }, [token, canFetch])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch) return

    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storeName,
          storeEmail,
          storePhone,
          storeAddress,
          currency,
          taxRate: Number(taxRate),
          freeShippingThreshold: Number(freeShippingThreshold),
          orderPrefix,
          allowCustomerCancellation,
        }),
      })

      const data = await res.json()
      if (data.success) {
        addToast('Sistem ve mağaza ayarları başarıyla kaydedildi.', 'success')
      } else {
        addToast(data.error || 'Ayarlar kaydedilemedi.', 'error')
      }
    } catch {
      addToast('Sunucu bağlantısı sırasında hata oluştu.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Sistem ayarları yükleniyor...
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Sistem ve Mağaza Ayarları</h1>
          <p className={styles.subtitle}>
            Ticaret yapılandırması, vergi ve kargo eşikleri, sipariş kuralları ve korumalı servis entegrasyonları.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={styles.primaryButton}
        >
          {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </button>
      </div>

      {/* ── TABS NAVIGATION ─────────────────────────────────────────────────── */}
      <div className={styles.operationalTabs}>
        {[
          { id: 'GENERAL', label: 'Genel Bilgiler' },
          { id: 'COMMERCE', label: 'Ticaret & Vergi' },
          { id: 'ORDERS', label: 'Sipariş Kuralları' },
          { id: 'MAINTENANCE', label: 'Site Durumu (Bakım)' },
          { id: 'INTEGRATIONS', label: 'Entegrasyonlar & Güvenlik' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`${styles.operationalTabItem} ${activeTab === tab.id ? styles.active : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '960px' }}>
        {/* ── TAB 1: GENERAL STORE INFO ───────────────────────────────────────── */}
        {activeTab === 'GENERAL' && (
          <div className={styles.card}>
            <div style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Mağaza ve Atölye Bilgileri
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
                Fatura, e-posta bildirimleri ve müşteri iletişiminde görünen resmi işletme kimliği.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label className={styles.label}>Mağaza / Marka Adı</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div>
                <label className={styles.label}>Resmi İletişim E-Postası</label>
                <input
                  type="email"
                  value={storeEmail}
                  onChange={(e) => setStoreEmail(e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div>
                <label className={styles.label}>Telefon Numarası</label>
                <input
                  type="text"
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div>
                <label className={styles.label}>Atölye ve Gönderi Adresi</label>
                <input
                  type="text"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: COMMERCE & TAX ───────────────────────────────────────────── */}
        {activeTab === 'COMMERCE' && (
          <div className={styles.card}>
            <div style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                Ticaret, Para Birimi ve Vergi
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                Ödeme alma para birimi, standart KDV oranı ve ücretsiz kargo barajı.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div>
                <label className={styles.label}>Varsayılan Para Birimi</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={styles.select}
                >
                  <option value="TRY">Türk Lirası (₺ - TRY)</option>
                  <option value="USD">Amerikan Doları ($ - USD)</option>
                  <option value="EUR">Euro (€ - EUR)</option>
                </select>
              </div>

              <div>
                <label className={styles.label}>Dahil KDV Oranı (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.input}
                />
              </div>

              <div>
                <label className={styles.label}>Ücretsiz Kargo Eşiği (TL)</label>
                <input
                  type="number"
                  min="0"
                  value={freeShippingThreshold}
                  onChange={(e) => setFreeShippingThreshold(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.input}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: ORDER RULES ──────────────────────────────────────────────── */}
        {activeTab === 'ORDERS' && (
          <div className={styles.card}>
            <div style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                Sipariş Yönetimi Kuralları
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                Otomatik sipariş numaralandırma öneki ve müşteri iptal politikası.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', alignItems: 'center' }}>
              <div>
                <label className={styles.label}>Sipariş Numarası Öneki (Prefix)</label>
                <input
                  type="text"
                  value={orderPrefix}
                  onChange={(e) => setOrderPrefix(e.target.value)}
                  className={styles.input}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div style={{ paddingTop: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allowCustomerCancellation}
                    onChange={(e) => setAllowCustomerCancellation(e.target.checked)}
                  />
                  <span>Müşteri siparişi baskı/hazırlık öncesinde doğrudan iptal edebilir</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: SITE STATUS (MAINTENANCE MODE) ─────────────────────────── */}
        {activeTab === 'MAINTENANCE' && (
          <div className={styles.card}>
            <div style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Site Durumu
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: maintenanceStatus.enabled ? '#ef4444' : '#10b981',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {maintenanceStatus.enabled ? 'Bakım Modu Aktif' : 'Site Yayında'}
                  </span>
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.35rem 0 0' }}>
                Mağaza vitrininin genel ziyaretçilere açık veya planlı bakım modunda olduğunu yönetin.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Status explanation */}
              <div
                style={{
                  padding: '1rem 1.25rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  backgroundColor: maintenanceStatus.enabled ? '#fffbeb' : 'var(--surface-1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                      {maintenanceStatus.enabled ? '● Bakım Modu Aktif' : '● Site Yayında'}
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                      {maintenanceStatus.enabled
                        ? 'Ziyaretçiler şu anda bakım sayfasını görüyor. İzin verilen IP adreslerinden site normal şekilde görüntülenebilir.'
                        : 'Site şu anda ziyaretçilere açık.'}
                    </p>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleToggleMaintenance}
                      disabled={maintenanceToggling || maintenanceLoading}
                      style={{
                        padding: '8px 18px',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: maintenanceToggling ? 'not-allowed' : 'pointer',
                        borderRadius: 'var(--radius-sm, 4px)',
                        border: maintenanceStatus.enabled ? '1px solid #10b981' : '1px solid var(--border-strong)',
                        backgroundColor: maintenanceStatus.enabled ? '#10b981' : 'var(--text-primary)',
                        color: '#ffffff',
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      {maintenanceToggling
                        ? 'İşleniyor...'
                        : maintenanceStatus.enabled
                        ? 'Siteyi Yayına Al'
                        : 'Bakım Modunu Aç'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Technical context: Allowed IPs & Source */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div style={{ padding: '0.875rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm, 4px)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
                    Yapılandırma Kaynağı
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {maintenanceStatus.source === 'database'
                      ? 'PostgreSQL Veritabanı (Setting Tablosu)'
                      : maintenanceStatus.source === 'env'
                      ? 'Ortam Değişkeni (MAINTENANCE_MODE Env Fallback)'
                      : 'Varsayılan Sistem Değeri'}
                  </div>
                  {maintenanceStatus.updatedAt && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Son güncelleme: {new Date(maintenanceStatus.updatedAt).toLocaleString('tr-TR')}
                    </div>
                  )}
                </div>

                <div style={{ padding: '0.875rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm, 4px)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
                    İzin Verilen IP Adresleri (Allowlist)
                  </div>
                  <div style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-primary)' }}>
                    {maintenanceStatus.allowedIps && maintenanceStatus.allowedIps.length > 0
                      ? maintenanceStatus.allowedIps.join(', ')
                      : 'Tanımlı allowlist bulunmuyor (MAINTENANCE_ALLOWED_IPS)'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Allowlist adresleri bakım modunda dahi siteye kesintisiz erişebilir.
                  </div>
                </div>
              </div>

              {/* Exemptions summary */}
              <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm, 4px)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <strong>Güvenli Bypass Koruması:</strong> /admin yönetim paneli, /api/payments/webhook, /api/health, cron ve checkout API servisleri bakım modundan etkilenmez ve kesintisiz çalışmaya devam eder.
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: INTEGRATIONS & MASKED CREDENTIALS ───────────────────────── */}
        {activeTab === 'INTEGRATIONS' && (
          <div className={styles.card}>
            <div style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                Üçüncü Taraf Servisler & Güvenlik
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                Entegrasyon durumları ve maskelenmiş gizli anahtarlar. Hassas değerler sunucu ortamında korunur.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              {/* Iyzico */}
              <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius, 6px)', backgroundColor: 'var(--surface-1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>İyzico Ödeme Altyapısı</span>
                  <span className={`${styles.badge} ${styles.badgeSuccess}`}>Aktif</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  3D Secure ödeme akışı ve kart saklama
                </div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  Secret Key: ••••••••••••••••••••••••
                </div>
              </div>

              {/* Cloudinary */}
              <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius, 6px)', backgroundColor: 'var(--surface-1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Cloudinary CDN Storage</span>
                  <span className={`${styles.badge} ${styles.badgeSuccess}`}>Aktif</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Otomatik WebP/AVIF format ve boyut optimizasyonu
                </div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  API Secret: ••••••••••••••••••••••••
                </div>
              </div>

              {/* Firebase Auth */}
              <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius, 6px)', backgroundColor: 'var(--surface-1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Firebase Kimlik Doğrulama</span>
                  <span className={`${styles.badge} ${styles.badgeSuccess}`}>Aktif</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  JWT token doğrulama ve kullanıcı oturumu
                </div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  Private Key: ••••••••••••••••••••••••
                </div>
              </div>

              {/* Cargo API */}
              <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius, 6px)', backgroundColor: 'var(--surface-1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Kargo API Entegrasyonu</span>
                  <span className={`${styles.badge} ${styles.badgeInfo}`}>Yurtiçi / MNG</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Otomatik sevk irsaliyesi ve takip kodu üretimi
                </div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  Entegrasyon Kodu: ••••••••••••••••••••
                </div>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
