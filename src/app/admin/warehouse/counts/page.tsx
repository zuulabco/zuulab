'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import styles from '../../admin.module.css'

interface CountSession {
  id: string
  countNumber: string
  warehouseId: string
  type: string
  status: string
  blindMode: boolean
  createdBy: string
  assignedTo: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  lines?: any[]
  tickets?: any[]
}

export default function AdminWarehouseCountsPage() {
  const { token, user, canFetch } = useAuthStore()

  const [sessions, setSessions] = useState<CountSession[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // New count modal state
  const [showModal, setShowModal] = useState(false)
  const [formType, setFormType] = useState('LOCATION')
  const [formBlindMode, setFormBlindMode] = useState(true)
  const [formAssignedTo, setFormAssignedTo] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchSessions = async () => {
    if (!canFetch) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/admin/warehouse/counts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setSessions(data.sessions || [])
      } else {
        setError(data.error || 'Sayım oturumları alınamadı.')
      }
    } catch {
      setError('Sayım servisine ulaşılamadı.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [token, canFetch, statusFilter])

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch) return
    setCreating(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/warehouse/counts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: formType,
          blindMode: formBlindMode,
          assignedTo: formAssignedTo || undefined,
          notes: formNotes || undefined,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setMessage(`Sayım oturumu #${data.session.countNumber} başarıyla oluşturuldu.`)
        setShowModal(false)
        setFormNotes('')
        fetchSessions()
      } else {
        setError(data.error || 'Sayım oturumu oluşturulamadı.')
      }
    } catch {
      setError('Sayım oluşturma servisine bağlanılamadı.')
    } finally {
      setCreating(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <span className={`${styles.badge} ${styles.badgeMuted}`}>Taslak</span>
      case 'ASSIGNED':
        return <span className={`${styles.badge} ${styles.badgeInfo}`}>Atandı</span>
      case 'IN_PROGRESS':
        return <span className={`${styles.badge} ${styles.badgePrimary}`}>Sayılıyor</span>
      case 'COUNTED':
        return <span className={`${styles.badge} ${styles.badgeSuccess}`}>Sayıldı</span>
      case 'UNDER_REVIEW':
        return <span className={`${styles.badge} ${styles.badgeWarning}`}>İncelemede</span>
      case 'RECOUNT_REQUIRED':
        return <span className={`${styles.badge} ${styles.badgeDanger}`}>Yeniden Sayım Gerekli</span>
      case 'APPROVED':
        return <span className={`${styles.badge} ${styles.badgeSuccess}`}>Onaylandı</span>
      case 'RECONCILED':
        return <span className={`${styles.badge} ${styles.badgeSuccess}`} style={{ background: '#059669' }}>Uzlaştırıldı</span>
      case 'CANCELLED':
        return <span className={`${styles.badge} ${styles.badgeMuted}`}>İptal</span>
      default:
        return <span className={styles.badge}>{status}</span>
    }
  }

  const kpis = {
    total: sessions.length,
    inProgress: sessions.filter((s) => s.status === 'IN_PROGRESS').length,
    underReview: sessions.filter((s) => s.status === 'UNDER_REVIEW' || s.status === 'RECOUNT_REQUIRED').length,
    reconciled: sessions.filter((s) => s.status === 'RECONCILED').length,
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dönemsel Sayım & Kör Denetim (Cycle Counting)</h1>
          <p className={styles.subtitle}>
            Fiziksel depo stok sayımları, kör denetimler, fark tespiti ve yetkili uzlaştırma masası
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/admin/warehouse" className={styles.btnSecondary}>
            ← Depo Ana Paneli
          </Link>
          <Link href="/admin/warehouse/pda" className={styles.btnPrimary} style={{ background: '#0284c7' }}>
            Mobil PDA Sayım Modu
          </Link>
          <button
            onClick={() => setShowModal(true)}
            className={styles.btnPrimary}
            style={{ background: '#7c3aed' }}
          >
            + Yeni Sayım Oturumu
          </button>
        </div>
      </div>

      {message && <div className={styles.alertSuccess}>{message}</div>}
      {error && <div className={styles.alertDanger}>{error}</div>}

      {/* KPI Cards */}
      <div className={styles.kpiGrid} style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Toplam Sayım Oturumu</div>
          <div className={styles.kpiValue}>{kpis.total}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Devam Eden Sayımlar</div>
          <div className={styles.kpiValue} style={{ color: '#2563eb' }}>{kpis.inProgress}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>İnceleme / Yeniden Sayım</div>
          <div className={styles.kpiValue} style={{ color: '#d97706' }}>{kpis.underReview}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Uzlaştırılmış (Tamamlanan)</div>
          <div className={styles.kpiValue} style={{ color: '#16a34a' }}>{kpis.reconciled}</div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
              Durum Filtresi
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.select}
            >
              <option value="">Tüm Durumlar</option>
              <option value="DRAFT">Taslak (DRAFT)</option>
              <option value="ASSIGNED">Atandı (ASSIGNED)</option>
              <option value="IN_PROGRESS">Sayılıyor (IN_PROGRESS)</option>
              <option value="COUNTED">Sayıldı (COUNTED)</option>
              <option value="UNDER_REVIEW">İncelemede (UNDER_REVIEW)</option>
              <option value="RECOUNT_REQUIRED">Yeniden Sayım (RECOUNT_REQUIRED)</option>
              <option value="APPROVED">Onaylandı (APPROVED)</option>
              <option value="RECONCILED">Uzlaştırıldı (RECONCILED)</option>
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button onClick={fetchSessions} className={styles.btnSecondary}>
              Yenile
            </button>
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className={styles.card}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            Sayım oturumları yükleniyor...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            Kayıtlı sayım oturumu bulunamadı.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Sayım No</th>
                  <th>Tür</th>
                  <th>Kör Denetim</th>
                  <th>Oluşturan</th>
                  <th>Atanan</th>
                  <th>Durum</th>
                  <th>Tarih</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((sess) => (
                  <tr key={sess.id}>
                    <td style={{ fontWeight: 600 }}>{sess.countNumber}</td>
                    <td>{sess.type}</td>
                    <td>
                      {sess.blindMode ? (
                        <span style={{ color: '#0891b2', fontWeight: 600 }}>Kör Sayım (Blind)</span>
                      ) : (
                        <span style={{ color: '#64748b' }}>Standart</span>
                      )}
                    </td>
                    <td>{sess.createdBy}</td>
                    <td>{sess.assignedTo || '—'}</td>
                    <td>{getStatusBadge(sess.status)}</td>
                    <td style={{ fontSize: 13, color: '#64748b' }}>
                      {new Date(sess.createdAt).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <Link
                        href={`/admin/warehouse/counts/${sess.id}`}
                        className={styles.btnSecondary}
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        Detay & Say / Onayla →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Session Modal */}
      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: 520 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              Yeni Sayım Oturumu Oluştur
            </h2>
            <form onSubmit={handleCreateSession}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Sayım Türü
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className={styles.select}
                  style={{ width: '100%' }}
                >
                  <option value="LOCATION">Lokasyon Bazlı (LOCATION)</option>
                  <option value="SKU">SKU / Ürün Bazlı (SKU)</option>
                  <option value="CYCLE">Dönemsel Döngüsel Sayım (CYCLE)</option>
                  <option value="SPOT_CHECK">Noktasal Kontrol (SPOT_CHECK)</option>
                  <option value="FULL_AUDIT">Tam Depo Denetimi (FULL_AUDIT)</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formBlindMode}
                    onChange={(e) => setFormBlindMode(e.target.checked)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    Kör Denetim Modu (Operatör sayım yapmadan sistem stok miktarını göremez)
                  </span>
                </label>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Atanan Operatör (Opsiyonel)
                </label>
                <input
                  type="text"
                  placeholder="Operatör adı / e-posta"
                  value={formAssignedTo}
                  onChange={(e) => setFormAssignedTo(e.target.value)}
                  className={styles.input}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Notlar / Açıklama
                </label>
                <textarea
                  rows={3}
                  placeholder="Sayım gerekçesi veya lokasyon notu..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className={styles.input}
                  style={{ width: '100%', resize: 'vertical' }}
                />
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
                  disabled={creating}
                  className={styles.btnPrimary}
                  style={{ background: '#7c3aed' }}
                >
                  {creating ? 'Oluşturuluyor...' : 'Oturumu Başlat / Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
