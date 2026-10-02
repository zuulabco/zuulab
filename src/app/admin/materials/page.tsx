'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import styles from '../admin.module.css'

interface Filament {
  id: string
  materialName: string
  color: string | null
  quantityGrams: number
  minimumQuantityGrams: number
  location: string | null
  isActive: boolean
  pricePerKgTl: number | null
  totalValueTl: number | null
  reservedGrams: number
  freeGrams: number
  status: 'OK' | 'LOW' | 'OUT'
}

interface Movement {
  id: string
  type: string
  quantityGrams: number
  previousQuantityGrams: number
  newQuantityGrams: number
  reason: string
  createdBy: string
  createdAt: string
}

const STATUS = {
  OK: { text: 'Yeterli', cls: 'badgeSuccess' },
  LOW: { text: 'Az', cls: 'badgeWarning' },
  OUT: { text: 'Bitti', cls: 'badgeDanger' },
} as const

const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE: 'Alım',
  MANUAL_ADJUSTMENT: 'Düzeltme',
  PRODUCTION_CONSUMPTION: 'Üretim',
  WASTE: 'Fire',
  RETURN: 'İade',
}

function g(value: number): string {
  return Math.abs(value) >= 1000
    ? `${(value / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`
    : `${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} g`
}

const EMPTY = { materialName: 'PLA', color: '', quantityKg: '1', minimumKg: '0.5', pricePerKgTl: '', location: '' }

export default function MaterialsPage() {
  const { token, canFetch } = useAuthStore()
  const [items, setItems] = useState<Filament[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [saving, setSaving] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY)
  const [editItem, setEditItem] = useState<Filament | null>(null)
  const [editForm, setEditForm] = useState({ minimumKg: '', pricePerKgTl: '', location: '' })
  const [adjustItem, setAdjustItem] = useState<Filament | null>(null)
  const [adjustForm, setAdjustForm] = useState({ type: 'PURCHASE', amount: '', unit: 'kg', reason: '' })
  const [historyItem, setHistoryItem] = useState<Filament | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])

  const headers = useCallback(
    (json = false): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }),
    [token]
  )

  const load = useCallback(() => {
    if (!canFetch) return
    fetch('/api/admin/materials', { headers: headers() })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error)
        setItems(data.materials)
      })
      .catch((err) => toast.error(err.message || 'Filamentler yüklenemedi.'))
      .finally(() => setLoading(false))
  }, [canFetch, headers])

  useEffect(() => {
    load()
  }, [load])

  async function request(url: string, method: string, body: unknown, success: string): Promise<boolean> {
    setSaving(true)
    try {
      const res = await fetch(url, { method, headers: headers(true), body: JSON.stringify(body) })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Kaydedilemedi.')
      toast.success(success)
      load()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    const ok = await request(
      '/api/admin/materials',
      'POST',
      {
        materialName: addForm.materialName,
        color: addForm.color,
        quantityGrams: Number(addForm.quantityKg || 0) * 1000,
        minimumQuantityGrams: Number(addForm.minimumKg || 0) * 1000,
        pricePerKgTl: addForm.pricePerKgTl === '' ? null : Number(addForm.pricePerKgTl),
        location: addForm.location,
      },
      'Filament eklendi.'
    )
    if (ok) {
      setAddOpen(false)
      setAddForm(EMPTY)
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editItem) return
    const ok = await request(
      `/api/admin/materials/${editItem.id}`,
      'PUT',
      {
        minimumQuantityGrams: Number(editForm.minimumKg || 0) * 1000,
        pricePerKgTl: editForm.pricePerKgTl === '' ? null : Number(editForm.pricePerKgTl),
        location: editForm.location,
      },
      'Kaydedildi.'
    )
    if (ok) setEditItem(null)
  }

  async function submitAdjust(e: React.FormEvent) {
    e.preventDefault()
    if (!adjustItem) return
    const raw = Number(adjustForm.amount)
    if (!Number.isFinite(raw) || raw === 0) {
      toast.error('Miktar girin.')
      return
    }
    const gramsAmount = adjustForm.unit === 'kg' ? raw * 1000 : raw
    // Purchase adds, waste removes; correction takes the sign as typed.
    const delta = adjustForm.type === 'PURCHASE' ? Math.abs(gramsAmount) : adjustForm.type === 'WASTE' ? -Math.abs(gramsAmount) : gramsAmount
    const reason = adjustForm.reason.trim() || (adjustForm.type === 'PURCHASE' ? 'Yeni makara' : adjustForm.type === 'WASTE' ? 'Fire' : 'Tartım düzeltmesi')
    const ok = await request(
      `/api/admin/materials/${adjustItem.id}/adjust`,
      'POST',
      { deltaGrams: delta, type: adjustForm.type, reason },
      `${adjustItem.materialName}${adjustItem.color ? ` ${adjustItem.color}` : ''}: ${delta > 0 ? '+' : ''}${g(delta)}`
    )
    if (ok) setAdjustItem(null)
  }

  async function openHistory(item: Filament) {
    setHistoryItem(item)
    setMovements([])
    try {
      const res = await fetch(`/api/admin/materials/${item.id}/movements`, { headers: headers() })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setMovements(data.movements)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hareketler yüklenemedi.')
    }
  }

  const visible = items.filter((i) => showInactive || i.isActive)
  const active = items.filter((i) => i.isActive)
  const totalValue = active.reduce((s, i) => s + (i.totalValueTl ?? 0), 0)

  return (
    <div className={styles.adminPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Filament & Malzeme</h1>
          <p className={styles.pageSubtitle}>
            Makara stokları gram olarak tutulur. Baskı işleri bitince kullanılan filament otomatik düşülür; açık işlerin
            ihtiyacı &quot;ayrılan&quot; olarak gösterilir.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/production" className={styles.secondaryButton}>
            Üretim
          </Link>
          <button className={styles.primaryButton} onClick={() => setAddOpen(true)}>
            + Filament ekle
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          ['Toplam', g(active.reduce((s, i) => s + Math.max(0, i.quantityGrams), 0))],
          ['Açık işlere ayrılan', g(active.reduce((s, i) => s + i.reservedGrams, 0))],
          ['Az / biten', `${active.filter((i) => i.status !== 'OK').length}`],
          ['Stok değeri', totalValue > 0 ? `${totalValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL` : '—'],
        ].map(([label, value]) => (
          <div key={label} className={styles.tableCard} style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Kullanılmayanları da göster
      </label>

      <div className={styles.tableCard}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Yükleniyor…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            Henüz filament yok. &quot;+ Filament ekle&quot; ile elinizdeki makaraları girin.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Filament</th>
                <th>Stok</th>
                <th>Ayrılan</th>
                <th>Boşta</th>
                <th>Minimum</th>
                <th>Durum</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.id} style={{ opacity: i.isActive ? 1 : 0.5 }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {i.materialName}
                      {i.color ? ` ${i.color}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {i.pricePerKgTl !== null ? `${i.pricePerKgTl} TL/kg` : 'fiyat yok'}
                      {i.location ? ` · ${i.location}` : ''}
                    </div>
                  </td>
                  <td style={{ fontWeight: 700 }}>{g(i.quantityGrams)}</td>
                  <td style={{ fontSize: 13 }}>{i.reservedGrams > 0 ? g(i.reservedGrams) : '—'}</td>
                  <td style={{ fontSize: 13, color: i.freeGrams < 0 ? '#dc2626' : undefined, fontWeight: i.freeGrams < 0 ? 700 : undefined }}>
                    {g(i.freeGrams)}
                  </td>
                  <td style={{ fontSize: 13 }}>{g(i.minimumQuantityGrams)}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[STATUS[i.status].cls]}`}>{STATUS[i.status].text}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        className={styles.primaryButton}
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => {
                          setAdjustItem(i)
                          setAdjustForm({ type: 'PURCHASE', amount: '1', unit: 'kg', reason: '' })
                        }}
                      >
                        Makara ekle / düş
                      </button>
                      <button
                        className={styles.secondaryButton}
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => {
                          setEditItem(i)
                          setEditForm({
                            minimumKg: String(i.minimumQuantityGrams / 1000),
                            pricePerKgTl: i.pricePerKgTl === null ? '' : String(i.pricePerKgTl),
                            location: i.location ?? '',
                          })
                        }}
                      >
                        Düzenle
                      </button>
                      <button className={styles.secondaryButton} style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => openHistory(i)}>
                        Hareketler
                      </button>
                      <button
                        className={styles.secondaryButton}
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        disabled={saving}
                        onClick={() =>
                          request(`/api/admin/materials/${i.id}`, 'PUT', { isActive: !i.isActive }, i.isActive ? 'Kullanım dışı bırakıldı.' : 'Tekrar kullanımda.')
                        }
                      >
                        {i.isActive ? 'Kullanma' : 'Kullan'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={addOpen} onClose={() => !saving && setAddOpen(false)} ariaLabel="Filament ekle" maxWidth={480}>
        <form onSubmit={submitAdd} style={{ padding: '8px 4px' }}>
          <h3 style={{ marginTop: 0 }}>Filament ekle</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Tür</label>
              <input className={styles.formInput} list="material-types" value={addForm.materialName} onChange={(e) => setAddForm({ ...addForm, materialName: e.target.value })} required />
              <datalist id="material-types">
                {['PLA', 'PLA+', 'PETG', 'TPU', 'ABS', 'ASA', 'Reçine'].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Renk</label>
              <input className={styles.formInput} placeholder="Ör. Siyah" value={addForm.color} onChange={(e) => setAddForm({ ...addForm, color: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Elimdeki miktar (kg)</label>
              <input type="number" min={0} step="0.01" className={styles.formInput} value={addForm.quantityKg} onChange={(e) => setAddForm({ ...addForm, quantityKg: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Uyarı eşiği (kg)</label>
              <input type="number" min={0} step="0.01" className={styles.formInput} value={addForm.minimumKg} onChange={(e) => setAddForm({ ...addForm, minimumKg: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Kilo fiyatı (TL, isteğe bağlı)</label>
              <input type="number" min={0} step="0.01" className={styles.formInput} value={addForm.pricePerKgTl} onChange={(e) => setAddForm({ ...addForm, pricePerKgTl: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Yer (isteğe bağlı)</label>
              <input className={styles.formInput} placeholder="Ör. Raf A" value={addForm.location} onChange={(e) => setAddForm({ ...addForm, location: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setAddOpen(false)} disabled={saving}>
              Vazgeç
            </button>
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
              Ekle
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(adjustItem)} onClose={() => !saving && setAdjustItem(null)} ariaLabel="Filament ekle / düş" maxWidth={440}>
        {adjustItem && (
          <form onSubmit={submitAdjust} style={{ padding: '8px 4px' }}>
            <h3 style={{ marginTop: 0 }}>
              {adjustItem.materialName}
              {adjustItem.color ? ` ${adjustItem.color}` : ''}: {g(adjustItem.quantityGrams)}
            </h3>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>İşlem</label>
              <select className={styles.select} value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}>
                <option value="PURCHASE">Yeni makara / alım (+)</option>
                <option value="WASTE">Fire, bozuk makara (−)</option>
                <option value="MANUAL_ADJUSTMENT">Tartım düzeltmesi (+/−)</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Miktar</label>
                <input type="number" step="0.01" className={styles.formInput} value={adjustForm.amount} onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Birim</label>
                <select className={styles.select} value={adjustForm.unit} onChange={(e) => setAdjustForm({ ...adjustForm, unit: e.target.value })}>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                </select>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Açıklama (isteğe bağlı)</label>
              <input className={styles.formInput} value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setAdjustItem(null)} disabled={saving}>
                Vazgeç
              </button>
              <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
                Kaydet
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={Boolean(editItem)} onClose={() => !saving && setEditItem(null)} ariaLabel="Filament düzenle" maxWidth={420}>
        {editItem && (
          <form onSubmit={submitEdit} style={{ padding: '8px 4px' }}>
            <h3 style={{ marginTop: 0 }}>
              {editItem.materialName}
              {editItem.color ? ` ${editItem.color}` : ''}
            </h3>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Uyarı eşiği (kg)</label>
              <input type="number" min={0} step="0.01" className={styles.formInput} value={editForm.minimumKg} onChange={(e) => setEditForm({ ...editForm, minimumKg: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Kilo fiyatı (TL)</label>
              <input type="number" min={0} step="0.01" className={styles.formInput} value={editForm.pricePerKgTl} onChange={(e) => setEditForm({ ...editForm, pricePerKgTl: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Yer</label>
              <input className={styles.formInput} value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setEditItem(null)} disabled={saving}>
                Vazgeç
              </button>
              <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
                Kaydet
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={Boolean(historyItem)} onClose={() => setHistoryItem(null)} ariaLabel="Filament hareketleri" maxWidth={720}>
        {historyItem && (
          <div style={{ padding: '8px 4px' }}>
            <h3 style={{ marginTop: 0 }}>
              {historyItem.materialName}
              {historyItem.color ? ` ${historyItem.color}` : ''}: hareketler
            </h3>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className={styles.table} style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Tür</th>
                    <th>Değişim</th>
                    <th>Kalan</th>
                    <th>Açıklama</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontSize: 12 }}>{new Date(m.createdAt).toLocaleString('tr-TR')}</td>
                      <td style={{ fontSize: 12 }}>{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                      <td style={{ fontWeight: 700, color: m.quantityGrams > 0 ? '#059669' : '#dc2626' }}>
                        {m.quantityGrams > 0 ? '+' : ''}
                        {g(m.quantityGrams)}
                      </td>
                      <td style={{ fontSize: 12 }}>{g(m.newQuantityGrams)}</td>
                      <td style={{ fontSize: 12 }}>{m.reason}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        Hareket yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
