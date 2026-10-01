'use client'

import React, { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import styles from '../../admin.module.css'

interface AnnouncementItem {
  id: string
  text: string
  ctaLabel?: string
  ctaHref?: string
  active: boolean
  sortOrder: number
}

export default function AdminAnnouncementPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [items, setItems] = useState<AnnouncementItem[]>([])
  const [loading, setLoading] = useState(true)

  // Edit / Create Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<AnnouncementItem | null>(null)
  const [text, setText] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaHref, setCtaHref] = useState('')
  const [active, setActive] = useState(true)
  const [sortOrder, setSortOrder] = useState<number>(1)
  const [submitting, setSubmitting] = useState(false)

  // Delete Confirmation Modal
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadAnnouncements = () => {
    if (!canFetch) return
    setLoading(true)

    fetch('/api/admin/cms/announcements', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.announcements)) {
          setItems(data.announcements)
        }
      })
      .catch(() => addToast('Duyuru verileri yüklenemedi.', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadAnnouncements()
  }, [token, canFetch, canFetch])

  const openCreate = () => {
    setEditingItem(null)
    setText('')
    setCtaLabel('')
    setCtaHref('')
    setActive(true)
    setSortOrder(items.length + 1)
    setIsModalOpen(true)
  }

  const openEdit = (item: AnnouncementItem) => {
    setEditingItem(item)
    setText(item.text)
    setCtaLabel(item.ctaLabel || '')
    setCtaHref(item.ctaHref || '')
    setActive(item.active)
    setSortOrder(item.sortOrder)
    setIsModalOpen(true)
  }

  const handleToggle = async (item: AnnouncementItem) => {
    if (!canFetch) return
    try {
      const res = await fetch('/api/admin/cms/announcements', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: item.id, active: !item.active }),
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Duyuru ${!item.active ? 'yayına alındı' : 'arşive çekildi'}.`, 'success')
        loadAnnouncements()
      } else {
        addToast(data.error || 'İşlem başarısız oldu.', 'error')
      }
    } catch {
      addToast('Sunucu bağlantısı sağlanamadı.', 'error')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId || !canFetch) return
    setIsDeleting(true)

    try {
      const res = await fetch(`/api/admin/cms/announcements?id=${deleteTargetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        addToast('Duyuru başarıyla silindi.', 'success')
        setDeleteTargetId(null)
        loadAnnouncements()
      } else {
        addToast(data.error || 'Silme işlemi başarısız.', 'error')
      }
    } catch {
      addToast('Sunucu bağlantı hatası oluştu.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canFetch || !text.trim()) return

    setSubmitting(true)
    try {
      const method = editingItem ? 'PUT' : 'POST'
      const body: any = {
        text: text.trim().toLowerCase(),
        ctaLabel: ctaLabel.trim().toLowerCase() || undefined,
        ctaHref: ctaHref.trim() || undefined,
        active,
        sortOrder: Number(sortOrder),
      }
      if (editingItem) body.id = editingItem.id

      const res = await fetch('/api/admin/cms/announcements', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (data.success) {
        addToast(editingItem ? 'Duyuru bandı güncellendi.' : 'Yeni duyuru bandı oluşturuldu.', 'success')
        setIsModalOpen(false)
        loadAnnouncements()
      } else {
        addToast(data.error || 'Kaydetme işlemi başarısız.', 'error')
      }
    } catch {
      addToast('Sunucu bağlantı hatası oluştu.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Duyuru Bandı Yönetimi (Ticker Bar)</h1>
          <p className={styles.subtitle}>
            Mağaza vitrininin en üstünde dönen kampanya, ücretsiz kargo fırsatları ve marka duyurularını yönetin.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className={styles.primaryButton}
        >
          + Yeni Duyuru Ekle
        </button>
      </div>

      {/* ── TABLE CARD ──────────────────────────────────────────────────────── */}
      <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>Sıra</th>
                <th>Duyuru Metni</th>
                <th>Aksiyon / Yönlendirme</th>
                <th>Durum</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Duyurular yükleniyor...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Henüz eklenmiş bir duyuru bandı içeriği bulunmuyor.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      #{item.sortOrder}
                    </td>
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      {item.text}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {item.ctaLabel ? (
                        <span>
                          <strong>{item.ctaLabel}</strong> &rarr; <span style={{ fontFamily: 'var(--font-mono)' }}>{item.ctaHref || '—'}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          item.active ? styles.badgeSuccess : styles.badgeNeutral
                        }`}
                      >
                        {item.active ? 'YAYINDA' : 'PASİF'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => handleToggle(item)}
                          className={styles.secondaryButton}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          {item.active ? 'Gizle' : 'Göster'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className={styles.secondaryButton}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(item.id)}
                          className={styles.secondaryButton}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#ef4444' }}
                        >
                          Sil
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

      {/* ── CREATE / EDIT MODAL (UI-16 GLOBAL MODAL) ────────────────────────── */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => !submitting && setIsModalOpen(false)}
          ariaLabel="Duyuru Bandı Düzenleme Modalı"
          maxWidth={480}
        >
          <div style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              {editingItem ? 'Duyuru Bandını Düzenle' : 'Yeni Duyuru Bandı Ekle'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Storefront üst bandında döngüsel olarak gösterilen metin ve bağlantı ayarları.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className={styles.label}>
                  Duyuru Metni *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: 750 ₺ ve üzeri tüm siparişlerde ücretsiz kargo"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className={styles.label}>
                    Buton Metni (İsteğe Bağlı)
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: İncele"
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div>
                  <label className={styles.label}>
                    Hedef URL / Link
                  </label>
                  <input
                    type="text"
                    placeholder="/koleksiyon/zuukids"
                    value={ctaHref}
                    onChange={(e) => setCtaHref(e.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', alignItems: 'center' }}>
                <div>
                  <label className={styles.label}>
                    Sıra Numarası
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                    className={styles.input}
                  />
                </div>

                <div style={{ paddingTop: '1.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                    />
                    <span>Hemen Yayına Al</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className={styles.secondaryButton}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={styles.primaryButton}
                >
                  {submitting ? 'Kaydediliyor...' : editingItem ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ── DELETE CONFIRMATION MODAL (UI-16 GLOBAL MODAL) ──────────────────── */}
      {deleteTargetId && (
        <Modal
          isOpen={Boolean(deleteTargetId)}
          onClose={() => !isDeleting && setDeleteTargetId(null)}
          ariaLabel="Duyuru Silme Onayı"
          maxWidth={420}
        >
          <div style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Duyuruyu Sil
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Bu duyuru bandı mesajını kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                disabled={isDeleting}
                className={styles.secondaryButton}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className={styles.dangerButton}
                style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
              >
                {isDeleting ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
