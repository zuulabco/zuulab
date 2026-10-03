'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { SkeletonRows } from '@/components/common/Skeleton'
import styles from '../../admin.module.css'

interface MaterialRow {
  id: string
  name: string
  description: string | null
  productCount: number
}

export default function AdminProductMaterialsPage() {
  const { token, canFetch } = useAuthStore()
  const [rows, setRows] = useState<MaterialRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<MaterialRow | null>(null)
  const [deleting, setDeleting] = useState<MaterialRow | null>(null)

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const load = useCallback(() => {
    if (!canFetch) return
    fetch('/api/admin/product-materials', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRows(d.materials)
        else toast.error(d.error || 'Malzemeler alınamadı.')
      })
      .catch(() => toast.error('Malzemeler alınamadı.'))
      .finally(() => setLoading(false))
  }, [canFetch, token])

  useEffect(() => {
    load()
  }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return
    setSaving(true)
    const res = await fetch('/api/admin/product-materials', { method: 'POST', headers, body: JSON.stringify({ name, description }) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!d.success) return toast.error(d.error || 'Malzeme eklenemedi.')
    toast.success(`'${d.material.name}' eklendi.`)
    setName('')
    setDescription('')
    load()
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    const res = await fetch(`/api/admin/product-materials/${editing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: editing.name, description: editing.description }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!d.success) return toast.error(d.error || 'Kaydedilemedi.')
    toast.success('Malzeme güncellendi.')
    setEditing(null)
    load()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setSaving(true)
    const res = await fetch(`/api/admin/product-materials/${deleting.id}`, { method: 'DELETE', headers })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!d.success) return toast.error(d.error || 'Silinemedi.')
    toast.success('Malzeme silindi.')
    setDeleting(null)
    load()
  }

  return (
    <div className={styles.pageContainer} style={{ maxWidth: 960 }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Malzemeler</h1>
          <p className={styles.pageSubtitle}>
            Ürün formundaki malzeme listesi. Bir malzemenin adını değiştirirseniz onu kullanan tüm ürünlerde de değişir.
          </p>
        </div>
      </div>

      <form onSubmit={create} className={styles.formCard} style={{ marginBottom: 20 }}>
        <h2 className={styles.formCardTitle}>Yeni malzeme</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'end' }}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="mat-name">Ad</label>
            <input id="mat-name" className={styles.formInput} placeholder="Örn: PETG" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="mat-desc">Açıklama (isteğe bağlı)</label>
            <input id="mat-desc" className={styles.formInput} placeholder="Örn: Isıya dayanıklı, mat yüzey" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving || name.trim().length < 2}>
            Ekle
          </button>
        </div>
      </form>

      <div className={styles.tableWrapper}>
        {loading ? (
          <div style={{ padding: 16 }}>
            <SkeletonRows rows={4} />
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.emptyState}>Henüz malzeme yok. Yukarıdan ekleyin.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Malzeme</th>
                <th>Açıklama</th>
                <th style={{ textAlign: 'right' }}>Ürün sayısı</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{m.description || '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.productCount}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => setEditing({ ...m })}>
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                      style={{ color: 'var(--error)' }}
                      onClick={() => setDeleting(m)}
                      disabled={m.productCount > 0}
                      title={m.productCount > 0 ? 'Bu malzemeyi kullanan ürünler var' : undefined}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} ariaLabel="Malzemeyi düzenle">
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Malzemeyi düzenle</h3>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="edit-mat-name">Ad</label>
              <input id="edit-mat-name" className={styles.formInput} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              {editing.productCount > 0 && (
                <span className={styles.formHelp}>Ad değişirse {editing.productCount} üründe de güncellenir.</span>
              )}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="edit-mat-desc">Açıklama</label>
              <input id="edit-mat-desc" className={styles.formInput} value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setEditing(null)}>Vazgeç</button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveEdit} disabled={saving}>Kaydet</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} ariaLabel="Malzemeyi sil">
        {deleting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>&ldquo;{deleting.name}&rdquo; silinsin mi?</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Malzeme listeden kaldırılır. Bu işlem geri alınamaz.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setDeleting(null)}>Vazgeç</button>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={confirmDelete} disabled={saving}>Sil</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
