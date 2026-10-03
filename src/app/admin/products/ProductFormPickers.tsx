'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import type { AdminCategoryOption, AdminCollectionOption } from '@/hooks/useAdminCatalogOptions'
import styles from '../admin.module.css'
import pick from './ProductFormPickers.module.css'

/**
 * Pickers used by the new-product and edit-product pages. Each one can create the
 * thing it picks without leaving the form: a new category, collection or material is
 * saved right away and selected.
 */

function useAuthHeaders() {
  const { token } = useAuthStore()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

/** Small inline "name + Ekle" row */
function InlineCreate({
  label,
  placeholder,
  onCreate,
  onCancel,
}: {
  label: string
  placeholder: string
  onCreate: (name: string) => Promise<boolean>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (name.trim().length < 2 || saving) return
    setSaving(true)
    const ok = await onCreate(name.trim())
    setSaving(false)
    if (ok) setName('')
  }

  return (
    <div className={pick.inlineCreate}>
      <input
        autoFocus
        aria-label={label}
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
          if (e.key === 'Escape') onCancel()
        }}
        className={styles.formInput}
      />
      <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} onClick={submit} disabled={saving || name.trim().length < 2}>
        {saving ? 'Ekleniyor…' : 'Ekle'}
      </button>
      <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={onCancel}>
        Vazgeç
      </button>
    </div>
  )
}

function AddLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={pick.addLink} onClick={onClick}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {children}
    </button>
  )
}

export function CategoryPicker({
  id,
  value,
  onChange,
  categories,
  onCreated,
}: {
  id: string
  value: string
  onChange: (id: string) => void
  categories: AdminCategoryOption[]
  onCreated: (c: AdminCategoryOption) => void
}) {
  const headers = useAuthHeaders()
  const [creating, setCreating] = useState(false)

  const create = async (name: string) => {
    const res = await fetch('/api/admin/categories', { method: 'POST', headers, body: JSON.stringify({ name }) })
    const data = await res.json().catch(() => ({}))
    if (!data.success) {
      toast.error(data.error || 'Kategori eklenemedi.')
      return false
    }
    const created = data.category as AdminCategoryOption
    onCreated(created)
    onChange(created.id)
    setCreating(false)
    toast.success(`'${created.name}' kategorisi eklendi ve seçildi.`)
    return true
  }

  return (
    <div className={styles.formGroup}>
      <div className={pick.labelRow}>
        <label className={styles.formLabel} htmlFor={id}>Kategori *</label>
        {!creating && <AddLink onClick={() => setCreating(true)}>Yeni kategori</AddLink>}
      </div>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={styles.formSelect}>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
      </select>
      {creating && (
        <InlineCreate label="Yeni kategori adı" placeholder="Örn: Duvar dekoru" onCreate={create} onCancel={() => setCreating(false)} />
      )}
    </div>
  )
}

export function CollectionsPicker({
  selected,
  onToggle,
  collections,
  onCreated,
  keyBy = 'slug',
}: {
  selected: string[]
  onToggle: (key: string) => void
  collections: AdminCollectionOption[]
  onCreated: (c: AdminCollectionOption) => void
  /** Which field identifies a collection in `selected` */
  keyBy?: 'slug' | 'id'
}) {
  const headers = useAuthHeaders()
  const [creating, setCreating] = useState(false)

  const create = async (name: string) => {
    const res = await fetch('/api/admin/collections', { method: 'POST', headers, body: JSON.stringify({ name }) })
    const data = await res.json().catch(() => ({}))
    if (!data.success) {
      toast.error(data.error || 'Koleksiyon eklenemedi.')
      return false
    }
    const created = data.collection as AdminCollectionOption
    onCreated(created)
    onToggle(created[keyBy])
    setCreating(false)
    toast.success(`'${created.name}' koleksiyonu eklendi ve ürüne bağlandı.`)
    return true
  }

  return (
    <div className={styles.formGroup}>
      <div className={pick.labelRow}>
        <span className={styles.formLabel}>Koleksiyonlar</span>
        {!creating && <AddLink onClick={() => setCreating(true)}>Yeni koleksiyon</AddLink>}
      </div>
      <div className={pick.chips} role="group" aria-label="Koleksiyonlar">
        {collections.length === 0 && <span className={styles.formHelp}>Henüz koleksiyon yok.</span>}
        {collections.map((col) => {
          const on = selected.includes(col[keyBy])
          return (
            <button
              key={col.id}
              type="button"
              aria-pressed={on}
              className={`${pick.chip} ${on ? pick.chipOn : ''}`}
              onClick={() => onToggle(col[keyBy])}
            >
              {on && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {col.name}
            </button>
          )
        })}
      </div>
      <span className={styles.formHelp}>Birden fazla seçebilirsiniz. İlk seçilen, ürünün ana koleksiyonu olur.</span>
      {creating && (
        <InlineCreate label="Yeni koleksiyon adı" placeholder="Örn: zuuhome" onCreate={create} onCancel={() => setCreating(false)} />
      )}
    </div>
  )
}

interface MaterialOption {
  id: string
  name: string
}

export function MaterialPicker({ id, value, onChange }: { id: string; value: string; onChange: (name: string) => void }) {
  const { canFetch } = useAuthStore()
  const headers = useAuthHeaders()
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!canFetch) return
    fetch('/api/admin/product-materials', { headers, cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setMaterials(data.materials)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch])

  // A product saved with a material that is not in the list still shows it
  const options = value && !materials.some((m) => m.name === value) ? [{ id: '_current', name: value }, ...materials] : materials

  const create = async (name: string) => {
    const res = await fetch('/api/admin/product-materials', { method: 'POST', headers, body: JSON.stringify({ name }) })
    const data = await res.json().catch(() => ({}))
    if (!data.success) {
      toast.error(data.error || 'Malzeme eklenemedi.')
      return false
    }
    setMaterials((list) => [...list, data.material])
    onChange(data.material.name)
    setCreating(false)
    toast.success(`'${data.material.name}' malzemesi eklendi ve seçildi.`)
    return true
  }

  return (
    <div className={styles.formGroup}>
      <div className={pick.labelRow}>
        <label className={styles.formLabel} htmlFor={id}>Malzeme</label>
        {!creating && <AddLink onClick={() => setCreating(true)}>Yeni malzeme</AddLink>}
      </div>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={styles.formSelect}>
        <option value="">Seçin</option>
        {options.map((m) => (
          <option key={m.id} value={m.name}>{m.name}</option>
        ))}
      </select>
      {creating && (
        <InlineCreate label="Yeni malzeme adı" placeholder="Örn: PETG" onCreate={create} onCancel={() => setCreating(false)} />
      )}
    </div>
  )
}
