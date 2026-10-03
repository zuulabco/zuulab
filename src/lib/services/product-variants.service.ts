import 'server-only'
import { db } from '@/prisma/db'
import { dbNumeric } from '@/lib/db/numeric'
import { invalidateCatalog } from '@/lib/cache/catalog-cache'
import { logAuditEvent } from './admin.service'
import { cleanSwatch, presetFor } from '@/lib/catalog/colors'

/**
 * Product options (Renk, Boyut…) and their combinations.
 *
 * A product defines up to three options, each with a list of values. Every combination
 * is a `product_variants` row with its own stock, SKU and optional photo. The row's
 * `name` / `value` keep a readable label ("Renk / Boyut", "Kırmızı / M") for carts,
 * orders and marketplaces. The product's own stock is the sum of its active
 * combinations, so listings show "stokta" correctly.
 *
 * Combinations that disappear from the options are switched off rather than deleted,
 * because past orders still point at them.
 */

export interface VariantOption {
  name: string
  /** 'color' options show swatches on the product page; 'text' ones show labels */
  type: 'color' | 'text'
  values: string[]
  /** color options: the colours of each value's swatch (2+ make a gradient) */
  swatches?: Record<string, string[]>
}

export interface VariantRowInput {
  id?: string | null
  options: Record<string, string>
  sku?: string | null
  stock: number
  imageUrl?: string | null
  isActive?: boolean
}

export interface VariantRow extends Required<Omit<VariantRowInput, 'id'>> {
  id: string
  label: string
}

export interface ProductVariantsState {
  options: VariantOption[]
  variants: VariantRow[]
}

export class VariantValidationError extends Error {
  readonly isValidation = true
}

const MAX_OPTIONS = 3
const MAX_VALUES = 30

function clean(s: unknown, max = 40): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
}

export function normalizeOptions(input: unknown): VariantOption[] {
  if (!Array.isArray(input)) return []
  const out: VariantOption[] = []
  for (const raw of input) {
    const name = clean((raw as VariantOption)?.name)
    if (!name) continue
    if (out.some((o) => o.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) {
      throw new VariantValidationError(`'${name}' seçeneği iki kez eklenmiş.`)
    }
    const values: string[] = []
    for (const v of Array.isArray((raw as VariantOption)?.values) ? (raw as VariantOption).values : []) {
      const value = clean(v)
      if (value && !values.some((x) => x.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR'))) values.push(value)
    }
    if (values.length === 0) throw new VariantValidationError(`'${name}' seçeneğine en az bir değer girin.`)
    if (values.length > MAX_VALUES) throw new VariantValidationError(`Bir seçenekte en fazla ${MAX_VALUES} değer olabilir.`)
    // Options saved before types existed: one named 'Renk' is a colour option
    const rawType = (raw as Partial<VariantOption>)?.type
    const type: VariantOption['type'] = rawType === 'color' || (!rawType && name.toLocaleLowerCase('tr-TR') === 'renk') ? 'color' : 'text'
    if (type === 'color') {
      if (out.some((o) => o.type === 'color')) throw new VariantValidationError('Bir üründe tek renk seçeneği olabilir.')
      const given = ((raw as VariantOption)?.swatches ?? {}) as Record<string, unknown>
      const swatches: Record<string, string[]> = {}
      for (const v of values) {
        const colors = cleanSwatch(given[v])
        const preset = presetFor(v)
        swatches[v] = colors.length ? colors : preset ? [preset] : ['#bdbdbd']
      }
      out.push({ name, type, values, swatches })
    } else {
      out.push({ name, type, values })
    }
  }
  if (out.length > MAX_OPTIONS) throw new VariantValidationError(`En fazla ${MAX_OPTIONS} seçenek (örn. renk, boyut, malzeme) tanımlanabilir.`)
  return out
}

/** Every combination of the option values, in option order */
export function combinations(options: VariantOption[]): Array<Record<string, string>> {
  return options.reduce<Array<Record<string, string>>>(
    (acc, opt) => acc.flatMap((combo) => opt.values.map((v) => ({ ...combo, [opt.name]: v }))),
    [{}]
  ).filter((c) => Object.keys(c).length > 0)
}

const keyOf = (options: VariantOption[], combo: Record<string, string>) =>
  options.map((o) => `${o.name}=${(combo[o.name] ?? '').toLocaleLowerCase('tr-TR')}`).join('|')

export async function getProductVariants(productId: string): Promise<ProductVariantsState> {
  const product = await db.orm.public.Product.select('id', 'variantOptions').where({ id: productId }).first()
  if (!product) throw new VariantValidationError('Ürün bulunamadı.')
  const options = normalizeOptions(product.variantOptions)
  const rows = await db.orm.public.ProductVariant.where({ productId }).orderBy((v) => v.sortOrder.asc()).all()
  return {
    options,
    variants: rows.map((r) => {
      const opts = (r.options as Record<string, string> | null) ?? (r.name && r.value ? { [r.name]: r.value } : {})
      return {
        id: r.id,
        options: opts,
        label: Object.values(opts).join(' / ') || r.value,
        sku: r.sku ?? '',
        stock: r.stock,
        imageUrl: r.imageUrl ?? '',
        isActive: r.isActive,
      }
    }),
  }
}

/**
 * Saves the options and one row per combination. Rows are matched to existing
 * variants by id, or else by their option values, so edits keep variant ids stable.
 */
export async function saveProductVariants(
  productId: string,
  input: { options: unknown; variants: VariantRowInput[] },
  adminEmail = 'system'
): Promise<ProductVariantsState> {
  const product = await db.orm.public.Product.select('id', 'sku', 'price').where({ id: productId }).first()
  if (!product) throw new VariantValidationError('Ürün bulunamadı.')
  const options = normalizeOptions(input.options)
  const existing = await db.orm.public.ProductVariant.where({ productId }).all()

  const wanted = combinations(options)
  const inputByKey = new Map((input.variants ?? []).map((v) => [keyOf(options, v.options ?? {}), v]))
  const existingByKey = new Map(
    existing.map((e) => [keyOf(options, (e.options as Record<string, string> | null) ?? { [e.name]: e.value }), e])
  )
  const existingById = new Map(existing.map((e) => [e.id, e]))

  const keep = new Set<string>()
  await db.transaction(async (tx) => {
    for (let i = 0; i < wanted.length; i++) {
      const combo = wanted[i]
      const key = keyOf(options, combo)
      const row = inputByKey.get(key)
      const stock = Math.max(0, Math.floor(Number(row?.stock ?? 0)) || 0)
      if (stock > 100000) throw new VariantValidationError('Stok en fazla 100.000 olabilir.')
      const imageUrl = clean(row?.imageUrl, 500) || null
      if (imageUrl && !/^https:\/\//.test(imageUrl) && !imageUrl.startsWith('/')) {
        throw new VariantValidationError('Varyant görseli https:// ile başlayan bir adres olmalıdır.')
      }
      const fields = {
        name: options.map((o) => o.name).join(' / '),
        value: options.map((o) => combo[o.name]).join(' / '),
        options: combo as never,
        sku: clean(row?.sku, 60).toUpperCase() || `${product.sku}-${i + 1}`,
        stock,
        imageUrl,
        isActive: row?.isActive !== false,
        sortOrder: i,
        price: dbNumeric(Number(product.price)),
      }
      const match = (row?.id && existingById.get(row.id)) || existingByKey.get(key)
      if (match) {
        await tx.orm.public.ProductVariant.where({ id: match.id }).update(fields as never)
        keep.add(match.id)
      } else {
        const created = await tx.orm.public.ProductVariant.create({ productId, ...fields } as never)
        keep.add(created.id)
      }
    }
    // Combinations no longer offered: switch off (orders may reference them)
    for (const e of existing) {
      if (!keep.has(e.id) && e.isActive) await tx.orm.public.ProductVariant.where({ id: e.id }).update({ isActive: false })
    }
    // Written with SQL: through the ORM a null JSON value was silently skipped, so a
    // removed option stayed on the product page as an empty "renk:" row.
    await tx.execute(
      (options.length
        ? db.raw.sql`UPDATE products SET variant_options = ${JSON.stringify(options)}::jsonb, updated_at = now() WHERE id = ${productId}`
        : db.raw.sql`UPDATE products SET variant_options = NULL, updated_at = now() WHERE id = ${productId}`
      )
        .affectedCount()
        .build()
    )
    await tx.execute(db.raw.sql`
      UPDATE products SET stock = (
        SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = ${productId} AND is_active
      ), updated_at = now()
      WHERE id = ${productId} AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = ${productId} AND is_active)
    `.affectedCount().build())
  })

  invalidateCatalog()
  await logAuditEvent({
    action: 'PRODUCT_VARIANTS_UPDATED',
    entity: 'Product',
    entityId: productId,
    metadata: { options, combinations: wanted.length, adminEmail },
  })
  return getProductVariants(productId)
}

// ── Measurements and specification rows ─────────────────────

export interface ProductDetailsInput {
  lengthMm?: number | null
  widthMm?: number | null
  heightMm?: number | null
  weightGrams?: number | null
  specifications?: Array<{ name: string; value: string }>
}

function size(v: unknown, label: string, max: number): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n < 0 || n > max) throw new VariantValidationError(`${label} 0 ile ${max} arasında olmalıdır.`)
  return n
}

export async function getProductDetails(productId: string) {
  const [p, specs] = await Promise.all([
    db.orm.public.Product.select('lengthMm', 'widthMm', 'heightMm', 'weightGrams').where({ id: productId }).first(),
    db.orm.public.ProductSpecification.where({ productId }).orderBy((s) => s.sortOrder.asc()).all(),
  ])
  if (!p) throw new VariantValidationError('Ürün bulunamadı.')
  return {
    lengthMm: p.lengthMm ?? null,
    widthMm: p.widthMm ?? null,
    heightMm: p.heightMm ?? null,
    weightGrams: p.weightGrams ?? null,
    specifications: specs.map((s) => ({ name: s.name, value: s.value })),
  }
}

export async function saveProductDetails(productId: string, input: ProductDetailsInput, adminEmail = 'system') {
  const exists = await db.orm.public.Product.select('id').where({ id: productId }).first()
  if (!exists) throw new VariantValidationError('Ürün bulunamadı.')
  const specs = (input.specifications ?? [])
    .map((s) => ({ name: clean(s.name, 60), value: clean(s.value, 200) }))
    .filter((s) => s.name && s.value)
    .slice(0, 30)

  await db.transaction(async (tx) => {
    await tx.orm.public.Product.where({ id: productId }).update({
      lengthMm: size(input.lengthMm, 'Uzunluk', 5000),
      widthMm: size(input.widthMm, 'Genişlik', 5000),
      heightMm: size(input.heightMm, 'Yükseklik', 5000),
      weightGrams: size(input.weightGrams, 'Ağırlık', 100000),
    } as never)
    await tx.execute(db.raw.sql`DELETE FROM product_specifications WHERE product_id = ${productId}`.affectedCount().build())
    for (let i = 0; i < specs.length; i++) {
      await tx.orm.public.ProductSpecification.create({ productId, name: specs[i].name, value: specs[i].value, sortOrder: i })
    }
  })
  invalidateCatalog()
  await logAuditEvent({ action: 'PRODUCT_DETAILS_UPDATED', entity: 'Product', entityId: productId, metadata: { adminEmail } })
  return getProductDetails(productId)
}
