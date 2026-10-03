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
  care: string | null
  productCount: number
}

export default function AdminProductMaterialsPage() {
  const { token, canFetch } = useAuthStore()
  const [rows, setRows] = useState<MaterialRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [care, setCare] = useState('')
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
    const res = await fetch('/api/admin/product-materials', { method: 'POST', headers, body: JSON.stringify({ name, description, care }) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!d.success) return toast.error(d.error || 'Malzeme eklenemedi.')
    toast.success(`'${d.material.name}' eklendi.`)
    setName('')
    setDescription('')
    setCare('')
    load()
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    const res = await fetch(`/api/admin/product-materials/${editing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: editing.name, description: editing.description, care: editing.care }),
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
            Ürün formundaki malzeme listesi ve ürün sayfasındaki &ldquo;malzeme ve üretim&rdquo; metinleri. Bir malzemenin adını değiştirirseniz onu kullanan tüm ürünlerde de değişir.
          </p>
        </div>
      </div>

      <form onSubmit={create} className={styles.formCard} style={{ marginBottom: 20 }}>
        <h2 className={styles.formCardTitle}>Yeni malzeme</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr auto', gap: 12, alignItems: 'end' }}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="mat-name">Ad</label>
            <input id="mat-name" className={styles.formInput} placeholder="Örn: PETG" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="mat-desc">Malzeme açıklaması</label>
            <input id="mat-desc" className={styles.formInput} placeholder="Örn: ısıya dayanıklı, darbeye dirençli filament" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="mat-care">Kullanım / ısı dayanımı</label>
            <input id="mat-care" className={styles.formInput} placeholder="Örn: 80°C’ye kadar dayanır." value={care} onChange={(e) => setCare(e.target.value)} />
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
                <th>Ürün sayfasında</th>
                <th style={{ textAlign: 'right' }}>Ürün sayısı</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
                    <div>
                      <strong>malzeme:</strong> {m.name}
                      {m.description ? ` — ${m.description}` : ''}
                    </div>
                    {m.care ? (
                      <div>
                        <strong>kullanım:</strong> {m.care}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>kullanım bilgisi yok</div>
                    )}
                  </td>
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
              <label className={styles.formLabel} htmlFor="edit-mat-desc">Malzeme açıklaması</label>
              <input id="edit-mat-desc" className={styles.formInput} value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              <span className={styles.formHelp}>Ürün sayfasında &ldquo;malzeme: {editing.name} — …&rdquo; olarak görünür.</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="edit-mat-care">Kullanım / ısı dayanımı</label>
              <textarea id="edit-mat-care" rows={2} className={styles.formTextarea} value={editing.care ?? ''} onChange={(e) => setEditing({ ...editing, care: e.target.value })} />
              <span className={styles.formHelp}>Ürün sayfasında &ldquo;kullanım:&rdquo; satırında görünür. Boş bırakılırsa satır gösterilmez.</span>
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
