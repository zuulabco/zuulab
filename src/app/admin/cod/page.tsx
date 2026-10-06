'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { formatPrice } from '@/lib/utils'
import { COD_STAGES } from '@/lib/constants/cod-stages'
import styles from '../admin.module.css'
import { SkeletonRows } from '@/components/common/Skeleton'
import { useLiveRefresh } from '@/hooks/useLiveRefresh'

interface CodRow {
  orderNumber: string
  createdAt: string
  customerName: string
  city: string
  district: string
  totalAmount: number
  stage: string
  trackingNumber: string | null
}

interface BalanceInfo {
  balance: { balance: number; debt: number } | null
  error?: string
  topUpUrl: string
}

const FILTERS = [
  { id: 'ALL', label: 'Tümü' },
  { id: 'TODO', label: 'İşlem bekleyen' },
  { id: 'TRANSIT', label: 'Yolda' },
  { id: 'DONE', label: 'Tamamlanan' },
]

export default function AdminCodPage() {
  const { token, canFetch } = useAuthStore()
  const [rows, setRows] = useState<CodRow[]>([])
  const [balance, setBalance] = useState<BalanceInfo | null>(null)
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('TODO')

  const load = useCallback(() => {
    if (!canFetch) return
    fetch('/api/admin/cod', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setRows(d.orders)
          setBalance(d.balance)
          setConfigured(d.configured)
          setError(null)
        } else setError(d.error || 'Liste alınamadı.')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, canFetch])

  useEffect(load, [load])
  useLiveRefresh(load, 30_000, canFetch)

  const shown = rows.filter((r) => {
    if (filter === 'TODO') return ['NEW', 'ADDED', 'READY', 'LABEL'].includes(r.stage)
    if (filter === 'TRANSIT') return r.stage === 'SHIPPED'
    if (filter === 'DONE') return ['DELIVERED', 'FAILED', 'CANCELLED'].includes(r.stage)
    return true
  })
  const todo = rows.filter((r) => ['NEW', 'ADDED', 'READY'].includes(r.stage)).length
  const transit = rows.filter((r) => ['LABEL', 'SHIPPED'].includes(r.stage)).length

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Kapıda ödeme</h1>
          <p className={styles.pageSubtitle}>
            Kapıda ödemeli siparişler PTT Kargo ile Geliver üzerinden gider. Her siparişte sırayla: Geliver’e ekle, kargoyu hazırla, PTT etiketi oluştur.
          </p>
        </div>
      </div>

      {!configured && (
        <div className={styles.formCard} style={{ marginBottom: 16, color: '#b45309' }}>
          Geliver yapılandırılmamış: GELIVER_API_TOKEN ve GELIVER_SENDER_ADDRESS_ID ortam değişkenleri gerekli.
        </div>
      )}

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statTitle}>Geliver bakiyesi</div>
          {balance?.balance ? (
            <>
              <div className={styles.statValue}>{formatPrice(balance.balance.balance)}</div>
              {balance.balance.debt > 0 && <div className={styles.statDesc}>Borç: {formatPrice(balance.balance.debt)}</div>}
            </>
          ) : (
            <>
              <div className={styles.statValue} style={{ fontSize: 16 }}>Gösterilemiyor</div>
              <div className={styles.statDesc}>
                {balance?.error || 'Güncel bakiye için Geliver paneline bakın; yükleme de oradan yapılır.'}
              </div>
            </>
          )}
          <div style={{ marginTop: 10 }}>
            <a
              href={balance?.topUpUrl || 'https://app.geliver.io'}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              style={{ textDecoration: 'none' }}
            >
              ↗ Geliver’de bakiye yükle
            </a>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statTitle}>İşlem bekleyen</div>
          <div className={styles.statValue}>{todo}</div>
          <div className={styles.statDesc}>Etiketi henüz alınmamış sipariş</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statTitle}>Yolda</div>
          <div className={styles.statValue}>{transit}</div>
          <div className={styles.statDesc}>Etiketi alınmış, teslim edilmemiş</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`${styles.btn} ${styles.btnSm} ${filter === f.id ? styles.btnPrimary : styles.btnSecondary}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className={styles.formCard} style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      <div className={styles.formCard}>
        {loading ? (
          <SkeletonRows />
        ) : shown.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Bu filtrede kapıda ödemeli sipariş yok.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Sipariş</th>
                  <th>Müşteri</th>
                  <th>Teslimat</th>
                  <th style={{ textAlign: 'right' }}>Kapıda tahsil</th>
                  <th>Durum</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const st = COD_STAGES[r.stage] ?? COD_STAGES.NEW
                  return (
                    <tr key={r.orderNumber}>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{r.orderNumber}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(r.createdAt).toLocaleString('tr-TR')}</div>
                      </td>
                      <td>{r.customerName}</td>
                      <td>{r.district}, {r.city}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatPrice(r.totalAmount)}</td>
                      <td>
                        <span className={`${styles.badge} ${styles[st.badge]}`}>{st.label}</span>
                        {r.trackingNumber && (
                          <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 2 }}>{r.trackingNumber}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/admin/cod/${r.orderNumber}`} className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}>
                          Sipariş detayı
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
