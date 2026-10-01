'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import styles from '../../admin.module.css'

interface WarehouseLocation {
  id: string
  code: string
  name: string
  type: string
  zone: string | null
  aisle: string | null
  rack: string | null
  shelf: string | null
  bin: string | null
  capacity: number
  isActive: boolean
  isPickable: boolean
  isPutawayAllowed: boolean
  sortOrder: number
}

export default function AdminWarehouseLocationsPage() {
  const { token } = useAuthStore()

  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [zoneFilter, setZoneFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // New Location Form State
  const [showModal, setShowModal] = useState(false)
  const [formCode, setFormCode] = useState('')
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('BIN')
  const [formZone, setFormZone] = useState('A')
  const [formAisle, setFormAisle] = useState('01')
  const [formRack, setFormRack] = useState('R01')
  const [formShelf, setFormShelf] = useState('S01')
  const [formBin, setFormBin] = useState('B01')
  const [formCapacity, setFormCapacity] = useState('100')
  const [creating, setCreating] = useState(false)

  const fetchLocations = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (zoneFilter) params.set('zone', zoneFilter)
      if (typeFilter) params.set('type', typeFilter)

      const res = await fetch(`/api/admin/warehouse/locations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setLocations(data.locations || [])
      } else {
        setError(data.error || 'Lokasyonlar alınamadı.')
      }
    } catch {
      setError('Lokasyon servisine ulaşılamadı.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLocations()
  }, [token, zoneFilter, typeFilter])

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setCreating(true)
    setError(null)
    setMessage(null)

    try {
      const generatedCode = formCode.trim() || `MAIN-${formZone}-${formAisle}-${formRack}-${formShelf}-${formBin}`
      const res = await fetch('/api/admin/warehouse/locations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: generatedCode,
          name: formName || `${generatedCode} Lokasyonu`,
          type: formType,
          zone: formZone,
          aisle: formAisle,
          rack: formRack,
          shelf: formShelf,
          bin: formBin,
          capacity: parseInt(formCapacity, 10) || 100,
          isActive: true,
          isPickable: true,
          isPutawayAllowed: true,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setMessage(`Lokasyon başarıyla eklendi: ${data.location.code}`)
        setShowModal(false)
        setFormCode('')
        setFormName('')
        fetchLocations()
      } else {
        setError(data.error || 'Lokasyon oluşturulamadı.')
      }
    } catch {
      setError('Lokasyon kaydı sırasında hata oluştu.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/admin/warehouse" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
              ← Depo Hub
            </Link>
          </div>
          <h1 className={styles.title}>Depo Lokasyonları & Yerleşim (Topology)</h1>
          <p className={styles.subtitle}>
            Bölge (Zone), Koridor (Aisle), Raf (Rack/Shelf) ve Göz (Bin) bazında fiziksel depo topolojisi
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowModal(true)} className={styles.btnPrimary}>
            + Yeni Lokasyon Ekle
          </button>
        </div>
      </div>

      {message && <div className={styles.alertSuccess}>{message}</div>}
      {error && <div className={styles.alertDanger}>{error}</div>}

      {/* Filter card */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className={styles.select}
          >
            <option value="">Tüm Bölgeler (Zones)</option>
            <option value="A">Bölge A (Hızlı Tüketim)</option>
            <option value="B">Bölge B (Aksesuar)</option>
            <option value="QUARANTINE">Karantina / Hasarlı</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={styles.select}
          >
            <option value="">Tüm Tipler</option>
            <option value="ZONE">Zone (Bölge)</option>
            <option value="BIN">Bin (Göz / Kutu)</option>
            <option value="SHELF">Shelf (Raf Katı)</option>
            <option value="RACK">Rack (Raf)</option>
            <option value="AISLE">Aisle (Koridor)</option>
          </select>

          <button onClick={fetchLocations} className={styles.btnSecondary}>
            Yenile
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.card}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Lokasyon Kodu</th>
                <th>Lokasyon Adı</th>
                <th>Tip</th>
                <th>Bölge (Zone)</th>
                <th>Koridor / Raf / Göz</th>
                <th>Kapasite</th>
                <th>Toplama</th>
                <th>Yerleştirme</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                    Lokasyonlar yükleniyor...
                  </td>
                </tr>
              ) : locations.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                    Kayıtlı depo lokasyonu bulunamadı.
                  </td>
                </tr>
              ) : (
                locations.map((loc) => (
                  <tr key={loc.id}>
                    <td>
                      <strong style={{ fontFamily: 'monospace', color: '#1e293b' }}>{loc.code}</strong>
                    </td>
                    <td>{loc.name}</td>
                    <td>
                      <span className={styles.tag}>{loc.type}</span>
                    </td>
                    <td>{loc.zone || '—'}</td>
                    <td>
                      {loc.aisle || '—'} / {loc.rack || '—'} / {loc.bin || '—'}
                    </td>
                    <td>{loc.capacity} adet</td>
                    <td>
                      {loc.isPickable ? (
                        <span style={{ color: '#059669', fontSize: 13 }}>Aktif</span>
                      ) : (
                        <span style={{ color: '#dc2626', fontSize: 13 }}>Kapalı</span>
                      )}
                    </td>
                    <td>
                      {loc.isPutawayAllowed ? (
                        <span style={{ color: '#059669', fontSize: 13 }}>Uygun</span>
                      ) : (
                        <span style={{ color: '#dc2626', fontSize: 13 }}>Kapalı</span>
                      )}
                    </td>
                    <td>
                      {loc.isActive ? (
                        <span className={styles.badgeSuccess}>Aktif</span>
                      ) : (
                        <span className={styles.badgeDanger}>Pasif</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className={styles.card}
            style={{ width: 480, maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Yeni Depo Lokasyonu Tanımla</h2>
            <form onSubmit={handleCreateLocation}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className={styles.label}>Bölge (Zone)</label>
                  <input
                    type="text"
                    value={formZone}
                    onChange={(e) => setFormZone(e.target.value.toUpperCase())}
                    className={styles.input}
                    placeholder="A"
                  />
                </div>
                <div>
                  <label className={styles.label}>Koridor (Aisle)</label>
                  <input
                    type="text"
                    value={formAisle}
                    onChange={(e) => setFormAisle(e.target.value)}
                    className={styles.input}
                    placeholder="01"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className={styles.label}>Raf (Rack)</label>
                  <input
                    type="text"
                    value={formRack}
                    onChange={(e) => setFormRack(e.target.value)}
                    className={styles.input}
                    placeholder="R01"
                  />
                </div>
                <div>
                  <label className={styles.label}>Kat (Shelf)</label>
                  <input
                    type="text"
                    value={formShelf}
                    onChange={(e) => setFormShelf(e.target.value)}
                    className={styles.input}
                    placeholder="S01"
                  />
                </div>
                <div>
                  <label className={styles.label}>Göz (Bin)</label>
                  <input
                    type="text"
                    value={formBin}
                    onChange={(e) => setFormBin(e.target.value)}
                    className={styles.input}
                    placeholder="B01"
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className={styles.label}>Lokasyon Adı</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={styles.input}
                  placeholder="Elektronik Hızlı Raf Gözü"
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className={styles.label}>Kapasite (Adet)</label>
                <input
                  type="number"
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={styles.btnSecondary}
                  disabled={creating}
                >
                  İptal
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={creating}>
                  {creating ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
