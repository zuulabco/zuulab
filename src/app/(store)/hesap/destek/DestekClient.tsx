'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import AccountNav from '@/components/account/AccountNav'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import styles from './Destek.module.css'
import hesapStyles from '../Hesap.module.css'
import { SkeletonList } from '@/components/common/Skeleton'

interface TicketItem {
  id: string
  subject: string
  category: string
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
  priority: number
  orderId?: string | null
  createdAt: string
  updatedAt: string
}

interface OrderOption {
  id: string
  orderNumber: string
}

const CATEGORIES = [
  { value: 'ORDER', label: 'Sipariş Durumu' },
  { value: 'SHIPPING', label: 'Kargo & Teslimat' },
  { value: 'RETURN', label: 'İade & Değişim' },
  { value: 'PRODUCT', label: 'Ürün & Model Soruları' },
  { value: 'PAYMENT', label: 'Ödeme & Fatura' },
  { value: 'GENERAL', label: 'Genel Bilgi' },
]

function getStatusClass(status: TicketItem['status']): string {
  switch (status) {
    case 'OPEN': return styles.statusOpen
    case 'IN_PROGRESS': return styles.statusOpen
    case 'WAITING_CUSTOMER': return styles.statusWaiting
    case 'RESOLVED': return styles.statusResolved
    case 'CLOSED': return styles.statusClosed
    default: return styles.statusClosed
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'OPEN': return 'açık'
    case 'IN_PROGRESS': return 'inceleniyor'
    case 'WAITING_CUSTOMER': return 'yanıt bekleniyor'
    case 'RESOLVED': return 'çözüldü'
    case 'CLOSED': return 'kapatıldı'
    default: return status.toLowerCase()
  }
}

export default function DestekClient() {
  const { user, token, openAuthModal } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [orders, setOrders] = useState<OrderOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Arriving from a closed ticket's "yeni talep oluşturun" link opens the form directly
  // (the page renders nothing until mounted, so reading the URL here is safe)
  const [modalOpen, setModalOpen] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('yeni') === '1'
  )
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('ORDER')
  const [orderId, setOrderId] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadTickets = () => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetch('/api/support/tickets', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tickets)) {
          setTickets(data.tickets)
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))

    fetch('/api/orders', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.orders)) {
          setOrders(data.orders.map((o: any) => ({ id: o.id, orderNumber: o.orderNumber })))
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadTickets()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Keep statuses current: re-check every 30s while visible and on returning to the tab
  useEffect(() => {
    if (!token) return
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/api/support/tickets', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.tickets)) setTickets(data.tickets)
        })
        .catch(() => {})
    }
    const timer = setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [token])

  if (!mounted) return null

  if (!user) {
    return (
      <div className={hesapStyles.emptyState}>
        <div className={hesapStyles.emptyMascotWrap}>
          <ZuuMascotIcon size={28} />
        </div>
        <h2 className={hesapStyles.emptyStateTitle}>giriş yapın</h2>
        <p className={hesapStyles.emptyStateDesc}>
          Destek taleplerinizi görüntülemek ve yeni talep oluşturmak için lütfen giriş yapın.
        </p>
        <div className={hesapStyles.emptyActions}>
          <button className={hesapStyles.primaryCtaBtn} onClick={() => openAuthModal()}>
            giriş yap / kayıt ol
          </button>
        </div>
      </div>
    )
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          message: message.trim(),
          orderId: orderId || null,
        }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Talep oluşturulamadı.')

      toast.success('Destek talebiniz başarıyla oluşturuldu.')
      setModalOpen(false)
      setSubject('')
      setMessage('')
      setOrderId('')
      loadTickets()
    } catch (err: any) {
      toast.error(err.message || 'Talep oluşturulamadı.')
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openCount = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'WAITING_CUSTOMER').length

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>hesap / destek</span>
          <h1 className={styles.pageTitle}>destek taleplerim</h1>
        </div>
        <button
          className={styles.newTicketBtn}
          onClick={() => {
            setError(null)
            setModalOpen(true)
          }}
        >
          + yeni talep
        </button>
      </div>

      {/* Grid: Sidebar Nav + Content */}
      <div className={styles.accountGrid}>
        <AccountNav ticketCount={openCount} />

        <main className={styles.mainContent}>
          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--error-bg)', color: 'var(--error)', borderRadius: 'var(--radius-xs)', marginBottom: 'var(--sp-4)', fontSize: 'var(--text-xs)' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div aria-busy="true" aria-label="Talepler yükleniyor">
              <SkeletonList rows={3} />
            </div>
          ) : tickets.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyMascotWrap}>
                <ZuuMascotIcon size={28} />
              </div>
              <h3 className={styles.emptyTitle}>aktif destek talebiniz yok</h3>
              <p className={styles.emptyDesc}>
                Herhangi bir konuda yardım almak veya siparişinizi bildirmek için yeni talep oluşturabilirsiniz.
              </p>
              <button className={styles.newTicketBtn} onClick={() => setModalOpen(true)}>
                ilk talebinizi oluşturun
              </button>
            </div>
          ) : (
            <div className={styles.ticketList}>
              {tickets.map((tck) => (
                <Link
                  key={tck.id}
                  href={`/hesap/destek/${tck.id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className={styles.ticketRow}>
                    <div className={styles.ticketRowHeader}>
                      <span className={`${styles.statusBadge} ${getStatusClass(tck.status)}`}>
                        {getStatusLabel(tck.status)}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(tck.updatedAt).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                    <div className={styles.ticketMetaRow}>
                      <span className={styles.ticketSubject}>{tck.subject}</span>
                      <span className={styles.categoryTag}>
                        {CATEGORIES.find((c) => c.value === tck.category)?.label || tck.category}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      #{tck.id.slice(-6).toUpperCase()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* New Ticket Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="540px"
        ariaLabel="Yeni Destek Talebi"
      >
        <div className={styles.modalHeader} style={{ marginBottom: 'var(--sp-4)' }}>
          <h3 className={styles.modalTitle} style={{ margin: 0 }}>yeni destek talebi</h3>
        </div>

        <form onSubmit={handleCreate} className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>kategori *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={styles.select}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {orders.length > 0 && (
            <div className={styles.formGroup}>
              <label className={styles.label}>ilgili sipariş (opsiyonel)</label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className={styles.select}
              >
                <option value="">Sipariş Seçilmedi (Genel Konu)</option>
                {orders.map((ord) => (
                  <option key={ord.id} value={ord.id}>
                    {ord.orderNumber}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>konu başlığı *</label>
            <input
              type="text"
              required
              placeholder="Örn: Siparişim kargoya verildi mi?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>mesajınız *</label>
            <textarea
              required
              rows={4}
              placeholder="Talebinizi detaylı olarak açıklayınız..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={styles.textarea}
            />
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className={styles.cancelModalBtn}
            >
              iptal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={styles.saveModalBtn}
            >
              {submitting ? 'gönderiliyor...' : 'talebi oluştur'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
