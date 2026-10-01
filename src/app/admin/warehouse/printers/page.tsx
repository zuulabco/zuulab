'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import styles from '../../admin.module.css'

interface WarehousePrinter {
  id: string
  name: string
  printerType: string
  ipAddress: string
  port: number
  dpi: number
  labelWidthMm: number
  labelHeightMm: number
  isDefault: boolean
  isActive: boolean
  isOnline: boolean
  lastHeartbeatAt: string | null
  agentId: string | null
}

export default function AdminWarehousePrintersPage() {
  const { token, user, canFetch } = useAuthStore()

  const [printers, setPrinters] = useState<WarehousePrinter[]>([])
  const [loading, setLoading] = useState(true)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAgentModal, setShowAgentModal] = useState<string | null>(null)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)

  // New Printer Form
  const [name, setName] = useState('')
  const [ipAddress, setIpAddress] = useState('')
  const [port, setPort] = useState('9100')
  const [dpi, setDpi] = useState('203')
  const [agentId, setAgentId] = useState('')
  const [creating, setCreating] = useState(false)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchPrinters = async () => {
    if (!canFetch) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/warehouse/printers', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setPrinters(data.printers || [])
      } else {
        setError(data.error || 'Yazıcılar alınamadı.')
      }
    } catch {
      setError('Yazıcı servisine ulaşılamadı.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPrinters()
  }, [token, canFetch, canFetch])

  const handleTestPrint = async (printerId: string) => {
    if (!canFetch) return
    setTestingId(printerId)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/admin/warehouse/printers/${printerId}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`Test yazdırma işi gönderildi (İş No: ${data.job?.id}).`)
      } else {
        setError(data.error || 'Test yazdırma başarısız.')
      }
    } catch {
      setError('Test yazdırma servisine ulaşılamadı.')
    } finally {
      setTestingId(null)
    }
  }

  const handleCreatePrinter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch) return
    setCreating(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/warehouse/printers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          ipAddress,
          port: parseInt(port, 10) || 9100,
          dpi: parseInt(dpi, 10) || 203,
          agentId: agentId || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`Yazıcı kaydedildi: ${data.printer.name}`)
        setShowAddModal(false)
        setName('')
        setIpAddress('')
        fetchPrinters()
      } else {
        setError(data.error || 'Yazıcı kaydedilemedi.')
      }
    } catch {
      setError('Kayıt sırasında hata oluştu.')
    } finally {
      setCreating(false)
    }
  }

  const handleGenerateAgentToken = async (printerId: string) => {
    if (!canFetch) return
    setError(null)
    try {
      const res = await fetch('/api/print-agent/register', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          printerId,
          agentId: `agent_${printerId}`,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setGeneratedToken(data.token)
        setShowAgentModal(printerId)
      } else {
        setError(data.error || 'Agent token üretilemedi.')
      }
    } catch {
      setError('Agent kaydı başarısız.')
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
          <h1 className={styles.title}>Zebra Termal Yazıcılar & Yerel Ajan (Print Agent)</h1>
          <p className={styles.subtitle}>
            Buluttan yerel depo ağına güvenli (HTTPS/Agent) 100×100mm ZPL II barkod ve kargo etiketi yazdırma mimarisi
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowAddModal(true)} className={styles.btnPrimary}>
            + Yeni Yazıcı Tanımla
          </button>
        </div>
      </div>

      {message && <div className={styles.alertSuccess}>{message}</div>}
      {error && <div className={styles.alertDanger}>{error}</div>}

      {/* Info card */}
      <div className={styles.card} style={{ marginBottom: 20, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={styles.tabDot} style={{ background: 'var(--zuu-blue)', width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Yerel Ağ & Güvenlik Mimarisi:</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Web tarayıcısı doğrudan yerel TCP portu (9100) açmaz. Depo içindeki yerel Print Agent, güvenli HTTPS Bearer Token ile Zuulab Cloud kuyruğunu dinler ve ZPL kodunu termal yazıcıya iletir.
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={styles.card}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Yazıcı Adı</th>
                <th>Protokol</th>
                <th>Yerel IP & Port</th>
                <th>Çözünürlük</th>
                <th>Etiket Boyutu</th>
                <th>Ajan (Agent ID)</th>
                <th>Çevrimiçi Durum</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                    Yazıcılar yükleniyor...
                  </td>
                </tr>
              ) : printers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                    Tanımlı yazıcı bulunamadı.
                  </td>
                </tr>
              ) : (
                printers.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.isDefault && <span className={styles.tag} style={{ marginLeft: 6 }}>Varsayılan</span>}
                    </td>
                    <td>
                      <span className={styles.tag}>{p.printerType}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', color: '#1e293b' }}>
                        {p.ipAddress}:{p.port}
                      </span>
                    </td>
                    <td>{p.dpi} DPI</td>
                    <td>{p.labelWidthMm}×{p.labelHeightMm} mm</td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.agentId || 'Atanmadı'}</span>
                    </td>
                    <td>
                      {p.isOnline ? (
                        <span className={styles.badgeSuccess}>Çevrimiçi (Online)</span>
                      ) : (
                        <span className={styles.badgeDanger}>Çevrimdışı (Offline)</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => handleTestPrint(p.id)}
                          className={styles.btnSecondary}
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          disabled={testingId === p.id}
                        >
                          {testingId === p.id ? 'Yazdırılıyor...' : 'Test Yazdır'}
                        </button>

                        <button
                          onClick={() => handleGenerateAgentToken(p.id)}
                          className={styles.btnPrimary}
                          style={{ padding: '4px 10px', fontSize: 12, background: '#475569' }}
                        >
                          Agent Token Al
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Printer Modal */}
      {showAddModal && (
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
          <div className={styles.card} style={{ width: 440 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>Yeni Zebra Yazıcı Tanımla</h2>
            <form onSubmit={handleCreatePrinter}>
              <div style={{ marginBottom: 12 }}>
                <label className={styles.label}>Yazıcı Adı</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Depo 1 Paketleme Masası Zebra"
                  className={styles.input}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label className={styles.label}>Yerel IP Adresi</label>
                  <input
                    type="text"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="192.168.1.180"
                    className={styles.input}
                    required
                  />
                </div>
                <div>
                  <label className={styles.label}>Port</label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className={styles.label}>Çözünürlük (DPI)</label>
                <select value={dpi} onChange={(e) => setDpi(e.target.value)} className={styles.select}>
                  <option value="203">203 DPI (Standart 8 dot/mm)</option>
                  <option value="300">300 DPI (Yüksek 12 dot/mm)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={styles.btnSecondary}
                  disabled={creating}
                >
                  İptal
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={creating}>
                  {creating ? 'Kaydediliyor...' : 'Yazıcıyı Ekle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Agent Token Modal */}
      {showAgentModal && generatedToken && (
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
          <div className={styles.card} style={{ width: 500 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Yerel Agent Güvenlik Tokenı</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Bu token yerel depoda çalışan Python/Go/Node print agent servisine girilmelidir. Güvenlik nedeniyle bir daha gösterilmeyecektir.
            </p>
            <div style={{ padding: 12, background: '#f1f5f9', borderRadius: 6, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all', marginBottom: 16 }}>
              {generatedToken}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowAgentModal(null)
                  setGeneratedToken(null)
                }}
                className={styles.btnPrimary}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
