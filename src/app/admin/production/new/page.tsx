'use client'

import React, { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import styles from '../../admin.module.css'

interface ProductOption {
  id: string
  name: string
  sku: string
  stock: number
}

interface Filament {
  id: string
  materialName: string
  color: string | null
  quantityGrams: number
  freeGrams: number
  isActive: boolean
}

function NewProductionForm() {
  const { token, canFetch } = useAuthStore()
  const router = useRouter()
  const params = useSearchParams()
  const [products, setProducts] = useState<ProductOption[]>([])
  const [filaments, setFilaments] = useState<Filament[]>([])
  const [form, setForm] = useState({
    productId: params.get('productId') ?? '',
    quantity: params.get('quantity') ?? '5',
    materialStockId: '',
    gramsPerUnit: '',
    priority: 'NORMAL',
    printerReference: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const headers = useCallback((): Record<string, string> => ({ Authorization: `Bearer ${token}` }), [token])

  useEffect(() => {
    if (!canFetch) return
    fetch('/api/admin/products?limit=1000', { headers: headers() })
      .then((r) => r.json())
      .then((data) => data.success && setProducts(data.products))
      .catch(() => toast.error('Ürünler yüklenemedi.'))
    fetch('/api/admin/materials', { headers: headers() })
      .then((r) => r.json())
      .then((data) => data.success && setFilaments((data.materials ?? data.stocks ?? []).filter((m: Filament) => m.isActive)))
      .catch(() => toast.error('Filamentler yüklenemedi.'))
  }, [canFetch, headers])

  const qty = Number(form.quantity) || 0
  const gpu = Number(form.gramsPerUnit) || 0
  const filament = filaments.find((f) => f.id === form.materialStockId)
  const need = qty * gpu
  const short = filament && gpu > 0 ? need - filament.freeGrams : 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.productId) {
      toast.error('Ürün seçin.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/production', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: form.productId,
          quantity: Number(form.quantity),
          // Empty: the service uses the product's previous job (or its weight).
          materialStockId: form.materialStockId || undefined,
          gramsPerUnit: form.gramsPerUnit.trim() === '' ? undefined : Number(form.gramsPerUnit),
          priority: form.priority,
          printerReference: form.printerReference,
          notes: form.notes,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'İş oluşturulamadı.')
      toast.success(`${data.order.productNameSnapshot} × ${data.order.quantity} baskı işi oluşturuldu.`)
      router.push('/admin/production')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İş oluşturulamadı.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.adminPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Yeni baskı işi</h1>
          <p className={styles.pageSubtitle}>Basılacak ürün, adet ve kullanılacak filament.</p>
        </div>
        <Link href="/admin/production" className={styles.secondaryButton}>
          ← Üretim
        </Link>
      </div>

      <form className={styles.formCard} onSubmit={submit} style={{ maxWidth: 640 }}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Ürün</label>
          <select className={styles.select} value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} required>
            <option value="">Ürün seçin…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku}) · stok {p.stock}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Adet</label>
            <input type="number" min={1} step={1} className={styles.formInput} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Öncelik</label>
            <select className={styles.select} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="LOW">Düşük</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Yüksek</option>
              <option value="URGENT">Acil</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Filament</label>
            <select className={styles.select} value={form.materialStockId} onChange={(e) => setForm({ ...form, materialStockId: e.target.value })}>
              <option value="">Ürünün önceki işindeki filament</option>
              {filaments.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.materialName}
                  {f.color ? ` ${f.color}` : ''} · boşta {Math.round(f.freeGrams)} g
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Parça başı gram</label>
            <input
              type="number"
              min={0}
              step="0.1"
              className={styles.formInput}
              placeholder="önceki iş"
              value={form.gramsPerUnit}
              onChange={(e) => setForm({ ...form, gramsPerUnit: e.target.value })}
            />
          </div>
        </div>
        {filaments.length === 0 && (
          <p style={{ fontSize: 12, color: '#b45309', marginTop: -4 }}>
            Kayıtlı filament yok. <Link href="/admin/materials">Filament &amp; Malzeme</Link> sayfasından ekleyin; filament
            seçilmezse tüketim takip edilmez.
          </p>
        )}
        {need > 0 && (
          <p style={{ fontSize: 12, color: short > 0 ? '#dc2626' : 'var(--text-muted)', marginTop: -4 }}>
            Bu iş yaklaşık {need.toLocaleString('tr-TR')} g filament kullanır
            {filament ? (short > 0 ? `; ${Math.round(short)} g eksik.` : `; boşta ${Math.round(filament.freeGrams)} g var.`) : '.'}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Yazıcı (isteğe bağlı)</label>
            <input className={styles.formInput} placeholder="Ör. Bambu A1" value={form.printerReference} onChange={(e) => setForm({ ...form, printerReference: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Not (isteğe bağlı)</label>
            <input className={styles.formInput} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Link href="/admin/production" className={`${styles.btn} ${styles.btnSecondary}`}>
            Vazgeç
          </Link>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
            {saving ? 'Oluşturuluyor…' : 'İşi oluştur'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function NewProductionPage() {
  return (
    <Suspense fallback={null}>
      <NewProductionForm />
    </Suspense>
  )
}
