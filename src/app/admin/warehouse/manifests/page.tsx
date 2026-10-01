'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import styles from '../../admin.module.css'

interface ManifestRecord {
  id: string
  provider: string
  manifestNumber: string
  status: string
  shipmentCount: number
  totalPackageCount: number
  createdBy: string
  carrierOperatorName?: string | null
  closedAt?: string | null
  handedOverAt?: string | null
  createdAt: string
  items?: Array<{
    id: string
    trackingNumber: string
    orderReference: string
    packageCount: number
  }>
}

export default function WarehouseManifestsPage() {
  const { token, user, canFetch } = useAuthStore()

  const [manifests, setManifests] = useState<ManifestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [providerFilter, setProviderFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [activeManifest, setActiveManifest] = useState<ManifestRecord | null>(null)

  // Creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<'SURAT' | 'PTT' | 'MOCK'>('SURAT')
  const [manifestNotes, setManifestNotes] = useState('')
  const [creating, setCreating] = useState(false)

  // Handover confirmation modal
  const [showHandoverModal, setShowHandoverModal] = useState(false)
  const [carrierOperatorName, setCarrierOperatorName] = useState('')
  const [handoverNotes, setHandoverNotes] = useState('')
  const [handingOver, setHandingOver] = useState(false)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchManifests = async () => {
    if (!canFetch) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (providerFilter) params.set('provider', providerFilter)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/admin/warehouse/manifests?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setManifests(data.manifests || [])
        if (activeManifest) {
          const updated = (data.manifests || []).find((m: any) => m.id === activeManifest.id)
          if (updated) setActiveManifest(updated)
        }
      } else {
        setError(data.error || 'Manifestolar alınamadı.')
      }
    } catch {
      setError('Manifesto servisine ulaşılamadı.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchManifests()
  }, [token, canFetch, providerFilter, statusFilter])

  const handleCreateManifest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch) return
    setCreating(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/warehouse/manifests', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: selectedProvider,
          notes: manifestNotes || undefined,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setMessage(`Manifesto #${data.manifest.manifestNumber} başarıyla oluşturuldu.`)
        setShowCreateModal(false)
        setManifestNotes('')
        fetchManifests()
      } else {
        setError(data.error || 'Manifesto oluşturulamadı.')
      }
    } catch {
      setError('Servise ulaşılamadı.')
    } finally {
      setCreating(false)
    }
  }

  const handleCloseManifest = async (id: string) => {
    if (!canFetch) return
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/warehouse/manifests/${id}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Manifesto kapatıldı ve teslimata hazır (READY) durumuna alındı.')
        fetchManifests()
      } else {
        setError(data.error || 'Manifesto kapatılamadı.')
      }
    } catch {
      setError('Servise ulaşılamadı.')
    }
  }

  const handleConfirmHandover = async () => {
    if (!activeManifest || !canFetch) return
    setHandingOver(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(`/api/admin/warehouse/manifests/${activeManifest.id}/handover`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          carrierOperatorName: carrierOperatorName || undefined,
          notes: handoverNotes || undefined,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setMessage(
          `Kargo zimmeti teslim edildi! Gönderiler SHIPPED durumuna geçirildi ve stok çıkışları yapıldı.`
        )
        setShowHandoverModal(false)
        setCarrierOperatorName('')
        fetchManifests()
      } else {
        setError(data.error || 'Teslimat onaylanamadı.')
      }
    } catch {
      setError('Servise ulaşılamadı.')
    } finally {
      setHandingOver(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className={`${styles.badge} ${styles.badgeWarning}`}>Açık (Hazırlanıyor)</span>
      case 'READY':
        return <span className={`${styles.badge} ${styles.badgeInfo}`}>Kuryeye Hazır</span>
      case 'HANDED_OVER':
        return <span className={`${styles.badge} ${styles.badgeSuccess}`}>Teslim Edildi (Zimmetlendi)</span>
      case 'CANCELLED':
        return <span className={`${styles.badge} ${styles.badgeMuted}`}>İptal</span>
      default:
        return <span className={styles.badge}>{status}</span>
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Gün Sonu Kargo Zimmet & Manifestoları</h1>
          <p className={styles.subtitle}>
            Kargo kuryelerine toplu teslim fişleri oluşturun, imzalayın ve sevk çıkışlarını onaylayın
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/admin/warehouse" className={styles.btnSecondary}>
            ← Depo Paneli
          </Link>
          <button onClick={() => setShowCreateModal(true)} className={styles.btnPrimary}>
            + Yeni Zimmet Fişi Oluştur
          </button>
        </div>
      </div>

      {message && <div className={styles.alertSuccess}>{message}</div>}
      {error && <div className={styles.alertDanger}>{error}</div>}

      {/* Filters */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className={styles.select}
          >
            <option value="">Tüm Taşıyıcılar</option>
            <option value="SURAT">Sürat Kargo</option>
            <option value="PTT">PTT Kargo</option>
            <option value="MOCK">Mock Kargo</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.select}
          >
            <option value="">Tüm Durumlar</option>
            <option value="OPEN">Açık</option>
            <option value="READY">Kuryeye Hazır</option>
            <option value="HANDED_OVER">Teslim Edildi</option>
          </select>
        </div>
      </div>

      {/* Manifests Table */}
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Manifesto No</th>
              <th>Taşıyıcı Kargo</th>
              <th>Gönderi Sayısı</th>
              <th>Toplam Koli</th>
              <th>Durum</th>
              <th>Oluşturan</th>
              <th>Tarih</th>
              <th style={{ textAlign: 'right' }}>Aksiyonlar</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 24 }}>
                  Yükleniyor...
                </td>
              </tr>
            ) : manifests.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 24 }}>
                  Henüz manifesto veya zimmet fişi bulunmuyor.
                </td>
              </tr>
            ) : (
              manifests.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.manifestNumber}</strong>
                  </td>
                  <td>
                    <span className={styles.badge}>
                      {m.provider === 'SURAT'
                        ? 'Sürat Kargo'
                        : m.provider === 'PTT'
                        ? 'PTT Kargo'
                        : 'Mock Carrier'}
                    </span>
                  </td>
                  <td>{m.shipmentCount} Adet</td>
                  <td>{m.totalPackageCount} Koli</td>
                  <td>{getStatusBadge(m.status)}</td>
                  <td>{m.createdBy}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {m.createdAt.slice(0, 10)} {m.createdAt.slice(11, 16)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <a
                        href={`/api/admin/warehouse/manifests/${m.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.btnSecondary}
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        Zimmet PDF
                      </a>

                      {m.status === 'OPEN' && (
                        <button
                          onClick={() => handleCloseManifest(m.id)}
                          className={styles.btnPrimary}
                          style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                          Manifestoyu Kapat
                        </button>
                      )}

                      {m.status === 'READY' && (
                        <button
                          onClick={() => {
                            setActiveManifest(m)
                            setShowHandoverModal(true)
                          }}
                          className={styles.btnPrimary}
                          style={{
                            padding: '4px 10px',
                            fontSize: 12,
                            backgroundColor: '#059669',
                          }}
                        >
                          Kuryeye Teslim Et
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: New Manifest */}
      {showCreateModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: 460 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              Yeni Kargo Zimmet Fişi
            </h2>
            <form onSubmit={handleCreateManifest}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
                  Taşıyıcı Kargo Şirketi
                </label>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value as any)}
                  className={styles.select}
                  style={{ width: '100%' }}
                >
                  <option value="SURAT">Sürat Kargo</option>
                  <option value="PTT">PTT Kargo</option>
                  <option value="MOCK">Mock Kargo (Test)</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
                  Notlar / Açıklama
                </label>
                <textarea
                  value={manifestNotes}
                  onChange={(e) => setManifestNotes(e.target.value)}
                  placeholder="Opsiyonel kargo çıkış notu..."
                  className={styles.input}
                  style={{ width: '100%', height: 70 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className={styles.btnSecondary}
                >
                  İptal
                </button>
                <button type="submit" disabled={creating} className={styles.btnPrimary}>
                  {creating ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Handover Confirmation */}
      {showHandoverModal && activeManifest && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: 500 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#065f46' }}>
              Kurye Teslimatı & Zimmet Onayı
            </h2>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 16 }}>
              Manifesto: <strong>{activeManifest.manifestNumber}</strong> ({activeManifest.shipmentCount} Gönderi)
              <br />
              Bu işlem onaylandığında gönderiler <strong>SHIPPED</strong> durumuna geçer ve merkezi stoktan düşülür.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
                Teslim Alan Kurye / Sürücü Adı Soyadı:
              </label>
              <input
                type="text"
                placeholder="Örn: Ahmet Yılmaz (Sürat Kargo Kuryesi)"
                value={carrierOperatorName}
                onChange={(e) => setCarrierOperatorName(e.target.value)}
                className={styles.input}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setShowHandoverModal(false)}
                className={styles.btnSecondary}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmHandover}
                disabled={handingOver}
                className={styles.btnPrimary}
                style={{ backgroundColor: '#059669' }}
              >
                {handingOver ? 'Onaylanıyor...' : 'Teslimatı Onayla & Sevk Et'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
