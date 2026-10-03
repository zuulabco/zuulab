'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { getReviewStatusConfig } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'
import { SkeletonList } from '@/components/common/Skeleton'

interface ReviewItem {
  id: string
  userId: string
  userEmail: string
  userName: string
  productId: string
  productName: string
  orderId: string | null
  rating: number
  title: string | null
  body: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  isVerifiedBuy: boolean
  moderationNote: string | null
  createdAt: string
}

export default function AdminReviewsPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Moderation confirmation modal state
  const [modalAction, setModalAction] = useState<{
    review: ReviewItem
    action: 'APPROVE' | 'REJECT'
  } | null>(null)
  const [moderationNote, setModerationNote] = useState('')

  const loadReviews = () => {
    if (!canFetch) return
    setLoading(true)

    const url = statusFilter === 'ALL'
      ? '/api/admin/reviews'
      : `/api/admin/reviews?status=${statusFilter}`

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.reviews)) {
          setReviews(data.reviews)
        }
      })
      .catch((err) => {
        console.error(err)
        addToast('Değerlendirmeler alınırken hata oluştu.', 'error')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadReviews()
  }, [token, canFetch, statusFilter])

  // Filtered reviews by search term
  const filteredReviews = useMemo(() => {
    if (!searchTerm.trim()) return reviews
    const q = searchTerm.toLowerCase()
    return reviews.filter(
      (r) =>
        r.productName?.toLowerCase().includes(q) ||
        r.userName?.toLowerCase().includes(q) ||
        r.userEmail?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.body?.toLowerCase().includes(q)
    )
  }, [reviews, searchTerm])

  // Computed metrics
  const metrics = useMemo(() => {
    const total = reviews.length
    const approved = reviews.filter((r) => r.status === 'APPROVED').length
    const pending = reviews.filter((r) => r.status === 'PENDING').length
    const rejected = reviews.filter((r) => r.status === 'REJECTED').length
    const avgRating = total > 0
      ? (reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / total).toFixed(1)
      : '0.0'
    return { total, approved, pending, rejected, avgRating }
  }, [reviews])

  const handleConfirmModerate = async () => {
    if (!canFetch || !modalAction) return
    const { review, action } = modalAction
    setActionLoading(review.id)

    try {
      const res = await fetch(`/api/admin/reviews/${review.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          moderationNote: moderationNote.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      addToast(
        `Değerlendirme ${action === 'APPROVE' ? 'onaylandı ve yayına alındı.' : 'reddedildi ve yayından kaldırıldı.'}`,
        'success'
      )
      setModalAction(null)
      setModerationNote('')
      loadReviews()
    } catch (err: any) {
      addToast(err.message || 'Moderasyon işlemi gerçekleştirilemedi.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Müşteri Değerlendirmeleri</h1>
          <p className={styles.subtitle}>
            Ürün yorumlarını ve müşteri geri bildirimlerini denetleyin, moderasyon kararlarını yönetin.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={() => loadReviews()}
            disabled={loading}
          >
            Yenile
          </button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Toplam Yorum</div>
          <div className={styles.metricValue}>{metrics.total}</div>
          <div className={styles.metricSub}>Sistem kayıtlı tüm geri bildirimler</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Onay Bekleyen</div>
          <div className={styles.metricValue} style={{ color: metrics.pending > 0 ? 'var(--warning)' : 'inherit' }}>
            {metrics.pending}
          </div>
          <div className={styles.metricSub}>İnceleme sırasındaki yorumlar</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Yayında (Onaylı)</div>
          <div className={styles.metricValue} style={{ color: 'var(--success)' }}>
            {metrics.approved}
          </div>
          <div className={styles.metricSub}>Mağazada görünen yorumlar</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Reddedilen / Gizlenen</div>
          <div className={styles.metricValue}>{metrics.rejected}</div>
          <div className={styles.metricSub}>Moderasyondan geçmeyenler</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Ortalama Puan</div>
          <div className={styles.metricValue} style={{ fontFamily: 'var(--font-mono)' }}>
            ★ {metrics.avgRating}
          </div>
          <div className={styles.metricSub}>5.0 üzerinden genel memnuniyet</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.filterBar}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'ALL', label: 'Tümü' },
            { key: 'PENDING', label: `İnceleme Bekleyen (${metrics.pending})` },
            { key: 'APPROVED', label: 'Yayında' },
            { key: 'REJECTED', label: 'Reddedilenler' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={styles.ghostBtn}
              style={{
                fontSize: 12,
                fontWeight: 600,
                background: statusFilter === tab.key ? 'var(--text-primary)' : 'var(--surface-0)',
                color: statusFilter === tab.key ? 'var(--surface-0)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          placeholder="Ürün, müşteri veya yorum metninde ara..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchBox}
          style={{ width: 280 }}
        />
      </div>

      {/* Reviews Table */}
      <div className={styles.tableCard}>
        {loading ? (
          <SkeletonList rows={5} />
        ) : filteredReviews.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              {searchTerm ? 'Aramanızla eşleşen değerlendirme bulunamadı.' : 'Bu filtrede henüz değerlendirme yok.'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {searchTerm ? 'Farklı bir anahtar kelime deneyebilir veya filtreyi temizleyebilirsiniz.' : 'Müşteriler sipariş ettikleri ürünleri değerlendirdikçe burada listelenecektir.'}
            </div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Müşteri</th>
                  <th>Puan</th>
                  <th>Başlık & Yorum</th>
                  <th>Durum</th>
                  <th>Tarih</th>
                  <th style={{ textAlign: 'right' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredReviews.map((rev) => {
                  const statusCfg = getReviewStatusConfig(rev.status)
                  const initials = (rev.userName || 'M')
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((n) => n[0].toUpperCase())
                    .join('')

                  return (
                    <tr key={rev.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {rev.productName || 'İsimsiz Ürün'}
                        </div>
                        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 2 }}>
                          {rev.productId ? `#${rev.productId.slice(0, 8)}` : '—'}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: 'var(--surface-2)',
                              color: 'var(--text-secondary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 10,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                              {rev.userId ? (
                                <Link
                                  href={`/admin/customers/${rev.userId}`}
                                  style={{ color: 'inherit', textDecoration: 'none' }}
                                >
                                  {rev.userName}
                                </Link>
                              ) : (
                                rev.userName
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {rev.userEmail}
                            </div>
                            {rev.isVerifiedBuy && (
                              <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, display: 'inline-block', marginTop: 2 }}>
                                Doğrulanmış Sipariş
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#f59e0b', fontSize: 13, letterSpacing: 1 }}>
                            {'★'.repeat(rev.rating)}
                            <span style={{ color: 'var(--border)' }}>{'☆'.repeat(Math.max(0, 5 - rev.rating))}</span>
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {rev.rating}.0
                          </span>
                        </div>
                      </td>

                      <td style={{ maxWidth: 320 }}>
                        {rev.title && (
                          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>
                            {rev.title}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          {rev.body}
                        </div>
                        {rev.moderationNote && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 4 }}>
                            Not: {rev.moderationNote}
                          </div>
                        )}
                      </td>

                      <td>
                        <span className={`${styles.badge} ${statusCfg.badgeClass}`}>
                          {statusCfg.label}
                        </span>
                      </td>

                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(rev.createdAt).toLocaleDateString('tr-TR')}
                      </td>

                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {rev.status !== 'APPROVED' && (
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              style={{ padding: '4px 10px', fontSize: 11, color: '#059669', borderColor: '#059669' }}
                              onClick={() => {
                                setModalAction({ review: rev, action: 'APPROVE' })
                                setModerationNote('')
                              }}
                            >
                              Onayla
                            </button>
                          )}
                          {rev.status !== 'REJECTED' && (
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              style={{ padding: '4px 10px', fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              onClick={() => {
                                setModalAction({ review: rev, action: 'REJECT' })
                                setModerationNote('')
                              }}
                            >
                              Reddet
                            </button>
                          )}
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

      {/* Moderation Confirmation Modal */}
      {modalAction && (
        <Modal
          isOpen={!!modalAction}
          onClose={() => setModalAction(null)}
          ariaLabel={modalAction.action === 'APPROVE' ? 'Değerlendirmeyi Onayla' : 'Değerlendirmeyi Reddet'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {modalAction.action === 'APPROVE' ? 'Değerlendirmeyi Onayla' : 'Değerlendirmeyi Reddet'}
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              {modalAction.action === 'APPROVE' ? (
                <>
                  <strong>{modalAction.review.productName}</strong> ürünü için yapılan bu değerlendirmeyi onaylayıp mağazada yayına almak istediğinize emin misiniz?
                </>
              ) : (
                <>
                  <strong>{modalAction.review.productName}</strong> ürünü için yapılan bu değerlendirmeyi reddedip mağazadan kaldırmak istediğinize emin misiniz?
                </>
              )}
            </p>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
                Moderasyon Notu (Opsiyonel)
              </label>
              <input
                type="text"
                placeholder="Örn: Uygunsuz dil kullanımı veya onaylandı..."
                value={moderationNote}
                onChange={(e) => setModerationNote(e.target.value)}
                className={styles.searchBox}
                style={{ width: '100%', fontSize: 12, padding: '8px 10px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setModalAction(null)}
                disabled={actionLoading === modalAction.review.id}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                style={{
                  background: modalAction.action === 'APPROVE' ? '#059669' : 'var(--danger)',
                  borderColor: modalAction.action === 'APPROVE' ? '#059669' : 'var(--danger)',
                }}
                disabled={actionLoading === modalAction.review.id}
                onClick={handleConfirmModerate}
              >
                {actionLoading === modalAction.review.id
                  ? 'İşleniyor...'
                  : modalAction.action === 'APPROVE'
                  ? 'Onayla ve Yayınla'
                  : 'Reddet ve Gizle'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
