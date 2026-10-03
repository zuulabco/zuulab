'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { SkeletonRows } from '@/components/common/Skeleton'
import SortableList from '../../SortableList'
import styles from '../../admin.module.css'
import a from './Announcement.module.css'

interface AnnouncementItem {
  id: string
  text: string
  ctaLabel?: string
  ctaHref?: string
  active: boolean
  sortOrder: number
}

interface Draft {
  id?: string
  text: string
  ctaLabel: string
  ctaHref: string
  active: boolean
}

export default function AdminAnnouncementPage() {
  const { token, canFetch } = useAuthStore()
  const [items, setItems] = useState<AnnouncementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<AnnouncementItem | null>(null)

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const load = useCallback(() => {
    if (!canFetch) return
    fetch('/api/admin/cms/announcements', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setItems(d.announcements)
      })
      .catch(() => toast.error('Duyurular yüklenemedi.'))
      .finally(() => setLoading(false))
  }, [canFetch, token])

  useEffect(() => {
    load()
  }, [load])

  const call = async (method: string, body?: unknown, query = '') => {
    const res = await fetch(`/api/admin/cms/announcements${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const d = await res.json().catch(() => ({}))
    if (!d.success) throw new Error(d.error || 'İşlem başarısız.')
    if (Array.isArray(d.announcements)) setItems(d.announcements)
    return d
  }

  const reorder = async (next: AnnouncementItem[]) => {
    const previous = items
    setItems(next)
    try {
      await call('PATCH', { order: next.map((i) => i.id) })
      toast.success('Sıralama kaydedildi.')
    } catch (e) {
      setItems(previous)
      toast.error((e as Error).message)
    }
  }

  const toggle = async (item: AnnouncementItem) => {
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i)))
    try {
      await call('PUT', { id: item.id, active: !item.active })
    } catch (e) {
      toast.error((e as Error).message)
      load()
    }
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      await call(draft.id ? 'PUT' : 'POST', draft)
      toast.success(draft.id ? 'Duyuru güncellendi.' : 'Duyuru eklendi.')
      setDraft(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!deleting) return
    try {
      await call('DELETE', undefined, `?id=${encodeURIComponent(deleting.id)}`)
      toast.success('Duyuru silindi.')
      setDeleting(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const live = items.filter((i) => i.active)

  return (
    <div className={styles.pageContainer} style={{ maxWidth: 960 }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Duyuru bandı</h1>
          <p className={styles.pageSubtitle}>
            Sitenin en üstünde kayan kısa mesajlar. Değişiklikler hemen yayına girer; sırayı satırları sürükleyerek değiştirin.
          </p>
        </div>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setDraft({ text: '', ctaLabel: '', ctaHref: '', active: true })}
        >
          Duyuru ekle
        </button>
      </div>

      {/* What the bar looks like right now */}
      <div className={a.preview} aria-label="Önizleme">
        <span className={a.previewLabel}>Sitede görünüm</span>
        <div className={a.bar}>
          {live.length === 0 ? (
            <span className={a.barEmpty}>Açık duyuru yok; bant varsayılan mesajları gösterir.</span>
          ) : (
            live.map((i) => (
              <span key={i.id} className={a.barItem}>
                {i.text}
                {i.ctaLabel && <b>{i.ctaLabel} →</b>}
              </span>
            ))
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>Henüz duyuru yok.</div>
      ) : (
        <SortableList
          items={items}
          getId={(i) => i.id}
          getLabel={(i) => i.text}
          onReorder={reorder}
          renderItem={(item, index) => (
            <div className={`${a.row} ${item.active ? '' : a.rowOff}`}>
              <span className={a.index}>{index + 1}</span>
              <div className={a.rowText}>
                <span className={a.text}>{item.text}</span>
                {item.ctaLabel && (
                  <span className={a.cta}>
                    {item.ctaLabel} → {item.ctaHref}
                  </span>
                )}
              </div>
              <label className={a.switch} title={item.active ? 'Gizle' : 'Göster'}>
                <input type="checkbox" checked={item.active} onChange={() => toggle(item)} aria-label={`${item.text} görünsün`} />
                <span />
              </label>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                onClick={() =>
                  setDraft({ id: item.id, text: item.text, ctaLabel: item.ctaLabel ?? '', ctaHref: item.ctaHref ?? '', active: item.active })
                }
              >
                Düzenle
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => setDeleting(item)}>
                Sil
              </button>
            </div>
          )}
        />
      )}

      <Modal isOpen={Boolean(draft)} onClose={() => setDraft(null)} maxWidth="520px" ariaLabel="Duyuru">
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{draft.id ? 'Duyuruyu düzenle' : 'Yeni duyuru'}</h3>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="ann-text">Mesaj</label>
              <input
                id="ann-text"
                className={styles.formInput}
                maxLength={160}
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                placeholder="Örn: 750 ₺ ve üzeri siparişlerde kargo ücretsiz"
              />
              <span className={styles.formHelp}>{draft.text.length}/160</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="ann-cta">Bağlantı yazısı (isteğe bağlı)</label>
                <input id="ann-cta" className={styles.formInput} value={draft.ctaLabel} onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })} placeholder="incele" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="ann-href">Bağlantı</label>
                <input id="ann-href" className={styles.formInput} value={draft.ctaHref} onChange={(e) => setDraft({ ...draft, ctaHref: e.target.value })} placeholder="/koleksiyon/zuukids" />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Sitede göster
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setDraft(null)}>Vazgeç</button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving || draft.text.trim().length < 3}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} ariaLabel="Duyuruyu sil">
        {deleting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Duyuru silinsin mi?</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>&ldquo;{deleting.text}&rdquo; banttan kaldırılacak.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setDeleting(null)}>Vazgeç</button>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={remove}>Sil</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
