'use client'

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import Modal from '@/components/common/Modal'
import { toast } from '@/store/toastStore'
import styles from './ProductReviews.module.css'

interface Props {
  productId: string
  productName: string
  productSlug?: string
  rating?: number
  reviewCount?: number
}

interface ReviewData {
  id: string
  userId: string
  userName: string
  rating: number
  title: string | null
  body: string
  isVerifiedBuy: boolean
  createdAt: string
}

interface StatsData {
  averageRating: number
  totalCount: number
  breakdown: Record<number, number>
}

export default function ProductReviews({
  productId,
  productName,
  productSlug,
  rating: initialRating = 5,
  reviewCount: initialCount = 0,
}: Props) {
  const { user, token, openAuthModal } = useAuthStore()
  const slug = productSlug || productId

  const [reviews, setReviews] = useState<ReviewData[]>([])
  const [stats, setStats] = useState<StatsData>({
    averageRating: initialRating,
    totalCount: initialCount,
    breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  })
  const [loading, setLoading] = useState(true)

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [userRating, setUserRating] = useState(5)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // Escape key and scroll lock for review modal
  useEffect(() => {
    if (!modalOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalOpen(false)
      }
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [modalOpen])

  const fetchReviews = () => {
    fetch(`/api/products/${slug}/reviews`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setReviews(data.reviews || [])
          if (data.stats) {
            setStats(data.stats)
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchReviews()
  }, [slug])

  const handleOpenModal = () => {
    if (!user) {
      openAuthModal()
      return
    }
    setSubmitError(null)
    setSubmitted(false)
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      openAuthModal()
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch(`/api/products/${slug}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating: userRating,
          title: title.trim() || undefined,
          body: body.trim(),
        }),
      })

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Değerlendirme gönderilemedi.')
      }

      toast.success('Değerlendirmeniz alındı. Moderasyon sonrası yayına alınacaktır.')
      setModalOpen(false)
      setTitle('')
      setBody('')
    } catch (err: any) {
      const msg = err.message || 'Yorum gönderilirken bir hata oluştu.'
      setSubmitError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const currentAvg = stats.totalCount > 0 ? stats.averageRating : initialRating
  const currentCount = stats.totalCount > 0 ? stats.totalCount : initialCount

  return (
    <section id="reviews" className={styles.section} aria-label="Müşteri değerlendirmeleri">
      <div className={styles.header}>
        <div>
          <h3 className={styles.sectionTitle}>müşteri değerlendirmeleri</h3>
          <p className={styles.sectionSubtitle}>
            zuulab kullanıcılarının gerçek deneyimleri ve doğrulanmış değerlendirmeleri.
          </p>
        </div>
        <button
          type="button"
          className={styles.writeReviewBtn}
          onClick={handleOpenModal}
        >
          değerlendirme yaz
        </button>
      </div>

      {/* ── Rating Breakdown Card ──────────────────────── */}
      <div className={styles.ratingCard}>
        <div className={styles.scoreCol}>
          <div className={styles.bigScore}>{currentAvg.toFixed(1)}</div>
          <div className={styles.stars} aria-label={`Ortalama puan: ${currentAvg.toFixed(1)} / 5`}>
            {'★'.repeat(Math.round(currentAvg))}
            {'☆'.repeat(5 - Math.round(currentAvg))}
          </div>
          <p className={styles.totalReviewsCount}>
            {currentCount} değerlendirme üzerinden
          </p>
        </div>

        <div className={styles.barsCol}>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = stats.breakdown[star] || 0
            const percent = currentCount > 0 ? Math.round((count / currentCount) * 100) : 0
            return (
              <div key={star} className={styles.barRow}>
                <span className={styles.starLabel}>{star} yıldız</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className={styles.barPercent}>%{percent}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Reviews List ───────────────────────────────── */}
      <div className={styles.reviewsList}>
        {loading ? (
          <div className={styles.loadingState}>
            <span>değerlendirmeler yükleniyor…</span>
          </div>
        ) : reviews.length > 0 ? (
          reviews.map((rev) => (
            <article key={rev.id} className={styles.reviewItem}>
              <div className={styles.reviewHeader}>
                <div>
                  <div className={styles.reviewAuthorRow}>
                    <strong className={styles.authorName}>{rev.userName.toLowerCase()}</strong>
                    {rev.isVerifiedBuy && (
                      <span className={styles.verifiedBadge}>
                        ✓ doğrulanmış alıcı
                      </span>
                    )}
                  </div>
                  <div className={styles.starsSmall} aria-label={`Puan: ${rev.rating} / 5`}>
                    {'★'.repeat(rev.rating)}
                    {'☆'.repeat(5 - rev.rating)}
                  </div>
                </div>
                <time className={styles.reviewDate}>
                  {new Date(rev.createdAt).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
              </div>

              {rev.title && <h4 className={styles.reviewTitle}>{rev.title.toLowerCase()}</h4>}
              <p className={styles.reviewBody}>{rev.body}</p>
            </article>
          ))
        ) : (
          /* ── Subtle Animal Touch in Empty Reviews State ── */
          <div className={styles.emptyReviews}>
            <div className={styles.mascotIconWrap}>
              <ZuuMascotIcon />
            </div>
            <h4 className={styles.emptyTitle}>bu tasarım için henüz bir değerlendirme yazılmadı</h4>
            <p className={styles.emptyDesc}>
              atölyeden çıkan bu parçayı ilk deneyimleyen siz olun ve izlenimlerinizi paylaşın.
            </p>
            <button
              type="button"
              className={styles.emptyWriteBtn}
              onClick={handleOpenModal}
            >
              ilk değerlendirmeyi yaz
            </button>
          </div>
        )}
      </div>

      {/* ── Review Submission Modal ────────────────────── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="520px"
        ariaLabel="Ürünü Değerlendir"
      >
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>ürünü değerlendir</h3>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <p className={styles.formProductName}>{productName.toLowerCase()}</p>

          {submitError && (
            <div className={styles.submitError}>
              {submitError}
            </div>
          )}

          {/* Rating Stars Selector */}
          <div className={styles.formGroup}>
            <label className={styles.label}>puanınız</label>
            <div className={styles.starPicker}>
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${styles.starPickBtn} ${s <= userRating ? styles.starPickActive : ''}`}
                  onClick={() => setUserRating(s)}
                  aria-label={`${s} yıldız`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>başlık (isteğe bağlı)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="deneyiminizi özetleyen bir başlık…"
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>yorumunuz *</label>
            <textarea
              required
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="baskı kalitesi, detay hassasiyeti ve genel memnuniyetiniz…"
              className={styles.textarea}
            />
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setModalOpen(false)}
            >
              vazgeç
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={styles.submitBtn}
            >
              {submitting ? 'gönderiliyor…' : 'gönder'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}

function ZuuMascotIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="16" cy="14" r="5" />
      <circle cx="32" cy="14" r="5" />
      <circle cx="24" cy="26" r="14" />
      <circle cx="20" cy="24" r="1.5" fill="currentColor" />
      <circle cx="28" cy="24" r="1.5" fill="currentColor" />
      <path d="M22 28.5c1 .8 3 .8 4 0" />
      <path d="M24 26v1.5" />
    </svg>
  )
}
