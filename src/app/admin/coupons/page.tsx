'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { formatPrice } from '@/lib/utils'
import Modal from '@/components/common/Modal'
import styles from '../admin.module.css'

interface CouponItem {
  id: string
  code: string
  description?: string
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'
  discountValue: number
  minCartAmount?: number | null
  minOrderAmount?: number | null
  maxDiscount?: number | null
  usageLimit?: number | null
  maxUses?: number | null
  usedCount: number
  currentUses?: number
  isActive: boolean
  totalDiscountGranted: number
  revenueGenerated: number
  remainingLimit?: number | null
  validFrom?: string | null
  validUntil?: string | null
}

export default function AdminCouponsPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [coupons, setCoupons] = useState<CouponItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'ACTIVE' | 'PASSIVE' | 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'>('ALL')

  // Create / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<CouponItem | null>(null)
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'>('PERCENTAGE')
  const [discountValue, setDiscountValue] = useState<number | ''>(10)
  const [minCartAmount, setMinCartAmount] = useState<number | ''>(200)
  const [maxDiscount, setMaxDiscount] = useState<number | ''>('')
  const [maxUses, setMaxUses] = useState<number | ''>(500)
  const [submitting, setSubmitting] = useState(false)

  // Toggle Modal
  const [toggleModalCoupon, setToggleModalCoupon] = useState<CouponItem | null>(null)
  const [toggling, setToggling] = useState(false)

  const loadCoupons = async () => {
    if (!canFetch) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.coupons)) {
        setCoupons(data.coupons)
      } else {
        addToast(data.error || 'Kupon listesi alınamadı.', 'error')
      }
    } catch {
      addToast('Kupon verileri yüklenirken bağlantı hatası oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCoupons()
  }, [token, canFetch, canFetch])

  const openCreateModal = () => {
    setEditingCoupon(null)
    setCode('')
    setDescription('')
    setType('PERCENTAGE')
    setDiscountValue(10)
    setMinCartAmount(200)
    setMaxDiscount('')
    setMaxUses(500)
    setIsModalOpen(true)
  }

  const openEditModal = (coupon: CouponItem) => {
    setEditingCoupon(coupon)
    setCode(coupon.code)
    setDescription(coupon.description || '')
    setType(coupon.type)
    setDiscountValue(coupon.discountValue)
    setMinCartAmount(coupon.minCartAmount ?? coupon.minOrderAmount ?? '')
    setMaxDiscount(coupon.maxDiscount ?? '')
    setMaxUses(coupon.maxUses ?? coupon.usageLimit ?? '')
    setIsModalOpen(true)
  }

  const generateRandomCode = () => {
    const prefixes = ['ZUU', 'INDIRIM', 'BAHAR', 'FIRSAT', 'OZEL']
    const randPrefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    const randNum = Math.floor(10 + Math.random() * 90)
    setCode(`${randPrefix}${randNum}`)
  }

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch || !code.trim() || discountValue === '') return

    setSubmitting(true)
    try {
      const isEdit = Boolean(editingCoupon)
      const url = isEdit ? `/api/admin/coupons/${editingCoupon!.id}` : '/api/admin/coupons'
      const method = isEdit ? 'PUT' : 'POST'

      const payload: any = {
        code: code.trim().toUpperCase(),
        description: description.trim() || undefined,
        type,
        discountValue: Number(discountValue),
        minCartAmount: minCartAmount !== '' ? Number(minCartAmount) : null,
        minOrderAmount: minCartAmount !== '' ? Number(minCartAmount) : null,
        maxDiscount: maxDiscount !== '' ? Number(maxDiscount) : null,
        maxUses: maxUses !== '' ? Number(maxUses) : null,
        usageLimit: maxUses !== '' ? Number(maxUses) : null,
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success) {
        addToast(
          isEdit
            ? `'${payload.code}' kuponu güncellendi.`
            : `'${payload.code}' promosyon kuponu başarıyla oluşturuldu.`,
          'success'
        )
        setIsModalOpen(false)
        loadCoupons()
      } else {
        addToast(data.error || 'İşlem başarısız oldu.', 'error')
      }
    } catch {
      addToast('Kupon kaydedilirken bağlantı hatası oluştu.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const executeToggleStatus = async () => {
    if (!toggleModalCoupon || !canFetch) return
    const targetState = !toggleModalCoupon.isActive

    setToggling(true)
    try {
      const res = await fetch(`/api/admin/coupons/${toggleModalCoupon.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: targetState }),
      })

      const data = await res.json()
      if (data.success) {
        addToast(
          `'${toggleModalCoupon.code}' kuponu ${targetState ? 'aktifleştirildi' : 'durduruldu'}.`,
          'success'
        )
        setToggleModalCoupon(null)
        loadCoupons()
      } else {
        addToast(data.error || 'Durum güncellenemedi.', 'error')
      }
    } catch {
      addToast('İşlem sırasında hata oluştu.', 'error')
    } finally {
      setToggling(false)
    }
  }

  // Filtered coupons
  const filtered = useMemo(() => {
    return coupons.filter((c) => {
      const matchesSearch =
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(search.toLowerCase()))

      if (!matchesSearch) return false

      if (quickFilter === 'ACTIVE') return c.isActive
      if (quickFilter === 'PASSIVE') return !c.isActive
      if (quickFilter === 'PERCENTAGE') return c.type === 'PERCENTAGE'
      if (quickFilter === 'FIXED') return c.type === 'FIXED'
      if (quickFilter === 'FREE_SHIPPING') return c.type === 'FREE_SHIPPING'

      return true
    })
  }, [coupons, search, quickFilter])

  // Summary Metrics
  const metrics = useMemo(() => {
    const activeCount = coupons.filter((c) => c.isActive).length
    const totalUses = coupons.reduce((sum, c) => sum + (c.usedCount || c.currentUses || 0), 0)
    const totalDiscount = coupons.reduce((sum, c) => sum + (c.totalDiscountGranted || 0), 0)
    const totalRevenue = coupons.reduce((sum, c) => sum + (c.revenueGenerated || 0), 0)
    return { activeCount, totalUses, totalDiscount, totalRevenue }
  }, [coupons])

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Kuponlar & Promosyonlar</h1>
          <p className={styles.subtitle}>
            İndirim kodları, sepet koşulları, kullanım limitleri ve sipariş veritabanından hesaplanan gerçek ciro analitiği.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className={styles.primaryButton}
        >
          + Yeni Kupon Oluştur
        </button>
      </div>

      {/* ── METRIC STATS CARDS ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          onClick={() => setQuickFilter('ACTIVE')}
          className={`${styles.selectableCard} ${quickFilter === 'ACTIVE' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Aktif Kuponlar
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.activeCount} <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 400 }}>/ {coupons.length}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Kullanıma açık kodlar
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Toplam Kullanım
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.totalUses}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Tamamlanan sipariş adedi
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Sağlanan İndirim
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            -{formatPrice(metrics.totalDiscount)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Müşterilere sunulan avantaj
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Oluşturulan Ciro
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--brand-blue, #0080c4)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {formatPrice(metrics.totalRevenue)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Kuponlu sipariş toplamı
          </div>
        </div>
      </div>

      {/* ── OPERATIONAL TABS ─────────────────────────────────────────────────── */}
      <div className={styles.operationalTabs}>
        <button
          type="button"
          onClick={() => setQuickFilter('ALL')}
          className={`${styles.operationalTabItem} ${quickFilter === 'ALL' ? styles.active : ''}`}
        >
          Tümü ({coupons.length})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('ACTIVE')}
          className={`${styles.operationalTabItem} ${quickFilter === 'ACTIVE' ? styles.active : ''}`}
        >
          Aktif Kuponlar ({metrics.activeCount})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('PASSIVE')}
          className={`${styles.operationalTabItem} ${quickFilter === 'PASSIVE' ? styles.active : ''}`}
        >
          Durdurulanlar ({coupons.length - metrics.activeCount})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('PERCENTAGE')}
          className={`${styles.operationalTabItem} ${quickFilter === 'PERCENTAGE' ? styles.active : ''}`}
        >
          Yüzdelik (%)
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('FIXED')}
          className={`${styles.operationalTabItem} ${quickFilter === 'FIXED' ? styles.active : ''}`}
        >
          Sabit (₺)
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('FREE_SHIPPING')}
          className={`${styles.operationalTabItem} ${quickFilter === 'FREE_SHIPPING' ? styles.active : ''}`}
        >
          Ücretsiz Kargo
        </button>
      </div>

      {/* ── SEARCH BAR ──────────────────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            placeholder="Kupon kodu veya açıklama ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.input}
          />
        </div>
      </div>

      {/* ── COUPONS TABLE ───────────────────────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Kupon Kodu</th>
              <th>Tür / İndirim</th>
              <th>Koşullar</th>
              <th style={{ textAlign: 'center' }}>Kullanım / Limit</th>
              <th style={{ textAlign: 'right' }}>Verilen İndirim</th>
              <th style={{ textAlign: 'right' }}>Oluşan Ciro</th>
              <th>Durum</th>
              <th style={{ textAlign: 'right' }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Promosyon ve kupon verileri taranıyor...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateTitle}>Kupon Bulunamadı</div>
                    <div className={styles.emptyStateDesc}>
                      {search ? `"${search}" kriterine uygun kupon bulunamadı.` : 'Henüz oluşturulmuş bir promosyon kuponu bulunmuyor.'}
                    </div>
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className={styles.secondaryButton}
                      >
                        Aramayı Temizle
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={openCreateModal}
                        className={styles.primaryButton}
                      >
                        + İlk Kuponu Oluştur
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const limit = c.maxUses ?? c.usageLimit ?? null
                const count = c.usedCount ?? c.currentUses ?? 0
                const percentUsed = limit ? Math.min(100, Math.round((count / limit) * 100)) : null
                const minOrder = c.minCartAmount ?? c.minOrderAmount

                return (
                  <tr key={c.id}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          background: 'var(--surface-1)',
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--border)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {c.code}
                      </span>
                      {c.description && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '200px' }}>
                          {c.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {c.type === 'PERCENTAGE'
                          ? `%${c.discountValue}`
                          : c.type === 'FIXED'
                          ? formatPrice(c.discountValue)
                          : 'Ücretsiz Kargo'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {c.type === 'PERCENTAGE' ? 'Yüzdelik İndirim' : c.type === 'FIXED' ? 'Sepet İndirimi' : 'Kargo Muafiyeti'}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <div>Min: {minOrder ? formatPrice(minOrder) : 'Koşulsuz'}</div>
                      {c.maxDiscount && <div>Maks: {formatPrice(c.maxDiscount)}</div>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                        {count} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {limit ? limit : '∞'}</span>
                      </div>
                      {percentUsed !== null && (
                        <div
                          style={{
                            width: '80px',
                            height: '4px',
                            background: 'var(--surface-1)',
                            borderRadius: '2px',
                            margin: '4px auto 0',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${percentUsed}%`,
                              height: '100%',
                              background: percentUsed >= 90 ? '#dc2626' : '#16a34a',
                            }}
                          />
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#dc2626', fontFamily: 'var(--font-mono)' }}>
                      -{formatPrice(c.totalDiscountGranted || 0)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--brand-blue, #0080c4)', fontFamily: 'var(--font-mono)' }}>
                      {formatPrice(c.revenueGenerated || 0)}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${c.isActive ? styles.badgeSuccess : styles.badgeDanger}`}>
                        {c.isActive ? 'AKTİF' : 'PASİF'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => openEditModal(c)}
                          className={styles.secondaryButton}
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => setToggleModalCoupon(c)}
                          className={styles.secondaryButton}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: c.isActive ? '#dc2626' : '#16a34a',
                            borderColor: c.isActive ? '#fca5a5' : '#86efac',
                          }}
                        >
                          {c.isActive ? 'Durdur' : 'Aktifleştir'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── CREATE / EDIT COUPON MODAL ────────────────────────────────────────── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        ariaLabel={editingCoupon ? 'Kupon Düzenle' : 'Yeni İndirim Kuponu'}
        maxWidth={500}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
              {editingCoupon ? 'İndirim Kuponunu Düzenle' : 'Yeni Promosyon Kuponu Tanımla'}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              {editingCoupon ? `${editingCoupon.code} koduna ait indirim kurallarını güncelleyin.` : 'Müşteriler için indirim kodu ve sepet koşulları oluşturun.'}
            </p>
          </div>

          <form onSubmit={handleModalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Kod & Generator */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>
                  Kupon Kodu *
                </label>
                {!editingCoupon && (
                  <button
                    type="button"
                    onClick={generateRandomCode}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--brand-blue, #0080c4)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Rastgele Kod Üret
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                placeholder="Örn: BAHAR20"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className={styles.input}
                style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Kampanya Açıklaması
              </label>
              <input
                type="text"
                placeholder="Örn: 2026 İlkbahar Dönemi %20 İndirim Kampanyası"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.input}
              />
            </div>

            {/* Type & Value */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  İndirim Türü
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className={styles.select}
                >
                  <option value="PERCENTAGE">Yüzdelik Oran (%)</option>
                  <option value="FIXED">Sabit Tutar (TL)</option>
                  <option value="FREE_SHIPPING">Ücretsiz Kargo</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  İndirim Tutarı / Oranı *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder={type === 'PERCENTAGE' ? '%20' : '150 TL'}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.input}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>

            {/* Basket Conditions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Min. Sepet Tutarı (TL)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="Koşulsuz ise boş bırakın"
                  value={minCartAmount}
                  onChange={(e) => setMinCartAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.input}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Maks. İndirim Tutarı (TL)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="Limitsiz ise boş bırakın"
                  value={maxDiscount}
                  onChange={(e) => setMaxDiscount(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.input}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>

            {/* Usage Limit */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Toplam Kullanım Kotası (Adet)
              </label>
              <input
                type="number"
                min="1"
                placeholder="Boş bırakılırsa sınırsız sayıda kullanılabilir"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value === '' ? '' : Number(e.target.value))}
                className={styles.input}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className={styles.secondaryButton}
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={styles.primaryButton}
              >
                {submitting ? 'Kaydediliyor...' : editingCoupon ? 'Güncelle' : 'Kuponu Oluştur'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* ── TOGGLE STATUS CONFIRMATION MODAL ─────────────────────────────────── */}
      <Modal
        isOpen={Boolean(toggleModalCoupon)}
        onClose={() => setToggleModalCoupon(null)}
        ariaLabel="Kupon Durumu Değişikliği"
        maxWidth={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
              {toggleModalCoupon?.isActive ? 'Kuponu Durdur' : 'Kuponu Aktifleştir'}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Kupon Kodu: <strong>{toggleModalCoupon?.code}</strong>
            </p>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            {toggleModalCoupon?.isActive ? (
              <>
                Bu kuponu pasife almak üzeresiniz. Pasife alınan kuponlar vitrinde ve ödeme ekranında müşteriler tarafından uygulanamaz.
              </>
            ) : (
              <>
                Bu kuponu yeniden aktif hale getirmek üzeresiniz. Müşteriler kupon koşullarını sağladığında indirimden faydalanabilirler.
              </>
            )}
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setToggleModalCoupon(null)}
              className={styles.secondaryButton}
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={toggling}
              onClick={executeToggleStatus}
              className={styles.primaryButton}
              style={{
                background: toggleModalCoupon?.isActive ? '#dc2626' : '#16a34a',
                borderColor: toggleModalCoupon?.isActive ? '#b91c1c' : '#15803d',
              }}
            >
              {toggling
                ? 'İşleniyor...'
                : toggleModalCoupon?.isActive
                ? 'Evet, Kuponu Durdur'
                : 'Evet, Kuponu Aktifleştir'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
