'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import AccountNav from '@/components/account/AccountNav'
import styles from '../Destek.module.css'
import hesapStyles from '../../Hesap.module.css'
import { SkeletonLines } from '@/components/common/Skeleton'

interface MessageItem {
  id: string
  authorName: string
  authorRole: 'CUSTOMER' | 'ADMIN' | 'SUPPORT'
  body: string
  createdAt: string
}

interface TicketDetail {
  id: string
  subject: string
  category: string
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
  priority: number
  orderNumber?: string | null
  createdAt: string
  updatedAt: string
  messages: MessageItem[]
}

function getStatusClass(status: TicketDetail['status']): string {
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
    case 'WAITING_CUSTOMER': return 'yanıtınız bekleniyor'
    case 'RESOLVED': return 'çözüldü'
    case 'CLOSED': return 'kapatıldı'
    default: return status.toLowerCase()
  }
}

export default function DestekDetayClient({ ticketId }: { ticketId: string }) {
  const { user, token, openAuthModal } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadTicket = () => {
    if (!token) return
    setLoading(true)
    fetch(`/api/support/tickets/${ticketId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.ticket) {
          setTicket(data.ticket)
        } else {
          setError(data.error || 'Destek talebi bulunamadı.')
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTicket()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ticketId])

  if (!mounted) return null

  if (!user) {
    return (
      <div className={hesapStyles.emptyState}>
        <h2 className={hesapStyles.emptyStateTitle}>giriş yapın</h2>
        <div className={hesapStyles.emptyActions}>
          <button className={hesapStyles.primaryCtaBtn} onClick={() => openAuthModal()}>
            giriş yap
          </button>
        </div>
      </div>
    )
  }

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !replyBody.trim()) return
    setSending(true)

    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: replyBody.trim() }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Mesaj gönderilemedi.')

      setReplyBody('')
      toast.success('Mesajınız iletildi.')
      loadTicket()
    } catch (err: any) {
      toast.error(err.message || 'Mesaj gönderilemedi.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)' }}>
            <Link
              href="/hesap/destek"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--zuu-blue)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}
            >
              ← tüm talepler
            </Link>
            <span style={{ color: 'var(--border)', fontFamily: 'var(--font-mono)' }}>/</span>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              #{ticketId.slice(-6).toUpperCase()}
            </span>
          </div>
          <h1 className={styles.pageTitle}>
            {ticket?.subject || 'talep detayı'}
          </h1>
          {ticket?.orderNumber && (
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              ilgili sipariş: #{ticket.orderNumber}
            </p>
          )}
        </div>

        {ticket && (
          <span className={`${styles.statusBadge} ${getStatusClass(ticket.status)}`}>
            {getStatusLabel(ticket.status)}
          </span>
        )}
      </div>

      {/* Grid: Sidebar Nav + Content */}
      <div className={styles.accountGrid}>
        <AccountNav />

        <main className={styles.mainContent}>
          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--error-bg)', color: 'var(--error)', borderRadius: 'var(--radius-xs)', marginBottom: 'var(--sp-4)', fontSize: 'var(--text-xs)' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div aria-busy="true" aria-label="Talep yükleniyor">
              <SkeletonLines lines={4} />
            </div>
          ) : ticket ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              {/* Messages */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                {ticket.messages.map((msg) => {
                  const isSupport = msg.authorRole !== 'CUSTOMER'
                  return (
                    <div
                      key={msg.id}
                      style={{
                        padding: 'var(--sp-4)',
                        borderRadius: 'var(--radius-xs)',
                        background: isSupport ? 'var(--success-bg)' : 'var(--surface-0)',
                        border: `1px solid ${isSupport ? 'rgba(26, 107, 60, 0.2)' : 'var(--border)'}`,
                        maxWidth: '85%',
                        alignSelf: isSupport ? 'flex-start' : 'flex-end',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-5)', marginBottom: 'var(--sp-2)', fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ fontWeight: 600, color: isSupport ? 'var(--success)' : 'var(--text-primary)' }}>
                          {isSupport ? 'zuulab destek ekibi' : 'siz'}
                        </span>
                        <time style={{ color: 'var(--text-muted)' }}>
                          {new Date(msg.createdAt).toLocaleString('tr-TR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </time>
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 'var(--leading-normal)', whiteSpace: 'pre-wrap' }}>
                        {msg.body}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Reply Form or Closed Notice */}
              {ticket.status !== 'CLOSED' ? (
                <form
                  onSubmit={handleSendReply}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-xs)',
                    padding: 'var(--sp-4)',
                    background: 'var(--surface-0)',
                    marginTop: 'var(--sp-2)',
                  }}
                >
                  <label
                    style={{ display: 'block', fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: 'var(--sp-2)', textTransform: 'lowercase' }}
                  >
                    yanıt yaz
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Mesajınızı buraya yazınız..."
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    className={styles.textarea}
                    style={{ marginBottom: 'var(--sp-3)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="submit"
                      disabled={sending || !replyBody.trim()}
                      className={styles.saveModalBtn}
                    >
                      {sending ? 'gönderiliyor...' : 'yanıtı gönder'}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ padding: 'var(--sp-4)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                  bu destek talebi kapatılmıştır. yeni bir sorunuz varsa lütfen yeni talep oluşturun.
                </div>
              )}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  )
}
