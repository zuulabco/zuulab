'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { getSupportStatusConfig } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'
import { SkeletonList } from '@/components/common/Skeleton'

interface MessageItem {
  id: string
  authorName: string
  authorRole: 'CUSTOMER' | 'ADMIN' | 'SUPPORT'
  body: string
  isInternal: boolean
  createdAt: string
}

interface TicketItem {
  id: string
  userId: string
  userName: string
  userEmail: string
  orderId: string | null
  orderNumber?: string | null
  category: string
  subject: string
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
  priority: number
  createdAt: string
  updatedAt: string
  messages?: MessageItem[]
}

const CATEGORIES: Record<string, string> = {
  ORDER: 'Sipariş',
  SHIPPING: 'Kargo & Teslimat',
  RETURN: 'İade & Değişim',
  PRODUCT: 'Ürün & Stok',
  PAYMENT: 'Ödeme & Fatura',
  GENERAL: 'Genel Destek',
}

export default function AdminSupportPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)
  const [ticketDetailsLoading, setTicketDetailsLoading] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)

  // Status Change Modal State
  const [statusToChange, setStatusToChange] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadTickets = (selectIdAfterLoad?: string) => {
    if (!canFetch) return
    setLoading(true)

    const url = statusFilter === 'ALL'
      ? '/api/admin/support'
      : `/api/admin/support?status=${statusFilter}`

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tickets)) {
          setTickets(data.tickets)
          if (selectIdAfterLoad) {
            selectTicket(selectIdAfterLoad)
          } else if (!selectedTicket && data.tickets.length > 0) {
            // Automatically select first ticket on desktop
            selectTicket(data.tickets[0].id)
          }
        }
      })
      .catch((err) => {
        console.error(err)
        addToast('Destek talepleri listelenirken hata oluştu.', 'error')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTickets()
  }, [token, canFetch, statusFilter])

  const selectTicket = (id: string) => {
    if (!canFetch) return
    setTicketDetailsLoading(true)
    fetch(`/api/admin/support/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.ticket) {
          setSelectedTicket(data.ticket)
        }
      })
      .catch((err) => {
        console.error(err)
        addToast('Talep detayı yüklenemedi.', 'error')
      })
      .finally(() => setTicketDetailsLoading(false))
  }

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch || !selectedTicket || !replyBody.trim()) return
    setSendingReply(true)

    try {
      const res = await fetch(`/api/admin/support/${selectedTicket.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          body: replyBody.trim(),
          isInternal,
        }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      addToast(
        isInternal ? 'Dahili yönetici notu eklendi.' : 'Yanıt müşteriye iletildi.',
        'success'
      )

      setReplyBody('')
      setIsInternal(false)
      selectTicket(selectedTicket.id)
      loadTickets(selectedTicket.id)
    } catch (err: any) {
      addToast(err.message || 'Yanıt gönderilemedi.', 'error')
    } finally {
      setSendingReply(false)
    }
  }

  const handleUpdateStatus = async (status: string) => {
    if (!canFetch || !selectedTicket) return
    try {
      const res = await fetch(`/api/admin/support/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      const cfg = getSupportStatusConfig(status)
      addToast(`Talep durumu "${cfg.label}" olarak güncellendi.`, 'success')
      setStatusToChange(null)
      selectTicket(selectedTicket.id)
      loadTickets(selectedTicket.id)
    } catch (err: any) {
      addToast(err.message || 'Durum güncellenemedi.', 'error')
    }
  }

  const handleDelete = async () => {
    if (!canFetch || !selectedTicket) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/support/${selectedTicket.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      addToast('Destek talebi silindi.', 'success')
      const deletedId = selectedTicket.id
      setDeleteOpen(false)
      setSelectedTicket(null)
      setTickets((list) => list.filter((t) => t.id !== deletedId))
    } catch (err: any) {
      addToast(err.message || 'Talep silinemedi.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    if (!searchTerm.trim()) return tickets
    const q = searchTerm.toLowerCase()
    return tickets.filter(
      (t) =>
        t.subject?.toLowerCase().includes(q) ||
        t.userName?.toLowerCase().includes(q) ||
        t.userEmail?.toLowerCase().includes(q) ||
        t.id?.toLowerCase().includes(q) ||
        (t.orderId && t.orderId.toLowerCase().includes(q))
    )
  }, [tickets, searchTerm])

  // Computed metrics
  const metrics = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((t) => t.status === 'OPEN').length
    const inProgress = tickets.filter((t) => t.status === 'IN_PROGRESS').length
    const waitingCustomer = tickets.filter((t) => t.status === 'WAITING_CUSTOMER').length
    const resolved = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length
    return { total, open, inProgress, waitingCustomer, resolved }
  }, [tickets])

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Müşteri Destek Masası</h1>
          <p className={styles.subtitle}>
            Kullanıcı sorularını, sipariş ve iade taleplerini yanıtlayın ve müşteri memnuniyetini yönetin.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => loadTickets(selectedTicket?.id)}
            disabled={loading}
          >
            Yenile
          </button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Toplam Talep</div>
          <div className={styles.metricValue}>{metrics.total}</div>
          <div className={styles.metricSub}>Tüm destek kayıtları</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Yeni / Açık</div>
          <div className={styles.metricValue} style={{ color: metrics.open > 0 ? 'var(--warning)' : 'inherit' }}>
            {metrics.open}
          </div>
          <div className={styles.metricSub}>Yanıt bekleyen yeni talepler</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>İnceleniyor</div>
          <div className={styles.metricValue} style={{ color: 'var(--zuu-blue, #0284c7)' }}>
            {metrics.inProgress}
          </div>
          <div className={styles.metricSub}>Temsilci incelemesindeki talepler</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Müşteri Yanıtı Beklenen</div>
          <div className={styles.metricValue}>{metrics.waitingCustomer}</div>
          <div className={styles.metricSub}>Ek bilgi talep edilenler</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Çözüldü & Kapatıldı</div>
          <div className={styles.metricValue} style={{ color: 'var(--success)' }}>
            {metrics.resolved}
          </div>
          <div className={styles.metricSub}>Sonuçlandırılan talepler</div>
        </div>
      </div>

      {/* Search & Quick Filters */}
      <div className={styles.filterBar}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'ALL', label: 'Tümü' },
            { key: 'OPEN', label: `Açık (${metrics.open})` },
            { key: 'IN_PROGRESS', label: 'İnceleniyor' },
            { key: 'WAITING_CUSTOMER', label: 'Müşteri Yanıtı Beklenen' },
            { key: 'RESOLVED', label: 'Çözüldü' },
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
          placeholder="Konu, müşteri adı veya e-posta ara..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchBox}
          style={{ width: 280 }}
        />
      </div>

      {/* Split-pane Inbox UX: Left Ticket Queue, Right Active Thread */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) minmax(400px, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* Left: Tickets Queue List */}
        <div className={styles.cardPanel} style={{ maxHeight: '720px', overflowY: 'auto' }}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Talep Listesi ({filteredTickets.length})</span>
          </div>

          {loading ? (
            <SkeletonList rows={5} />
          ) : filteredTickets.length === 0 ? (
            <div className={styles.emptyState}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                Destek talebi bulunamadı.
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Seçilen kriterde listelenecek bir talep yok.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredTickets.map((t) => {
                const statusCfg = getSupportStatusConfig(t.status)
                const isSelected = selectedTicket?.id === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => selectTicket(t.id)}
                    style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--surface-1)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--zuu-blue, #0284c7)' : '3px solid transparent',
                      transition: 'background var(--dur-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span className={`${styles.badge} ${statusCfg.badgeClass}`}>
                        {statusCfg.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(t.updatedAt).toLocaleDateString('tr-TR')}
                      </span>
                    </div>

                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.3 }}>
                      {t.subject}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.userName || 'Misafir'}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {CATEGORIES[t.category] || t.category}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Active Ticket Details & Messaging Thread */}
        <div className={styles.cardPanel} style={{ minHeight: '620px', display: 'flex', flexDirection: 'column' }}>
          {ticketDetailsLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Talep detayları yükleniyor...
            </div>
          ) : selectedTicket ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
              {/* Ticket Topbar Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                        #{selectedTicket.id.slice(0, 8)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {CATEGORIES[selectedTicket.category] || selectedTicket.category}
                      </span>
                    </div>

                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {selectedTicket.subject}
                    </h2>

                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span>
                        Müşteri:{' '}
                        {selectedTicket.userId ? (
                          <Link
                            href={`/admin/customers/${selectedTicket.userId}`}
                            style={{ color: 'var(--zuu-blue)', textDecoration: 'none', fontWeight: 600 }}
                          >
                            {selectedTicket.userName} ↗
                          </Link>
                        ) : (
                          <strong>{selectedTicket.userName}</strong>
                        )}
                        <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({selectedTicket.userEmail})</span>
                      </span>

                      {selectedTicket.orderId && (
                        <span>
                          Sipariş:{' '}
                          <Link
                            href={`/admin/orders/${selectedTicket.orderNumber || selectedTicket.orderId}`}
                            style={{ color: 'var(--zuu-blue)', textDecoration: 'none', fontWeight: 600, fontFamily: 'var(--font-mono)' }}
                          >
                            #{selectedTicket.orderNumber || selectedTicket.orderId.slice(0, 8)} ↗
                          </Link>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Dropdown */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
                      Talep Durumu
                    </label>
                    <select
                      value={selectedTicket.status}
                      onChange={(e) => {
                        const nextStatus = e.target.value
                        if (nextStatus === 'RESOLVED' || nextStatus === 'CLOSED') {
                          setStatusToChange(nextStatus)
                        } else {
                          handleUpdateStatus(nextStatus)
                        }
                      }}
                      className={styles.searchBox}
                      style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                      <option value="OPEN">Açık</option>
                      <option value="IN_PROGRESS">İnceleniyor</option>
                      <option value="WAITING_CUSTOMER">Müşteri Yanıtı Bekleniyor</option>
                      <option value="RESOLVED">Çözüldü</option>
                      <option value="CLOSED">Kapatıldı</option>
                    </select>
                    <button
                      type="button"
                      className={`${styles.dangerButton} ${styles.btnSm}`}
                      style={{ marginTop: 8, width: '100%' }}
                      onClick={() => setDeleteOpen(true)}
                    >
                      Talebi sil
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages Scroll Area */}
              <div
                style={{
                  flex: 1,
                  maxHeight: '440px',
                  overflowY: 'auto',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  background: 'var(--surface-0)',
                }}
              >
                {selectedTicket.messages && selectedTicket.messages.length > 0 ? (
                  selectedTicket.messages.map((msg) => {
                    const isInternalNote = msg.isInternal
                    const isSupport = msg.authorRole !== 'CUSTOMER'

                    return (
                      <div
                        key={msg.id}
                        style={{
                          padding: '12px 16px',
                          borderRadius: 6,
                          background: isInternalNote
                            ? '#fffbeb'
                            : isSupport
                            ? 'var(--surface-1)'
                            : 'var(--surface-0)',
                          border: isInternalNote
                            ? '1px solid #fde68a'
                            : isSupport
                            ? '1px solid var(--border)'
                            : '1px solid var(--border)',
                          alignSelf: isSupport ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          minWidth: '280px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11 }}>
                          <span
                            style={{
                              fontWeight: 600,
                              color: isInternalNote ? '#b45309' : isSupport ? 'var(--zuu-blue, #0284c7)' : 'var(--text-primary)',
                            }}
                          >
                            {isInternalNote
                              ? 'Dahili Yönetici Notu (Gizli)'
                              : isSupport
                              ? 'ZUULAB Destek Ekibi'
                              : `${msg.authorName || 'Müşteri'}`}
                          </span>
                          <time style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {new Date(msg.createdAt).toLocaleString('tr-TR')}
                          </time>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {msg.body}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                    Bu talep için henüz bir mesaj akışı bulunmuyor.
                  </div>
                )}
              </div>

              {/* Reply Composer Form */}
              <form onSubmit={handleSendReply} style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                <textarea
                  required
                  rows={3}
                  placeholder={isInternal ? 'Sadece yöneticilerin göreceği dahili operasyonel not yazın...' : 'Müşteriye gönderilecek resmi yanıtınızı yazın...'}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  className={styles.searchBox}
                  style={{
                    width: '100%',
                    fontSize: 13,
                    padding: '10px 12px',
                    marginBottom: 10,
                    resize: 'vertical',
                    background: 'var(--surface-0)',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      color: isInternal ? '#b45309' : 'var(--text-muted)',
                      fontWeight: isInternal ? 600 : 400,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                    />
                    Bu bir dahili nottur (Müşteri görmez)
                  </label>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="submit"
                      disabled={sendingReply || !replyBody.trim()}
                      className={styles.primaryBtn}
                      style={{
                        fontSize: 12,
                        background: isInternal ? '#d97706' : undefined,
                        borderColor: isInternal ? '#d97706' : undefined,
                      }}
                    >
                      {sendingReply ? 'Gönderiliyor...' : isInternal ? 'Notu Kaydet' : 'Müşteriye Gönder'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <div className={styles.emptyState} style={{ margin: 'auto', padding: 48 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Destek Talebi Seçilmedi
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Detayları ve mesaj akışını görüntülemek için sol listeden bir talep seçin.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Resolving or Closing Ticket */}
      {statusToChange && (
        <Modal
          isOpen={!!statusToChange}
          onClose={() => setStatusToChange(null)}
          ariaLabel={`Destek Talebini ${statusToChange === 'RESOLVED' ? 'Çözüldü' : 'Kapatıldı'} Olarak İşaretle`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Destek Talebini {statusToChange === 'RESOLVED' ? 'Çözüldü' : 'Kapatıldı'} Olarak İşaretle
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Bu talebin durumunu <strong>{statusToChange === 'RESOLVED' ? 'ÇÖZÜLDÜ' : 'KAPATILDI'}</strong> olarak güncellemek üzeresiniz. Müşteri bu talebe artık yazamaz; yeni bir sorusu olursa yeni talep açar.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setStatusToChange(null)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => handleUpdateStatus(statusToChange)}
              >
                Onayla ve Güncelle
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteOpen && selectedTicket && (
        <Modal isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} ariaLabel="Destek talebini sil">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Destek talebini sil
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              <strong>&ldquo;{selectedTicket.subject}&rdquo;</strong> talebi ve tüm mesajları kalıcı olarak silinecek.
              Müşteri de bu talebi hesabında göremeyecek. Bu işlem geri alınamaz.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Vazgeç
              </button>
              <button type="button" className={styles.dangerButton} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Siliniyor…' : 'Kalıcı olarak sil'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
