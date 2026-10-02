'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import styles from '../admin.module.css'

type Status = 'PLANNED' | 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'STOCKED' | 'FAILED' | 'CANCELLED'
type Filter = 'OPEN' | 'COMPLETED' | 'DONE' | 'ALL'

interface Job {
  id: string
  productId: string
  productNameSnapshot: string
  skuSnapshot: string
  quantity: number
  completedQuantity: number
  acceptedQuantity: number
  failedQuantity: number
  status: Status
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  printerReference: string | null
  notes: string | null
  materialLabel: string | null
  gramsPerUnit: number | null
  requiredGrams: number | null
  materialConsumedGrams: number | null
  materialMissingGrams?: number
  createdAt: string
  completedAt: string | null
}

interface Suggestion {
  productId: string
  productName: string
  sku: string
  currentStock: number
  minimumStock: number
  allocatedStock: number
  suggestedProductionQty: number
}

const STATUS: Record<Status, { text: string; cls: string }> = {
  PLANNED: { text: 'Planlandı', cls: 'badgeNeutral' },
  QUEUED: { text: 'Sırada', cls: 'badgeNeutral' },
  IN_PROGRESS: { text: 'Basılıyor', cls: 'badgeInfo' },
  COMPLETED: { text: 'Bitti, stoğa alınacak', cls: 'badgeWarning' },
  STOCKED: { text: 'Stoğa alındı', cls: 'badgeSuccess' },
  FAILED: { text: 'Başarısız', cls: 'badgeDanger' },
  CANCELLED: { text: 'İptal', cls: 'badgeNeutral' },
}

const PRIORITY: Record<Job['priority'], string> = { LOW: 'Düşük', NORMAL: 'Normal', HIGH: 'Yüksek', URGENT: 'Acil' }

const FILTERS: Record<Filter, { label: string; statuses: Status[] | null }> = {
  OPEN: { label: 'Açık işler', statuses: ['PLANNED', 'QUEUED', 'IN_PROGRESS'] },
  COMPLETED: { label: 'Stoğa alınacaklar', statuses: ['COMPLETED'] },
  DONE: { label: 'Bitenler', statuses: ['STOCKED', 'FAILED', 'CANCELLED'] },
  ALL: { label: 'Tümü', statuses: null },
}

function gramsText(g: number | null): string {
  if (g === null) return '—'
  return g >= 1000 ? `${(g / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg` : `${g.toLocaleString('tr-TR')} g`
}

export default function ProductionPage() {
  const { token, canFetch } = useAuthStore()
  const [jobs, setJobs] = useState<Job[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [filter, setFilter] = useState<Filter>('OPEN')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [completeJob, setCompleteJob] = useState<Job | null>(null)
  const [completeForm, setCompleteForm] = useState({ printed: '', failed: '0', notes: '' })

  const headers = useCallback(
    (json = false): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }),
    [token]
  )

  const load = useCallback(() => {
    if (!canFetch) return
    Promise.all([
      fetch('/api/admin/production', { headers: headers() }).then((r) => r.json()),
      fetch('/api/admin/production/stats', { headers: headers() }).then((r) => r.json()),
    ])
      .then(([list, stats]) => {
        if (!list.success) throw new Error(list.error)
        setJobs(list.orders)
        setSuggestions(stats.lowStock ?? stats.lowStockProducts ?? [])
      })
      .catch((err) => toast.error(err.message || 'Üretim işleri yüklenemedi.'))
      .finally(() => setLoading(false))
  }, [canFetch, headers])

  useEffect(() => {
    load()
  }, [load])

  async function act(job: Job, action: 'start' | 'stock' | 'cancel' | 'fail', body?: Record<string, unknown>) {
    setBusyId(job.id)
    try {
      const res = await fetch(`/api/admin/production/${job.id}/${action}`, {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify(body ?? {}),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'İşlem yapılamadı.')
      if (action === 'stock') toast.success(`${job.productNameSnapshot}: ${job.acceptedQuantity} adet stoğa eklendi (stok ${data.newStock}).`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşlem yapılamadı.')
    } finally {
      setBusyId(null)
    }
  }

  async function submitComplete() {
    if (!completeJob) return
    const printed = Number(completeForm.printed)
    const failed = Number(completeForm.failed || 0)
    if (!Number.isInteger(printed) || printed < 1 || !Number.isInteger(failed) || failed < 0 || failed > printed) {
      toast.error('Basılan adet en az 1, hatalı adet basılandan fazla olamaz.')
      return
    }
    setBusyId(completeJob.id)
    try {
      const res = await fetch(`/api/admin/production/${completeJob.id}/complete`, {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ completedQuantity: printed, failedQuantity: failed, notes: completeForm.notes }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Kaydedilemedi.')
      toast.success(
        data.order.status === 'FAILED'
          ? 'Tüm parçalar hatalı: iş başarısız olarak kapandı.'
          : `${data.order.acceptedQuantity} sağlam parça hazır. "Stoğa al" ile stoğa ekleyin.`
      )
      setCompleteJob(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi.')
    } finally {
      setBusyId(null)
    }
  }

  const visible = jobs.filter((j) => !FILTERS[filter].statuses || FILTERS[filter].statuses!.includes(j.status))
  const count = (f: Filter) => jobs.filter((j) => !FILTERS[f].statuses || FILTERS[f].statuses!.includes(j.status)).length

  return (
    <div className={styles.adminPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Üretim (3D baskı)</h1>
          <p className={styles.pageSubtitle}>
            Stok yenileme işleri: bas → bitir (sağlam/hatalı) → stoğa al. Filament, iş bitince basılan her parça için düşülür.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/materials" className={styles.secondaryButton}>
            Filament
          </Link>
          <Link href="/admin/production/new" className={styles.primaryButton}>
            + Yeni baskı işi
          </Link>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className={styles.tableCard} style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Basılması önerilenler (minimum stoğun altında)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {suggestions.map((s) => (
              <Link
                key={s.productId}
                href={`/admin/production/new?productId=${s.productId}&quantity=${s.suggestedProductionQty || s.minimumStock}`}
                className={styles.secondaryButton}
                style={{ fontSize: 12 }}
                title={`Stok ${s.currentStock} / minimum ${s.minimumStock}${s.allocatedStock ? ` · üretimde ${s.allocatedStock}` : ''}`}
              >
                {s.productName}: stok {s.currentStock}/{s.minimumStock}
                {s.suggestedProductionQty > 0 ? ` → ${s.suggestedProductionQty} bas` : ' (üretimde)'}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className={styles.operationalTabs}>
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`${styles.operationalTabItem} ${filter === f ? styles.active : ''}`}
          >
            {FILTERS[f].label} ({count(f)})
          </button>
        ))}
      </div>

      <div className={styles.tableCard}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Yükleniyor…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            Bu listede iş yok. &quot;+ Yeni baskı işi&quot; ile başlayın.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ürün</th>
                <th>Adet</th>
                <th>Filament</th>
                <th>Durum</th>
                <th>Oluşturma</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((j) => {
                const busy = busyId === j.id
                return (
                  <tr key={j.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{j.productNameSnapshot}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {j.skuSnapshot}
                        {j.priority !== 'NORMAL' && ` · ${PRIORITY[j.priority]}`}
                        {j.printerReference && ` · ${j.printerReference}`}
                      </div>
                      {j.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{j.notes}</div>}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {j.quantity}
                      {j.completedQuantity > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {j.acceptedQuantity} sağlam · {j.failedQuantity} hatalı
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {j.materialLabel ?? <span style={{ color: 'var(--text-muted)' }}>seçilmedi</span>}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {j.materialConsumedGrams !== null
                          ? `kullanılan ${gramsText(j.materialConsumedGrams)}`
                          : j.requiredGrams !== null
                            ? `gerekli ${gramsText(j.requiredGrams)} (${j.gramsPerUnit} g/adet)`
                            : 'gram bilgisi yok'}
                      </div>
                      {(j.materialMissingGrams ?? 0) > 0 && (
                        <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>{gramsText(j.materialMissingGrams!)} eksik</div>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[STATUS[j.status].cls]}`}>{STATUS[j.status].text}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{new Date(j.createdAt).toLocaleDateString('tr-TR')}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {(j.status === 'PLANNED' || j.status === 'QUEUED') && (
                          <button className={styles.primaryButton} style={{ padding: '3px 10px', fontSize: 11 }} disabled={busy} onClick={() => act(j, 'start')}>
                            Baskıya başla
                          </button>
                        )}
                        {j.status === 'IN_PROGRESS' && (
                          <button
                            className={styles.primaryButton}
                            style={{ padding: '3px 10px', fontSize: 11 }}
                            disabled={busy}
                            onClick={() => {
                              setCompleteJob(j)
                              setCompleteForm({ printed: String(j.quantity), failed: '0', notes: '' })
                            }}
                          >
                            Bitir
                          </button>
                        )}
                        {j.status === 'COMPLETED' && (
                          <button className={styles.primaryButton} style={{ padding: '3px 10px', fontSize: 11 }} disabled={busy} onClick={() => act(j, 'stock')}>
                            Stoğa al ({j.acceptedQuantity})
                          </button>
                        )}
                        {['PLANNED', 'QUEUED', 'IN_PROGRESS'].includes(j.status) && (
                          <button
                            className={styles.secondaryButton}
                            style={{ padding: '3px 10px', fontSize: 11 }}
                            disabled={busy}
                            onClick={() => window.confirm(`"${j.productNameSnapshot}" işi iptal edilsin mi?`) && act(j, 'cancel')}
                          >
                            İptal
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={Boolean(completeJob)} onClose={() => !busyId && setCompleteJob(null)} ariaLabel="Baskıyı bitir" maxWidth={440}>
        {completeJob && (
          <div style={{ padding: '8px 4px' }}>
            <h3 style={{ marginTop: 0 }}>{completeJob.productNameSnapshot}: baskı bitti</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Yazıcıdan çıkan toplam parçayı ve bunların kaçının hatalı olduğunu girin. Filament basılan her parça için
              düşülür
              {completeJob.gramsPerUnit !== null && completeJob.materialLabel
                ? ` (${completeJob.gramsPerUnit} g/adet, ${completeJob.materialLabel})`
                : ''}
              . Sağlam parçalar sonra &quot;Stoğa al&quot; ile stoğa eklenir.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Basılan (toplam)</label>
                <input type="number" min={1} step={1} className={styles.formInput} value={completeForm.printed} onChange={(e) => setCompleteForm({ ...completeForm, printed: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Hatalı</label>
                <input type="number" min={0} step={1} className={styles.formInput} value={completeForm.failed} onChange={(e) => setCompleteForm({ ...completeForm, failed: e.target.value })} />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Not (isteğe bağlı)</label>
              <input className={styles.formInput} value={completeForm.notes} onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setCompleteJob(null)} disabled={Boolean(busyId)}>
                Vazgeç
              </button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={submitComplete} disabled={Boolean(busyId)}>
                Kaydet
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
