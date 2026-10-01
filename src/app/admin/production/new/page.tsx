'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import styles from '../../admin.module.css'

function NewProductionForm() {
  const { token } = useAuthStore()
  const { addToast } = useToastStore()
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialProductId = searchParams.get('productId') || ''
  const initialQuantity = searchParams.get('quantity') || ''
  const initialOrderNumber = searchParams.get('orderNumber') || ''
  const initialPriority = searchParams.get('priority') || 'NORMAL'

  const [products, setProducts] = useState<any[]>([])
  const [form, setForm] = useState({
    productId: initialProductId,
    quantity: initialQuantity,
    priority: initialPriority,
    printerReference: '',
    notes: initialOrderNumber ? `Sipariş #${initialOrderNumber} için üretim` : '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetch('/api/products?limit=100', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.products) setProducts(d.products)
      })
      .catch(() => {})
  }, [token])

  useEffect(() => {
    if (initialProductId && !form.productId) {
      setForm((prev) => ({
        ...prev,
        productId: initialProductId,
        quantity: initialQuantity || prev.quantity,
        priority: initialPriority || prev.priority,
        notes: initialOrderNumber ? `Sipariş #${initialOrderNumber} için üretim` : prev.notes,
      }))
    }
  }, [initialProductId, initialQuantity, initialOrderNumber, initialPriority, form.productId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.productId || !form.quantity) {
      setError('Lütfen ürün ve adet miktarını belirtin.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/production', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: form.productId,
          quantity: Number(form.quantity),
          priority: form.priority,
          printerReference: form.printerReference || undefined,
          notes: form.notes || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        addToast('Yeni 3D üretim emri başarıyla oluşturuldu.', 'success')
        router.push('/admin/production')
      } else {
        setError(data.error || 'Üretim emri oluşturulamadı.')
        addToast(data.error || 'Üretim emri oluşturulamadı.', 'error')
      }
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası oluştu.')
      addToast(err.message || 'Bağlantı hatası oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.pageContainer} style={{ maxWidth: 640 }}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Link href="/admin/production" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13 }}>
              &larr; Üretim Masası
            </Link>
          </div>
          <h1 className={styles.title}>Yeni 3D Üretim Emri</h1>
          <p className={styles.subtitle}>
            Katalog ürünleri için 3D baskı emri açın, yazıcı ve öncelik atayın.
          </p>
        </div>
      </div>

      {initialOrderNumber && (
        <div style={{ padding: '12px 16px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, color: '#b45309', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          Sipariş #{initialOrderNumber} için otomatik üretim partisi hazırlanıyor.
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, marginBottom: 16, borderRadius: 6 }}>
          {error}
        </div>
      )}

      <div className={styles.cardPanel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Üretim Detayları</span>
        </div>
        <div className={styles.panelBody}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Ürün Seçimi *
              </label>
              <select
                id="prod-productId"
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                required
                className={styles.searchBox}
                style={{ width: '100%', fontSize: 13 }}
              >
                <option value="">— Üretilecek Ürünü Seçin —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (SKU: {p.sku})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Üretim Adedi *
                </label>
                <input
                  id="prod-quantity"
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  required
                  placeholder="Örn: 20"
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Üretim Önceliği
                </label>
                <select
                  id="prod-priority"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13 }}
                >
                  <option value="LOW">Düşük</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Yüksek</option>
                  <option value="URGENT">Acil (Aynı Gün)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Atanan 3D Yazıcı (Opsiyonel)
              </label>
              <input
                id="prod-printer"
                type="text"
                value={form.printerReference}
                onChange={(e) => setForm({ ...form, printerReference: e.target.value })}
                placeholder="Örn: Bambu A1 Mini #1, Prusa MK4"
                className={styles.searchBox}
                style={{ width: '100%', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Atölye Notları (Opsiyonel)
              </label>
              <textarea
                id="prod-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Dolgu yoğunluğu, özel nozül boyutu, renk veya operatör talimatı..."
                className={styles.searchBox}
                style={{ width: '100%', fontSize: 13, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Link href="/admin/production" className={`${styles.btn} ${styles.btnSecondary}`}>
                Vazgeç
              </Link>
              <button
                type="submit"
                disabled={loading || !form.productId || !form.quantity}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                {loading ? 'Oluşturuluyor...' : 'Üretim Emrini Başlat'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function NewProductionPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Yükleniyor...</div>}>
      <NewProductionForm />
    </Suspense>
  )
}