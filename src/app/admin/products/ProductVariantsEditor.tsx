'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import styles from '../admin.module.css'
import v from './ProductVariantsEditor.module.css'

/**
 * Options and combinations for the product form.
 *
 * The shopper picks one value per option (Renk, Boyut…); every combination has its
 * own stock, stock code and optional photo. Used by the new-product page (saved after
 * the product is created) and the edit page (VariantsCard saves on its own).
 */

export interface OptionDraft {
  name: string
  values: string[]
}

export interface VariantDraft {
  id?: string
  options: Record<string, string>
  sku: string
  stock: number
  imageUrl: string
  isActive: boolean
}

export interface VariantsValue {
  options: OptionDraft[]
  variants: VariantDraft[]
}

export interface SizeValue {
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  weightGrams: number | null
  specifications: Array<{ name: string; value: string }>
}

export const EMPTY_VARIANTS: VariantsValue = { options: [], variants: [] }
export const EMPTY_SIZE: SizeValue = { lengthMm: null, widthMm: null, heightMm: null, weightGrams: null, specifications: [] }

const SUGGESTED = ['Renk', 'Boyut', 'Model']

const comboKey = (options: OptionDraft[], combo: Record<string, string>) =>
  options.map((o) => `${o.name}=${combo[o.name] ?? ''}`).join('|')

/** Rows for every combination, keeping what was already typed for existing ones */
function rebuild(options: OptionDraft[], previous: VariantDraft[]): VariantDraft[] {
  const usable = options.filter((o) => o.name.trim() && o.values.length > 0)
  if (usable.length === 0) return []
  const combos = usable.reduce<Array<Record<string, string>>>(
    (acc, opt) => acc.flatMap((c) => opt.values.map((val) => ({ ...c, [opt.name]: val }))),
    [{}]
  )
  const byKey = new Map(previous.map((p) => [comboKey(usable, p.options), p]))
  // A combination that only gained a new option keeps its stock/photo from the shorter key
  const byFirst = new Map(previous.map((p) => [p.options[usable[0].name], p]))
  return combos.map((combo) => {
    const prev = byKey.get(comboKey(usable, combo))
    if (prev) return { ...prev, options: combo }
    const sameFirst = byFirst.get(combo[usable[0].name])
    return { options: combo, sku: '', stock: 0, imageUrl: sameFirst?.imageUrl ?? '', isActive: true }
  })
}

function ValuesInput({ values, onChange, label }: { values: string[]; onChange: (v: string[]) => void; label: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const parts = text
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && !values.some((x) => x.toLocaleLowerCase('tr-TR') === p.toLocaleLowerCase('tr-TR')))
    if (parts.length) onChange([...values, ...parts])
    setText('')
  }
  return (
    <div className={v.values}>
      {values.map((val) => (
        <span key={val} className={v.chip}>
          {val}
          <button type="button" aria-label={`${val} değerini kaldır`} onClick={() => onChange(values.filter((x) => x !== val))}>
            ×
          </button>
        </span>
      ))}
      <input
        className={v.valueInput}
        value={text}
        aria-label={label}
        placeholder={values.length ? 'değer ekle…' : 'örn. Kırmızı, Mavi — Enter'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !text && values.length) {
            onChange(values.slice(0, -1))
          }
        }}
        onBlur={add}
      />
    </div>
  )
}

function useUpload() {
  const { token } = useAuthStore()
  return useCallback(
    async (file: File): Promise<string | null> => {
      const form = new FormData()
      form.append('file', file)
      try {
        const res = await fetch('/api/admin/media/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
        const d = await res.json()
        if (d.success && d.url) return d.url as string
        toast.error(d.error || 'Görsel yüklenemedi.')
      } catch {
        toast.error('Görsel yüklenemedi.')
      }
      return null
    },
    [token]
  )
}

function RowImage({ url, onChange, label }: { url: string; onChange: (url: string) => void; label: string }) {
  const upload = useUpload()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button type="button" className={v.rowImage} onClick={() => input.current?.click()} disabled={busy} aria-label={`${label}: görsel seç`} title="Görsel yükle">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" />
        ) : (
          <span>{busy ? '…' : '+'}</span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setBusy(true)
          const uploaded = await upload(file)
          setBusy(false)
          if (uploaded) onChange(uploaded)
          if (input.current) input.current.value = ''
        }}
      />
    </>
  )
}

export function VariantsEditor({ value, onChange, productSku }: { value: VariantsValue; onChange: (v: VariantsValue) => void; productSku?: string }) {
  const [bulkStock, setBulkStock] = useState('')
  const enabled = value.options.length > 0

  const setOptions = (options: OptionDraft[]) => onChange({ options, variants: rebuild(options, value.variants) })
  const setRow = (index: number, patch: Partial<VariantDraft>) =>
    onChange({ ...value, variants: value.variants.map((r, i) => (i === index ? { ...r, ...patch } : r)) })

  /** A photo set on one row also fills empty rows with the same first value (e.g. the same colour) */
  const setRowImage = (index: number, url: string) => {
    const first = value.options[0]?.name
    const key = first ? value.variants[index].options[first] : null
    let filled = 0
    const variants = value.variants.map((r, i) => {
      if (i === index) return { ...r, imageUrl: url }
      if (url && key && value.options.length > 1 && r.options[first!] === key && !r.imageUrl) {
        filled++
        return { ...r, imageUrl: url }
      }
      return r
    })
    onChange({ ...value, variants })
    if (filled > 0) toast.info(`Aynı ${first?.toLocaleLowerCase('tr-TR')} için ${filled} satıra da eklendi.`)
  }

  if (!enabled) {
    return (
      <div className={v.empty}>
        <p>Ürünün renk, boyut gibi seçenekleri yoksa bu bölümü boş bırakın.</p>
        <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setOptions([{ name: 'Renk', values: [] }])}>
          Seçenek ekle
        </button>
      </div>
    )
  }

  const usedNames = value.options.map((o) => o.name.toLocaleLowerCase('tr-TR'))
  const nextName = SUGGESTED.find((s) => !usedNames.includes(s.toLocaleLowerCase('tr-TR'))) ?? ''
  const totalStock = value.variants.filter((r) => r.isActive).reduce((s, r) => s + (Number(r.stock) || 0), 0)

  return (
    <div className={v.wrap}>
      <div className={v.options}>
        {value.options.map((opt, oi) => (
          <div key={oi} className={v.option}>
            <div className={v.optionHead}>
              <input
                className={`${styles.formInput} ${v.optionName}`}
                value={opt.name}
                aria-label="Seçenek adı"
                list="variant-option-names"
                placeholder="Seçenek adı"
                onChange={(e) => setOptions(value.options.map((o, i) => (i === oi ? { ...o, name: e.target.value } : o)))}
              />
              <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => setOptions(value.options.filter((_, i) => i !== oi))}>
                Kaldır
              </button>
            </div>
            <ValuesInput
              label={`${opt.name || 'Seçenek'} değerleri`}
              values={opt.values}
              onChange={(values) => setOptions(value.options.map((o, i) => (i === oi ? { ...o, values } : o)))}
            />
          </div>
        ))}
        <datalist id="variant-option-names">
          {SUGGESTED.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {value.options.length < 3 && (
          <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={() => setOptions([...value.options, { name: nextName, values: [] }])}>
            Başka seçenek ekle
          </button>
        )}
      </div>

      {value.variants.length > 0 && (
        <>
          <div className={v.bulk}>
            <span>
              {value.variants.length} kombinasyon · toplam stok <strong>{totalStock}</strong>
            </span>
            <span className={v.bulkRight}>
              <input
                type="number"
                min="0"
                className={`${styles.formInput} ${v.bulkInput}`}
                placeholder="stok"
                value={bulkStock}
                aria-label="Hepsine aynı stok"
                onChange={(e) => setBulkStock(e.target.value)}
              />
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                disabled={bulkStock === ''}
                onClick={() => {
                  onChange({ ...value, variants: value.variants.map((r) => ({ ...r, stock: Math.max(0, Number(bulkStock) || 0) })) })
                  setBulkStock('')
                }}
              >
                Hepsine uygula
              </button>
            </span>
          </div>

          <div className={v.tableWrap}>
            <table className={v.table}>
              <thead>
                <tr>
                  <th>Görsel</th>
                  <th>Kombinasyon</th>
                  <th>Stok</th>
                  <th>Stok kodu</th>
                  <th>Satışta</th>
                </tr>
              </thead>
              <tbody>
                {value.variants.map((r, i) => {
                  const label = Object.values(r.options).join(' / ')
                  return (
                    <tr key={label} className={r.isActive ? '' : v.rowOff}>
                      <td>
                        <RowImage url={r.imageUrl} label={label} onChange={(url) => setRowImage(i, url)} />
                      </td>
                      <td className={v.comboCell}>
                        {label}
                        {r.imageUrl && (
                          <button type="button" className={v.linkBtn} onClick={() => setRow(i, { imageUrl: '' })}>
                            görseli kaldır
                          </button>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className={`${styles.formInput} ${v.stockInput}`}
                          value={r.stock}
                          aria-label={`${label} stok`}
                          onChange={(e) => setRow(i, { stock: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </td>
                      <td>
                        <input
                          className={`${styles.formInput} ${v.skuInput}`}
                          value={r.sku}
                          placeholder={productSku ? `${productSku}-${i + 1}` : 'otomatik'}
                          aria-label={`${label} stok kodu`}
                          onChange={(e) => setRow(i, { sku: e.target.value.toUpperCase() })}
                        />
                      </td>
                      <td>
                        <input type="checkbox" checked={r.isActive} aria-label={`${label} satışta`} onChange={(e) => setRow(i, { isActive: e.target.checked })} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.formHelp}>
            Bir satıra görsel eklediğinizde, aynı {value.options[0]?.name?.toLocaleLowerCase('tr-TR') || 'seçenek'} için boş satırlara da eklenir. Müşteri o seçeneği seçince ürün sayfasında bu görsel açılır.
          </p>
        </>
      )}
    </div>
  )
}

export function SizeEditor({ value, onChange }: { value: SizeValue; onChange: (v: SizeValue) => void }) {
  const num = (s: string) => (s === '' ? null : Math.max(0, Math.round(Number(s)) || 0))
  const set = (k: keyof Omit<SizeValue, 'specifications'>) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: num(e.target.value) })
  return (
    <div className={v.wrap}>
      <div className={v.sizeGrid}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor="size-l">Uzunluk (mm)</label>
          <input id="size-l" type="number" min="0" className={styles.formInput} value={value.lengthMm ?? ''} onChange={set('lengthMm')} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor="size-w">Genişlik (mm)</label>
          <input id="size-w" type="number" min="0" className={styles.formInput} value={value.widthMm ?? ''} onChange={set('widthMm')} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor="size-h">Yükseklik (mm)</label>
          <input id="size-h" type="number" min="0" className={styles.formInput} value={value.heightMm ?? ''} onChange={set('heightMm')} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor="size-g">Ağırlık (g)</label>
          <input id="size-g" type="number" min="0" className={styles.formInput} value={value.weightGrams ?? ''} onChange={set('weightGrams')} />
        </div>
      </div>

      <div className={styles.formGroup}>
        <span className={styles.formLabel}>Diğer bilgiler (ürün sayfasında &ldquo;ölçüler ve detaylar&rdquo; altında)</span>
        <div className={v.specs}>
          {value.specifications.map((s, i) => (
            <div key={i} className={v.specRow}>
              <input
                className={styles.formInput}
                placeholder="Başlık (örn. ampul)"
                value={s.name}
                aria-label={`Bilgi ${i + 1} başlık`}
                onChange={(e) => onChange({ ...value, specifications: value.specifications.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
              />
              <input
                className={styles.formInput}
                placeholder="Değer (örn. E14, dahil değil)"
                value={s.value}
                aria-label={`Bilgi ${i + 1} değer`}
                onChange={(e) => onChange({ ...value, specifications: value.specifications.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
              />
              <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => onChange({ ...value, specifications: value.specifications.filter((_, j) => j !== i) })}>
                Sil
              </button>
            </div>
          ))}
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
            style={{ alignSelf: 'flex-start' }}
            onClick={() => onChange({ ...value, specifications: [...value.specifications, { name: '', value: '' }] })}
          >
            Bilgi satırı ekle
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Load / save helpers ──────────────────────────────────

export async function saveVariants(productId: string, value: VariantsValue, token: string | null) {
  const res = await fetch(`/api/admin/products/${productId}/variants`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ options: value.options.filter((o) => o.name.trim() && o.values.length), variants: value.variants }),
  })
  const d = await res.json().catch(() => ({}))
  if (!d.success) throw new Error(d.error || 'Seçenekler kaydedilemedi.')
  return { options: d.options as OptionDraft[], variants: d.variants as VariantDraft[] }
}

export async function saveSize(productId: string, value: SizeValue, token: string | null) {
  const res = await fetch(`/api/admin/products/${productId}/details`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(value),
  })
  const d = await res.json().catch(() => ({}))
  if (!d.success) throw new Error(d.error || 'Ölçüler kaydedilemedi.')
  return d.details as SizeValue
}

/** Edit page: loads, edits and saves options and sizes on its own */
export function VariantsAndSizeCards({ productId, productSku }: { productId: string; productSku?: string }) {
  const { token, canFetch } = useAuthStore()
  const [variants, setVariants] = useState<VariantsValue>(EMPTY_VARIANTS)
  const [size, setSize] = useState<SizeValue>(EMPTY_SIZE)
  const [dirty, setDirty] = useState({ variants: false, size: false })
  const [saving, setSaving] = useState<'variants' | 'size' | null>(null)

  useEffect(() => {
    if (!canFetch) return
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch(`/api/admin/products/${productId}/variants`, { headers, cache: 'no-store' }).then((r) => r.json()),
      fetch(`/api/admin/products/${productId}/details`, { headers, cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([vr, dt]) => {
        if (vr.success) setVariants({ options: vr.options, variants: vr.variants })
        if (dt.success) setSize(dt.details)
      })
      .catch(() => toast.error('Seçenekler yüklenemedi.'))
  }, [canFetch, token, productId])

  const save = async (which: 'variants' | 'size') => {
    setSaving(which)
    try {
      if (which === 'variants') {
        const saved = await saveVariants(productId, variants, token)
        setVariants({ options: saved.options, variants: saved.variants.filter((r) => r.isActive || saved.options.length > 0) })
        toast.success('Seçenekler ve stoklar kaydedildi.')
      } else {
        setSize(await saveSize(productId, size, token))
        toast.success('Ölçüler kaydedildi.')
      }
      setDirty((d) => ({ ...d, [which]: false }))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <div className={styles.formCard}>
        <div className={v.cardHead}>
          <h2 className={styles.formCardTitle} style={{ border: 'none', margin: 0, padding: 0 }}>Seçenekler (renk, boyut…)</h2>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} onClick={() => save('variants')} disabled={!dirty.variants || saving !== null}>
            {saving === 'variants' ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
        <VariantsEditor
          value={variants}
          productSku={productSku}
          onChange={(next) => {
            setVariants(next)
            setDirty((d) => ({ ...d, variants: true }))
          }}
        />
      </div>

      <div className={styles.formCard}>
        <div className={v.cardHead}>
          <h2 className={styles.formCardTitle} style={{ border: 'none', margin: 0, padding: 0 }}>Ölçüler ve detaylar</h2>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} onClick={() => save('size')} disabled={!dirty.size || saving !== null}>
            {saving === 'size' ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
        <SizeEditor
          value={size}
          onChange={(next) => {
            setSize(next)
            setDirty((d) => ({ ...d, size: true }))
          }}
        />
      </div>
    </>
  )
}
