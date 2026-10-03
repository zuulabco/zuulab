'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { PRESET_COLORS, isLight, presetFor, swatchBackground } from '@/lib/catalog/colors'
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
  /** 'color': values are picked as swatches · 'text': values are typed (Boyut, Model…) */
  type: 'color' | 'text'
  values: string[]
  /** color options: the colours of each value (2+ make a gradient) */
  swatches?: Record<string, string[]>
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

const TEXT_SUGGESTIONS = ['Boyut', 'Model', 'Desen']

/** Options saved before types existed: one named "Renk" is a colour option */
export function withTypes(options: Array<Partial<OptionDraft> & { name: string; values: string[] }>): OptionDraft[] {
  return options.map((o) => {
    const type = o.type ?? (o.name.toLocaleLowerCase('tr-TR') === 'renk' ? 'color' : 'text')
    return type === 'color'
      ? { name: o.name, type, values: o.values, swatches: o.swatches ?? Object.fromEntries(o.values.map((v) => [v, [presetFor(v) ?? '#bdbdbd']])) }
      : { name: o.name, type, values: o.values }
  })
}

const comboKey = (options: OptionDraft[], combo: Record<string, string>) =>
  options.map((o) => `${o.name}=${combo[o.name] ?? ''}`).join('|')

/** Rows for every combination, keeping what was already entered for existing ones */
function rebuild(options: OptionDraft[], previous: VariantDraft[]): VariantDraft[] {
  const usable = options.filter((o) => o.name.trim() && o.values.length > 0)
  if (usable.length === 0) return []
  const combos = usable.reduce<Array<Record<string, string>>>(
    (acc, opt) => acc.flatMap((c) => opt.values.map((val) => ({ ...c, [opt.name]: val }))),
    [{}]
  )
  const byKey = new Map(previous.map((p) => [comboKey(usable, p.options), p]))
  const color = usable.find((o) => o.type === 'color')
  return combos.map((combo) => {
    const prev = byKey.get(comboKey(usable, combo))
    if (prev) return { ...prev, options: combo }
    // A new combination takes the photo already chosen for its colour
    const sameColor = color ? previous.find((p) => p.options[color.name] === combo[color.name] && p.imageUrl) : undefined
    return { options: combo, sku: '', stock: 0, imageUrl: sameColor?.imageUrl ?? '', isActive: true }
  })
}

function Swatch({ colors, size = 22 }: { colors: string[]; size?: number }) {
  const light = colors.length === 1 && isLight(colors[0])
  return (
    <span
      className={`${v.swatch} ${light ? v.swatchLight : ''}`}
      style={{ width: size, height: size, background: swatchBackground(colors) }}
      aria-hidden="true"
    />
  )
}

function ValuesInput({ values, onChange, label, placeholder }: { values: string[]; onChange: (v: string[]) => void; label: string; placeholder: string }) {
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
        placeholder={values.length ? 'değer ekle…' : placeholder}
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

function ImagePick({ url, onChange, label, size = 44 }: { url: string; onChange: (url: string) => void; label: string; size?: number }) {
  const upload = useUpload()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button
        type="button"
        className={v.rowImage}
        style={{ width: size, height: size }}
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={`${label}: görsel seç`}
        title={url ? 'Görseli değiştir' : 'Görsel yükle'}
      >
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

/** Mixes 2–4 colours into one swatch and names it */
function CustomColor({ onAdd, onCancel, taken }: { onAdd: (name: string, colors: string[]) => void; onCancel: () => void; taken: string[] }) {
  const [colors, setColors] = useState<string[]>(['#f57c00', '#7b1fa2'])
  const [name, setName] = useState('')
  const clash = taken.some((t) => t.toLocaleLowerCase('tr-TR') === name.trim().toLocaleLowerCase('tr-TR'))
  return (
    <div className={v.custom}>
      <Swatch colors={colors} size={44} />
      <div className={v.customBody}>
        <div className={v.customColors}>
          {colors.map((c, i) => (
            <span key={i} className={v.colorPick}>
              <input
                type="color"
                value={c}
                aria-label={`${i + 1}. renk`}
                onChange={(e) => setColors(colors.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {colors.length > 1 && (
                <button type="button" aria-label={`${i + 1}. rengi çıkar`} onClick={() => setColors(colors.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </span>
          ))}
          {colors.length < 4 && (
            <button type="button" className={v.addColor} onClick={() => setColors([...colors, '#1e88e5'])}>
              + renk
            </button>
          )}
        </div>
        <div className={v.customRow}>
          <input
            className={styles.formInput}
            placeholder="Renk adı (örn. Gün batımı)"
            value={name}
            maxLength={30}
            aria-label="Özel renk adı"
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
            disabled={name.trim().length < 2 || clash}
            onClick={() => onAdd(name.trim(), colors)}
          >
            Ekle
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={onCancel}>
            Vazgeç
          </button>
        </div>
        {clash && <span className={styles.formHelp}>Bu adda bir renk zaten var.</span>}
      </div>
    </div>
  )
}

function ColorOptionCard({
  option,
  rows,
  onChange,
  onRowsImage,
  onRemove,
}: {
  option: OptionDraft
  rows: VariantDraft[]
  onChange: (o: OptionDraft) => void
  onRowsImage: (value: string, url: string) => void
  onRemove: () => void
}) {
  const [custom, setCustom] = useState(false)
  const swatches = option.swatches ?? {}
  const has = (name: string) => option.values.some((x) => x.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))

  const add = (name: string, colors: string[]) =>
    onChange({ ...option, values: [...option.values, name], swatches: { ...swatches, [name]: colors } })
  const remove = (name: string) => {
    const nextSwatches = { ...swatches }
    delete nextSwatches[name]
    onChange({ ...option, values: option.values.filter((x) => x !== name), swatches: nextSwatches })
  }

  return (
    <div className={v.option}>
      <div className={v.optionHead}>
        <strong className={v.optionTitle}>Renk</strong>
        <span className={v.optionHint}>Müşteri ürün sayfasında renk toplarından seçer.</span>
        <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={onRemove}>
          Kaldır
        </button>
      </div>

      <div className={v.palette} role="group" aria-label="Hazır renkler">
        {PRESET_COLORS.map((p) => {
          const on = has(p.name)
          return (
            <button
              key={p.name}
              type="button"
              className={`${v.paletteItem} ${on ? v.paletteOn : ''}`}
              aria-pressed={on}
              title={p.name}
              onClick={() => (on ? remove(option.values.find((x) => x.toLocaleLowerCase('tr-TR') === p.name.toLocaleLowerCase('tr-TR'))!) : add(p.name, [p.hex]))}
            >
              <Swatch colors={[p.hex]} size={26} />
              <span>{p.name}</span>
            </button>
          )
        })}
        {!custom && (
          <button type="button" className={`${v.paletteItem} ${v.paletteCustom}`} onClick={() => setCustom(true)}>
            <Swatch colors={['#f57c00', '#7b1fa2', '#1e88e5']} size={26} />
            <span>Özel renk</span>
          </button>
        )}
      </div>

      {custom && (
        <CustomColor
          taken={option.values}
          onCancel={() => setCustom(false)}
          onAdd={(name, colors) => {
            add(name, colors)
            setCustom(false)
          }}
        />
      )}

      {option.values.length > 0 && (
        <div className={v.chosen}>
          <span className={v.chosenLabel}>Seçilen renkler ve görselleri</span>
          {option.values.map((val) => {
            const photo = rows.find((r) => r.options[option.name] === val && r.imageUrl)?.imageUrl ?? ''
            return (
              <div key={val} className={v.chosenRow}>
                <Swatch colors={swatches[val] ?? ['#bdbdbd']} size={28} />
                <span className={v.chosenName}>{val}</span>
                <ImagePick url={photo} label={val} size={40} onChange={(url) => onRowsImage(val, url)} />
                <span className={v.chosenHint}>{photo ? 'bu renk seçilince açılacak görsel' : 'bu renge görsel ekle'}</span>
                {photo && (
                  <button type="button" className={v.linkBtn} onClick={() => onRowsImage(val, '')}>
                    görseli kaldır
                  </button>
                )}
                <button type="button" className={v.removeX} aria-label={`${val} rengini kaldır`} onClick={() => remove(val)}>
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function VariantsEditor({ value, onChange, productSku }: { value: VariantsValue; onChange: (v: VariantsValue) => void; productSku?: string }) {
  const [bulkStock, setBulkStock] = useState('')
  const options = withTypes(value.options)
  const colorOption = options.find((o) => o.type === 'color')

  const setOptions = (next: OptionDraft[]) => onChange({ options: next, variants: rebuild(next, value.variants) })
  const setRow = (index: number, patch: Partial<VariantDraft>) =>
    onChange({ ...value, options, variants: value.variants.map((r, i) => (i === index ? { ...r, ...patch } : r)) })
  /** One photo per colour: every combination with that colour shows it */
  const setColorImage = (colorValue: string, url: string) =>
    onChange({
      ...value,
      options,
      variants: value.variants.map((r) => (colorOption && r.options[colorOption.name] === colorValue ? { ...r, imageUrl: url } : r)),
    })

  const addColor = () => setOptions([{ name: 'Renk', type: 'color', values: [], swatches: {} }, ...options])
  const addText = () => {
    const used = options.map((o) => o.name.toLocaleLowerCase('tr-TR'))
    const name = TEXT_SUGGESTIONS.find((s) => !used.includes(s.toLocaleLowerCase('tr-TR'))) ?? ''
    setOptions([...options, { name, type: 'text', values: [] }])
  }

  const addButtons = (
    <div className={v.addRow}>
      {!colorOption && (
        <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={addColor}>
          <Swatch colors={['#d32f2f', '#fbc02d', '#1e88e5']} size={16} /> Renk seçeneği ekle
        </button>
      )}
      {options.length < 3 && (
        <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={addText}>
          Boyut veya başka seçenek ekle
        </button>
      )}
    </div>
  )

  if (options.length === 0) {
    return (
      <div className={v.empty}>
        <p>Ürünün renk, boyut gibi seçenekleri yoksa bu bölümü boş bırakın.</p>
        {addButtons}
      </div>
    )
  }

  const totalStock = value.variants.filter((r) => r.isActive).reduce((s, r) => s + (Number(r.stock) || 0), 0)

  return (
    <div className={v.wrap}>
      <div className={v.options}>
        {options.map((opt, oi) =>
          opt.type === 'color' ? (
            <ColorOptionCard
              key={`color-${oi}`}
              option={opt}
              rows={value.variants}
              onChange={(next) => setOptions(options.map((o, i) => (i === oi ? next : o)))}
              onRowsImage={setColorImage}
              onRemove={() => setOptions(options.filter((_, i) => i !== oi))}
            />
          ) : (
            <div key={`text-${oi}`} className={v.option}>
              <div className={v.optionHead}>
                <input
                  className={`${styles.formInput} ${v.optionName}`}
                  value={opt.name}
                  aria-label="Seçenek adı"
                  list="variant-option-names"
                  placeholder="Seçenek adı (örn. Boyut)"
                  onChange={(e) => setOptions(options.map((o, i) => (i === oi ? { ...o, name: e.target.value } : o)))}
                />
                <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={() => setOptions(options.filter((_, i) => i !== oi))}>
                  Kaldır
                </button>
              </div>
              <ValuesInput
                label={`${opt.name || 'Seçenek'} değerleri`}
                placeholder="örn. Küçük, Orta, Büyük — Enter"
                values={opt.values}
                onChange={(values) => setOptions(options.map((o, i) => (i === oi ? { ...o, values } : o)))}
              />
            </div>
          )
        )}
        <datalist id="variant-option-names">
          {TEXT_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {addButtons}
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
                  onChange({ ...value, options, variants: value.variants.map((r) => ({ ...r, stock: Math.max(0, Number(bulkStock) || 0) })) })
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
                  {!colorOption && <th>Görsel</th>}
                  <th>Kombinasyon</th>
                  <th>Stok</th>
                  <th>Stok kodu</th>
                  <th title="Kapalı kombinasyonlar ürün sayfasında görünmez ve satılamaz">Satışta</th>
                </tr>
              </thead>
              <tbody>
                {value.variants.map((r, i) => {
                  const label = Object.values(r.options).join(' / ')
                  const colorValue = colorOption ? r.options[colorOption.name] : null
                  return (
                    <tr key={label} className={r.isActive ? '' : v.rowOff}>
                      {!colorOption && (
                        <td>
                          <ImagePick url={r.imageUrl} label={label} onChange={(url) => setRow(i, { imageUrl: url })} />
                        </td>
                      )}
                      <td className={v.comboCell}>
                        <span className={v.comboLabel}>
                          {colorValue && <Swatch colors={colorOption?.swatches?.[colorValue] ?? ['#bdbdbd']} size={16} />}
                          {label}
                        </span>
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
            &ldquo;Satışta&rdquo; işareti kaldırılan kombinasyon ürün sayfasında görünmez. Hepsi kapalıysa ürün seçeneksiz görünür.
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
        if (vr.success) setVariants({ options: withTypes(vr.options), variants: vr.variants })
        if (dt.success) setSize(dt.details)
      })
      .catch(() => toast.error('Seçenekler yüklenemedi.'))
  }, [canFetch, token, productId])

  const save = async (which: 'variants' | 'size') => {
    setSaving(which)
    try {
      if (which === 'variants') {
        const saved = await saveVariants(productId, variants, token)
        setVariants({ options: withTypes(saved.options), variants: saved.variants.filter((r) => r.isActive || saved.options.length > 0) })
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
