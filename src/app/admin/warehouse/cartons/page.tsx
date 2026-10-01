'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import styles from '../../admin.module.css'

interface Carton {
  id: string
  code: string
  name: string
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
  maxWeightGrams: number
  tareWeightGrams: number
  active: boolean
  priority: number
}

interface TestItem {
  id: string
  sku: string
  quantity: number
  lengthMm: number
  widthMm: number
  heightMm: number
  weightGrams: number
}

export default function AdminWarehouseCartonsPage() {
  const { token, canFetch } = useAuthStore()

  const [cartons, setCartons] = useState<Carton[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingCarton, setEditingCarton] = useState<Carton | null>(null)
  const [formCode, setFormCode] = useState('')
  const [formName, setFormName] = useState('')
  const [formL, setFormL] = useState('300')
  const [formW, setFormW] = useState('200')
  const [formH, setFormH] = useState('150')
  const [formMaxWeight, setFormMaxWeight] = useState('10000')
  const [formTareWeight, setFormTareWeight] = useState('300')
  const [formPriority, setFormPriority] = useState('20')
  const [formActive, setFormActive] = useState(true)
  const [saving, setSaving] = useState(false)

  // Delete Confirmation Modal State
  const [deleteTargetCarton, setDeleteTargetCarton] = useState<Carton | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Interactive 3D Cartonization Test Panel State
  const [testItems, setTestItems] = useState<TestItem[]>([
    {
      id: 'item-1',
      sku: 'ZUU-VOR-001 (Kulaklık Standı)',
      quantity: 2,
      lengthMm: 180,
      widthMm: 120,
      heightMm: 90,
      weightGrams: 280,
    },
    {
      id: 'item-2',
      sku: 'ZUU-KD-002 (Geometri Seti)',
      quantity: 1,
      lengthMm: 140,
      widthMm: 140,
      heightMm: 60,
      weightGrams: 240,
    },
  ])
  const [testResult, setTestResult] = useState<any | null>(null)
  const [testing, setTesting] = useState(false)

  const fetchCartons = async () => {
    if (!canFetch) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/warehouse/cartons?activeOnly=false', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setCartons(data.cartons || [])
      } else {
        setError(data.error || 'Koli tanımları alınamadı.')
      }
    } catch {
      setError('Koli servisine bağlanılamadı.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCartons()
  }, [token, canFetch, canFetch])

  const openCreateModal = () => {
    setEditingCarton(null)
    setFormCode('')
    setFormName('')
    setFormL('300')
    setFormW('200')
    setFormH('150')
    setFormMaxWeight('10000')
    setFormTareWeight('300')
    setFormPriority('20')
    setFormActive(true)
    setShowModal(true)
  }

  const openEditModal = (c: Carton) => {
    setEditingCarton(c)
    setFormCode(c.code)
    setFormName(c.name)
    setFormL(String(c.innerLengthMm))
    setFormW(String(c.innerWidthMm))
    setFormH(String(c.innerHeightMm))
    setFormMaxWeight(String(c.maxWeightGrams))
    setFormTareWeight(String(c.tareWeightGrams))
    setFormPriority(String(c.priority))
    setFormActive(c.active)
    setShowModal(true)
  }

  const handleSaveCarton = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch) return
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const payload = {
        code: formCode.trim(),
        name: formName.trim(),
        innerLengthMm: Number(formL),
        innerWidthMm: Number(formW),
        innerHeightMm: Number(formH),
        maxWeightGrams: Number(formMaxWeight),
        tareWeightGrams: Number(formTareWeight),
        priority: Number(formPriority),
        active: formActive,
      }

      let res
      if (editingCarton) {
        res = await fetch(`/api/admin/warehouse/cartons/${editingCarton.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/admin/warehouse/cartons', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })
      }

      const data = await res.json()
      if (data.success) {
        setMessage(editingCarton ? 'Koli güncellendi.' : 'Yeni koli tanımı oluşturuldu.')
        setShowModal(false)
        fetchCartons()
      } else {
        setError(data.error || 'İşlem başarısız.')
      }
    } catch {
      setError('Koli servisine bağlanılamadı.')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!canFetch || !deleteTargetCarton) return
    setDeleteLoading(true)

    try {
      const res = await fetch(`/api/admin/warehouse/cartons/${deleteTargetCarton.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`"${deleteTargetCarton.name}" koli tanımı silindi.`)
        setDeleteTargetCarton(null)
        fetchCartons()
      } else {
        toast.error(data.error || 'Silme işlemi başarısız.')
      }
    } catch {
      toast.error('Koli servisine bağlanılamadı.')
    } finally {
      setDeleteLoading(false)
    }
  }

  // 3D Cartonization Test Run
  const handleRunCartonizationTest = async () => {
    if (!canFetch) return
    setTesting(true)
    setTestResult(null)
    setError(null)

    try {
      const itemsPayload = testItems.map((ti) => ({
        productId: ti.id,
        sku: ti.sku,
        quantity: Number(ti.quantity),
        dimensions: {
          lengthMm: Number(ti.lengthMm),
          widthMm: Number(ti.widthMm),
          heightMm: Number(ti.heightMm),
        },
        weightGrams: Number(ti.weightGrams),
      }))

      const res = await fetch('/api/admin/warehouse/cartonization/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items: itemsPayload }),
      })

      const data = await res.json()
      if (data.result) {
        setTestResult(data.result)
      } else {
        setError(data.error || 'Önizleme çalıştırılamadı.')
      }
    } catch {
      setError('Önizleme servisine bağlanılamadı.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Otomatik 3D Koli Öneri Motoru (Cartonization)</h1>
          <p className={styles.subtitle}>
            Koli tanımları, 3 boyutlu deterministik yerleşim algoritması ve paketleme optimizasyon testi
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/admin/warehouse" className={styles.btnSecondary}>
            ← Depo Ana Paneli
          </Link>
          <Link href="/admin/warehouse/packing" className={styles.btnSecondary}>
            Paketleme Masası
          </Link>
          <button
            onClick={openCreateModal}
            className={styles.btnPrimary}
            style={{ background: '#7c3aed' }}
          >
            + Yeni Koli Tanımla
          </button>
        </div>
      </div>

      {message && <div className={styles.alertSuccess}>{message}</div>}
      {error && <div className={styles.alertDanger}>{error}</div>}

      {/* Cartons Table */}
      <div className={styles.card} style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Tanımlı Sevkiyat Kolileri ({cartons.length})
        </h2>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            Koli tanımları yükleniyor...
          </div>
        ) : cartons.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            Tanımlı koli bulunamadı.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Koli Kodu</th>
                  <th>Koli Adı</th>
                  <th>İç Boyutlar (U × G × Y mm)</th>
                  <th>Hacim (dm³)</th>
                  <th>Maks. Ağırlık</th>
                  <th>Dara Ağırlık</th>
                  <th>Öncelik</th>
                  <th>Durum</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {cartons.map((c) => {
                  const volDm3 = (
                    (c.innerLengthMm * c.innerWidthMm * c.innerHeightMm) /
                    1000000
                  ).toFixed(2)

                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.code}</td>
                      <td>{c.name}</td>
                      <td>
                        {c.innerLengthMm} × {c.innerWidthMm} × {c.innerHeightMm} mm
                      </td>
                      <td>{volDm3} dm³</td>
                      <td>{(c.maxWeightGrams / 1000).toFixed(1)} kg</td>
                      <td>{c.tareWeightGrams} g</td>
                      <td>#{c.priority}</td>
                      <td>
                        {c.active ? (
                          <span className={`${styles.badge} ${styles.badgeSuccess}`}>Aktif</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeMuted}`}>Pasif</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => openEditModal(c)}
                            className={styles.btnSecondary}
                            style={{ padding: '3px 8px', fontSize: 11 }}
                          >
                            Düzenle
                          </button>
                          <button
                            onClick={() => setDeleteTargetCarton(c)}
                            className={styles.btnSecondary}
                            style={{ padding: '3px 8px', fontSize: 11, color: '#dc2626' }}
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
          </div>
        )}
      </div>

      {/* Interactive 3D Cartonization Test Panel */}
      <div className={styles.card} style={{ borderLeft: '4px solid #7c3aed' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: '#6d28d9' }}>
              İnteraktif 3D Koli Simülasyon & Test Masası
            </h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Aşağıdaki ürün sepetini deterministik 3 boyutlu algoritmaya göndererek en uygun koliyi ve yerleşimi test ediniz.
            </p>
          </div>
          <button
            onClick={handleRunCartonizationTest}
            disabled={testing}
            className={`${styles.btn} ${styles.btnPrimary}`}
            style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
          >
            {testing ? 'Hesaplanıyor...' : 'Koli Önerisini Hesapla'}
          </button>
        </div>

        {/* Test Items Inputs */}
        <div style={{ marginBottom: 20 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ürün / SKU</th>
                <th style={{ width: 90 }}>Adet</th>
                <th style={{ width: 100 }}>Uzunluk (mm)</th>
                <th style={{ width: 100 }}>Genişlik (mm)</th>
                <th style={{ width: 100 }}>Yükseklik (mm)</th>
                <th style={{ width: 110 }}>Birim Ağırlık (g)</th>
              </tr>
            </thead>
            <tbody>
              {testItems.map((item, idx) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="text"
                      value={item.sku}
                      onChange={(e) => {
                        const copy = [...testItems]
                        copy[idx].sku = e.target.value
                        setTestItems(copy)
                      }}
                      className={styles.input}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const copy = [...testItems]
                        copy[idx].quantity = Number(e.target.value)
                        setTestItems(copy)
                      }}
                      className={styles.input}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.lengthMm}
                      onChange={(e) => {
                        const copy = [...testItems]
                        copy[idx].lengthMm = Number(e.target.value)
                        setTestItems(copy)
                      }}
                      className={styles.input}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.widthMm}
                      onChange={(e) => {
                        const copy = [...testItems]
                        copy[idx].widthMm = Number(e.target.value)
                        setTestItems(copy)
                      }}
                      className={styles.input}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.heightMm}
                      onChange={(e) => {
                        const copy = [...testItems]
                        copy[idx].heightMm = Number(e.target.value)
                        setTestItems(copy)
                      }}
                      className={styles.input}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.weightGrams}
                      onChange={(e) => {
                        const copy = [...testItems]
                        copy[idx].weightGrams = Number(e.target.value)
                        setTestItems(copy)
                      }}
                      className={styles.input}
                      style={{ width: '100%' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Simulation Output Result */}
        {testResult && (
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              background: testResult.success ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: testResult.success ? '#15803d' : '#b91c1c' }}>
                {testResult.success ? 'Başarılı Koli Önerisi' : 'Koli Önerisi Başarısız'}
              </div>
              {testResult.recommendedCarton && (
                <div style={{ fontSize: 14, fontWeight: 600, color: '#15803d' }}>
                  Önerilen: {testResult.recommendedCarton.name} ({testResult.recommendedCarton.code})
                </div>
              )}
            </div>

            <div style={{ fontSize: 13, marginBottom: 14, color: '#334155' }}>
              {testResult.reason}
            </div>

            {testResult.success && testResult.recommendedCarton && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Koli İç Boyutları</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {testResult.recommendedCarton.innerLengthMm} × {testResult.recommendedCarton.innerWidthMm} × {testResult.recommendedCarton.innerHeightMm} mm
                  </div>
                </div>
                <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Doluluk Oranı (Volume Util)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed' }}>
                    %{testResult.volumeUtilizationPercent.toFixed(1)}
                  </div>
                </div>
                <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Tahmini Toplam Ağırlık</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {testResult.estimatedWeightGrams} g (Kapasite: {testResult.recommendedCarton.maxWeightGrams} g)
                  </div>
                </div>
                <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Yerleşim Adedi</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {testResult.placements?.length || 0} Parça Yerleşti
                  </div>
                </div>
              </div>
            )}

            {testResult.placements && testResult.placements.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  3D Koordinat Yerleşim Matrisi (x, y, z):
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto', background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
                  {testResult.placements.map((p: any, pIdx: number) => (
                    <div key={pIdx} style={{ padding: '3px 0', borderBottom: '1px dashed #f1f5f9' }}>
                      <strong>#{pIdx + 1} {p.sku}</strong> — Konum: (x: {p.position.x}mm, y: {p.position.y}mm, z: {p.position.z}mm) | Boyut: {p.dimensions.lengthMm}×{p.dimensions.widthMm}×{p.dimensions.heightMm}mm | Oryantasyon: {p.rotation}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Carton Create / Edit Modal */}
      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: 540 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              {editingCarton ? 'Koli Tanımını Düzenle' : 'Yeni Koli Tanımı'}
            </h2>
            <form onSubmit={handleSaveCarton}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                    Koli Kodu * (Örn: KOLI-M)
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className={styles.input}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                    Koli Adı *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className={styles.input}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                    İç Uzunluk (mm) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formL}
                    onChange={(e) => setFormL(e.target.value)}
                    className={styles.input}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                    İç Genişlik (mm) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formW}
                    onChange={(e) => setFormW(e.target.value)}
                    className={styles.input}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                    İç Yükseklik (mm) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formH}
                    onChange={(e) => setFormH(e.target.value)}
                    className={styles.input}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                    Maks. Ağırlık (g) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formMaxWeight}
                    onChange={(e) => setFormMaxWeight(e.target.value)}
                    className={styles.input}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                    Dara Ağırlık (g)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formTareWeight}
                    onChange={(e) => setFormTareWeight(e.target.value)}
                    className={styles.input}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                    Öncelik (Priority)
                  </label>
                  <input
                    type="number"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className={styles.input}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    Koli Aktif (Öneri motorunda kullanılır)
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={styles.btnSecondary}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={styles.btnPrimary}
                  style={{ background: '#7c3aed' }}
                >
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (UI-16 Global Modal) */}
      {deleteTargetCarton && (
        <Modal
          isOpen={Boolean(deleteTargetCarton)}
          onClose={() => setDeleteTargetCarton(null)}
          ariaLabel="Koli Tanımı Silme Onayı"
          maxWidth={440}
        >
          <div style={{ padding: '4px 0' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>
              Koli Tanımını Sil
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
              <strong>{deleteTargetCarton.name}</strong> ({deleteTargetCarton.code}) koli tanımını silmek istediğinize emin misiniz? Bu koli artık paketleme önerilerinde kullanılmayacaktır.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setDeleteTargetCarton(null)}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDelete}
                className={`${styles.btn} ${styles.btnDanger}`}
              >
                {deleteLoading ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
