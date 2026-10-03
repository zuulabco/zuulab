'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { SkeletonRows } from '@/components/common/Skeleton'
import styles from '../../admin.module.css'

interface Subscriber {
  id: string
  email: string
  status: 'PENDING' | 'ACTIVE' | 'UNSUBSCRIBED'
  source: string
  createdAt: string | null
  confirmedAt: string | null
  unsubscribedAt: string | null
  couponCode: string | null
  couponUsed: boolean
}

const STATUS: Record<Subscriber['status'], { label: string; cls: string }> = {
  ACTIVE: { label: 'abone', cls: 'badgeSuccess' },
  PENDING: { label: 'onay bekliyor', cls: 'badgeWarning' },
  UNSUBSCRIBED: { label: 'ayrıldı', cls: 'badgeNeutral' },
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function AdminNewsletterPage() {
  const { token, canFetch } = useAuthStore()
  const [rows, setRows] = useState<Subscriber[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | Subscriber['status']>('ACTIVE')
  const [search, setSearch] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!canFetch) return
    fetch('/api/admin/newsletter', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error)
        setRows(d.subscribers)
        setCounts(d.counts)
      })
      .catch((e) => toast.error((e as Error).message || 'Abone listesi alınamadı.'))
      .finally(() => setLoading(false))
  }, [token, canFetch])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => (filter === 'ALL' || r.status === filter) && (!q || r.email.includes(q)))
  }, [rows, filter, search])

  const downloadCsv = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/admin/newsletter?format=csv', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('İndirilemedi.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'zuulab-bulten.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Bülten</h1>
          <p className={styles.pageSubtitle}>
            Ana sayfadaki formdan kaydolanlar. Kişi onay e-postasındaki bağlantıya tıklayınca &quot;abone&quot; olur ve ona tek
            kullanımlık %10 kod gönderilir. Kodları <Link href="/coupons">Kuponlar → Bülten kodları</Link> sekmesinden takip
            edebilirsiniz.
          </p>
        </div>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnSecondary}`}
          onClick={downloadCsv}
          disabled={downloading || !counts.ACTIVE}
        >
          {downloading ? 'Hazırlanıyor…' : 'Aboneleri indir (CSV)'}
        </button>
      </div>

      <div className={styles.operationalTabs}>
        {(
          [
            ['ACTIVE', `Aboneler (${counts.ACTIVE ?? 0})`],
            ['PENDING', `Onay bekleyen (${counts.PENDING ?? 0})`],
            ['UNSUBSCRIBED', `Ayrılan (${counts.UNSUBSCRIBED ?? 0})`],
            ['ALL', `Tümü (${rows.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`${styles.operationalTabItem} ${filter === key ? styles.active : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.filterBar}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <input
            type="search"
            className={styles.input}
            placeholder="E-posta ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>E-posta</th>
              <th>Durum</th>
              <th>Kayıt</th>
              <th>Onay</th>
              <th>İndirim kodu</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>
                  <SkeletonRows rows={4} cols={5} />
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                  {rows.length === 0 ? 'Henüz bülten kaydı yok.' : 'Bu filtrede kayıt yok.'}
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.email}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[STATUS[r.status].cls] ?? ''}`}>{STATUS[r.status].label}</span>
                  </td>
                  <td>{fmt(r.createdAt)}</td>
                  <td>{r.status === 'UNSUBSCRIBED' ? `ayrıldı: ${fmt(r.unsubscribedAt)}` : fmt(r.confirmedAt)}</td>
                  <td>
                    {r.couponCode ? (
                      <>
                        <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{r.couponCode}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{r.couponUsed ? 'kullanıldı' : 'kullanılmadı'}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
