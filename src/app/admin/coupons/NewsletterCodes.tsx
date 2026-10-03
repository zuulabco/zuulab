'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { SkeletonRows } from '@/components/common/Skeleton'
import styles from '../admin.module.css'

interface NewsletterCode {
  id: string
  code: string
  assignedEmail?: string | null
  discountValue: number
  isActive: boolean
  currentUses?: number
  usedCount: number
  createdAt?: string | null
  usedInOrder?: string | null
  usedAt?: string | null
}

type Filter = 'ALL' | 'UNUSED' | 'USED'

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/**
 * Random single-use welcome codes handed out when someone confirms the newsletter.
 * Read-only on purpose: they are created and spent by the system, never typed here.
 */
export default function NewsletterCodes() {
  const { token, canFetch } = useAuthStore()
  const [codes, setCodes] = useState<NewsletterCode[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')

  useEffect(() => {
    if (!canFetch) return
    fetch('/api/admin/coupons?source=NEWSLETTER', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCodes(d.coupons)
        else toast.error(d.error || 'Bülten kodları alınamadı.')
      })
      .catch(() => toast.error('Bülten kodları alınamadı.'))
      .finally(() => setLoading(false))
  }, [token, canFetch])

  const used = (c: NewsletterCode) => (c.usedCount || c.currentUses || 0) > 0
  const usedCount = codes.filter(used).length

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return codes.filter((c) => {
      if (filter === 'USED' && !used(c)) return false
      if (filter === 'UNUSED' && used(c)) return false
      return !q || c.code.toLowerCase().includes(q) || (c.assignedEmail ?? '').includes(q)
    })
  }, [codes, search, filter])

  return (
    <>
      <p className={styles.subtitle} style={{ margin: '0 0 16px' }}>
        Bültene kaydolup e-postasını onaylayan herkese otomatik verilen, tek kullanımlık %10 kodlar. Kendi kuponlarınızla
        karışmaz; burada yalnızca takip edilir. Aboneler: <Link href="/content/newsletter">Vitrin → Bülten</Link>.
      </p>

      <div className={styles.operationalTabs}>
        {(
          [
            ['ALL', `Tümü (${codes.length})`],
            ['UNUSED', `Kullanılmadı (${codes.length - usedCount})`],
            ['USED', `Kullanıldı (${usedCount})`],
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
            placeholder="Kod veya e-posta ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.input}
          />
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Kod</th>
              <th>Verildiği e-posta</th>
              <th>Oluşturulma</th>
              <th>Durum</th>
              <th>Kullanıldığı sipariş</th>
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
                  {codes.length === 0
                    ? 'Henüz bülten kodu yok. Biri bültene kaydolup e-postasını onayladığında burada görünür.'
                    : 'Aramaya uyan kod yok.'}
                </td>
              </tr>
            ) : (
              shown.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{c.code}</td>
                  <td>{c.assignedEmail ?? '—'}</td>
                  <td>{fmtDate(c.createdAt)}</td>
                  <td>
                    {used(c) ? (
                      <span className={`${styles.badge} ${styles.badgeNeutral ?? ''}`}>kullanıldı</span>
                    ) : c.isActive ? (
                      <span className={`${styles.badge} ${styles.badgeSuccess ?? ''}`}>kullanılabilir</span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeDanger ?? ''}`}>durduruldu</span>
                    )}
                  </td>
                  <td>
                    {c.usedInOrder ? (
                      <>
                        <Link href={`/orders/${c.usedInOrder}`}>#{c.usedInOrder}</Link>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{fmtDate(c.usedAt)}</span>
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
    </>
  )
}
