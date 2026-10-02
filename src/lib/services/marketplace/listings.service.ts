import 'server-only'
import { db } from '@/prisma/db'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { invalidateCatalog } from '@/lib/cache/catalog-cache'
import { cloudinaryService } from '@/lib/services/media/cloudinary.service'
import { adminCreateProduct } from '../catalog-admin.service'
import { logAuditEvent } from '../admin.service'
import { MarketplaceError } from './marketplace-error'
import { MarketplaceProviderFactory } from './provider.factory'
import { getMarketplaceStoreById, getMarketplaceStores, getStoreCredentialById } from './marketplace.service'
import type { MarketplaceProviderType, NormalizedMarketplaceProduct } from './marketplace.interface'
import { guessCategorySlug, guessCollectionSlug, htmlToText, nameSimilarity } from './listing-text'

/**
 * Marketplace listings: what each store sells (one row per barcode) and which site
 * product it is linked to.
 *
 * Linking is deterministic only: the same model code as an already linked listing,
 * the same barcode, or the same SKU. Name similarity is shown as a suggestion and
 * never applied without the admin.
 */

export type MatchMethod = 'MODEL_CODE' | 'BARCODE' | 'SKU' | 'MANUAL' | 'IMPORT'
export type ListingFilter = 'ALL' | 'UNMAPPED' | 'MAPPED' | 'IGNORED'

export interface ListingSuggestion {
  productId: string
  name: string
  sku: string
  score: number
}

export interface ListingView {
  id: string
  storeId: string
  storeName: string
  provider: MarketplaceProviderType
  barcode: string
  stockCode: string | null
  productMainId: string | null
  title: string
  brand: string | null
  categoryName: string | null
  imageUrl: string | null
  productUrl: string | null
  salePrice: number
  listPrice: number
  quantity: number
  onSale: boolean
  archived: boolean
  lastSeenAt: string | null
  productId: string | null
  productName: string | null
  productSku: string | null
  variantId: string | null
  matchMethod: MatchMethod | null
  ignored: boolean
  targetSalePrice: number | null
  targetListPrice: number | null
  suggestions: ListingSuggestion[]
}

type ListingRow = {
  id: string
  storeId: string
  barcode: string
  stockCode: string | null
  productMainId: string | null
  title: string
  brand: string | null
  categoryName: string | null
  description: string | null
  imageUrls: unknown
  attributes: unknown
  productUrl: string | null
  vatRate: number | null
  salePrice: unknown
  listPrice: unknown
  quantity: number
  onSale: boolean
  archived: boolean
  lastSeenAt: unknown
  productId: string | null
  variantId: string | null
  matchMethod: string | null
  ignored: boolean
  targetSalePrice: unknown
  targetListPrice: unknown
}

const MAX_PAGES = 50
const PAGE_SIZE = 200

function money(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100) / 100
}

function nullableMoney(value: unknown): number | null {
  return value === null || value === undefined ? null : money(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

// ─────────────────────────────────────────────────────────────
// Suggestions (name similarity, never applied automatically)
// ─────────────────────────────────────────────────────────────

function suggestionsFor(
  listing: { title: string; productMainId: string | null; stockCode: string | null },
  products: Array<{ id: string; name: string; sku: string }>
): ListingSuggestion[] {
  const codes = [listing.productMainId, listing.stockCode].filter(Boolean).map((c) => c!.toLowerCase())
  return products
    .map((p) => {
      let score = nameSimilarity(listing.title, p.name)
      if (codes.some((c) => p.sku.toLowerCase().includes(c) || c.includes(p.sku.toLowerCase()))) score = Math.max(score, 0.9)
      return { productId: p.id, name: p.name, sku: p.sku, score: Math.round(score * 100) / 100 }
    })
    .filter((s) => s.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

// ─────────────────────────────────────────────────────────────
// Reading from the marketplace
// ─────────────────────────────────────────────────────────────

export interface RefreshResult {
  storeId: string
  fetched: number
  created: number
  updated: number
  archived: number
  autoMapped: number
}

async function fetchAllProducts(storeId: string): Promise<NormalizedMarketplaceProduct[]> {
  const store = await getMarketplaceStoreById(storeId)
  if (!store) throw new MarketplaceError({ message: `Mağaza bulunamadı: ${storeId}`, code: 'NOT_FOUND', provider: 'TRENDYOL' })
  const credential = await getStoreCredentialById(storeId)
  const provider = MarketplaceProviderFactory.getProvider(store, credential ?? undefined)

  const all: NormalizedMarketplaceProduct[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await provider.fetchProducts({ page, size: PAGE_SIZE, approvedOnly: true })
    all.push(...result.products)
    if (!result.hasMore) return all
  }
  throw new MarketplaceError({
    message: `${store.name}: ${MAX_PAGES * PAGE_SIZE} üzerinde aktif ürün var; okuma yarıda kesildi.`,
    code: 'PROVIDER_ERROR',
    provider: store.provider,
  })
}

/**
 * Reads the store's live listings and upserts them. Listings no longer returned are
 * marked archived. Our fields (link, target prices, ignored) are never overwritten;
 * target prices are initialised from the marketplace price on first sight.
 */
export async function refreshStoreListings(storeId: string, adminUserId?: string): Promise<RefreshResult> {
  const products = await fetchAllProducts(storeId)
  const existing = (await db.orm.public.MarketplaceListing.where({ storeId }).all()) as ListingRow[]
  const byBarcode = new Map(existing.map((l) => [l.barcode, l]))
  const now = toDbTimestamp()
  let created = 0
  let updated = 0

  for (const p of products) {
    const barcode = p.externalBarcode!
    const fields = {
      stockCode: p.stockCode ?? null,
      productMainId: p.productMainId ?? null,
      externalId: p.externalProductId,
      title: p.title || barcode,
      brand: p.brand ?? null,
      categoryName: p.categoryName ?? null,
      description: p.description ?? null,
      imageUrls: p.imageUrls ?? [],
      attributes: p.attributes ?? [],
      productUrl: p.productUrl ?? null,
      vatRate: p.vatRate ?? null,
      salePrice: dbNumeric(p.salePrice),
      listPrice: dbNumeric(p.listPrice ?? p.salePrice),
      quantity: Math.max(0, Math.floor(p.stock)),
      onSale: Boolean(p.onSale),
      archived: false,
      lastSeenAt: now,
    }
    const current = byBarcode.get(barcode)
    if (current) {
      await db.orm.public.MarketplaceListing.where({ id: current.id }).update(fields as never)
      byBarcode.delete(barcode)
      updated++
    } else {
      await db.orm.public.MarketplaceListing.create({
        storeId,
        barcode,
        ...fields,
        // A listing at 0 TL (not on sale) has no price worth keeping.
        targetSalePrice: p.salePrice > 0 ? dbNumeric(p.salePrice) : null,
        targetListPrice: p.salePrice > 0 ? dbNumeric(Math.max(p.listPrice ?? 0, p.salePrice)) : null,
      } as never)
      created++
    }
  }

  // Whatever was not returned is no longer live on the marketplace.
  let archived = 0
  for (const gone of byBarcode.values()) {
    if (gone.archived) continue
    await db.orm.public.MarketplaceListing.where({ id: gone.id }).update({ archived: true, onSale: false } as never)
    archived++
  }

  const autoMapped = await autoMapListings()
  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.listings.refreshed',
    entity: 'MarketplaceStore',
    entityId: storeId,
    metadata: { fetched: products.length, created, updated, archived, autoMapped },
  })
  return { storeId, fetched: products.length, created, updated, archived, autoMapped }
}

export async function refreshAllStoreListings(adminUserId?: string): Promise<Array<RefreshResult | { storeId: string; error: string }>> {
  const stores = (await getMarketplaceStores()).filter((s) => s.status === 'ACTIVE' && s.hasCredentials)
  const results: Array<RefreshResult | { storeId: string; error: string }> = []
  for (const store of stores) {
    try {
      results.push(await refreshStoreListings(store.id, adminUserId))
    } catch (err) {
      results.push({ storeId: store.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}

// ─────────────────────────────────────────────────────────────
// Linking
// ─────────────────────────────────────────────────────────────

/**
 * Links unlinked listings by exact rules only, in this order: model code shared with
 * an already linked listing, product barcode, product SKU (= stock code or model code).
 * Returns how many listings were linked.
 */
export async function autoMapListings(): Promise<number> {
  const listings = (await db.orm.public.MarketplaceListing.all()) as ListingRow[]
  const products = await db.orm.public.Product.select('id', 'sku', 'barcode').all()
  const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p.id]))
  const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode!.toLowerCase(), p.id]))
  const byModel = new Map<string, { productId: string; variantId: string | null }>()
  for (const l of listings) {
    if (l.productId && l.productMainId && !byModel.has(l.productMainId)) {
      byModel.set(l.productMainId, { productId: l.productId, variantId: l.variantId })
    }
  }

  let mapped = 0
  for (const l of listings) {
    if (l.productId || l.ignored) continue
    let target: { productId: string; variantId: string | null; method: MatchMethod } | null = null
    const model = l.productMainId ? byModel.get(l.productMainId) : undefined
    if (model) target = { ...model, method: 'MODEL_CODE' }
    else if (byBarcode.has(l.barcode.toLowerCase())) {
      target = { productId: byBarcode.get(l.barcode.toLowerCase())!, variantId: null, method: 'BARCODE' }
    } else {
      const code = [l.stockCode, l.productMainId].find((c) => c && bySku.has(c.toLowerCase()))
      if (code) target = { productId: bySku.get(code.toLowerCase())!, variantId: null, method: 'SKU' }
    }
    if (!target) continue
    await db.orm.public.MarketplaceListing.where({ id: l.id }).update({
      productId: target.productId,
      variantId: target.variantId,
      matchMethod: target.method,
    } as never)
    if (l.productMainId && !byModel.has(l.productMainId)) {
      byModel.set(l.productMainId, { productId: target.productId, variantId: target.variantId })
    }
    mapped++
  }
  return mapped
}

function listingNotFound(id: string): MarketplaceError {
  return new MarketplaceError({ message: `Pazaryeri ürünü bulunamadı: ${id}`, code: 'NOT_FOUND', provider: 'TRENDYOL' })
}

/**
 * Links a listing to a site product (or unlinks with productId = null). With
 * `applyToModel`, every unlinked listing sharing its model code (other stores) gets
 * the same link.
 */
export async function mapListing(
  listingId: string,
  input: { productId: string | null; variantId?: string | null; applyToModel?: boolean },
  adminUserId: string
): Promise<{ updated: number }> {
  const listing = (await db.orm.public.MarketplaceListing.where({ id: listingId }).first()) as ListingRow | null
  if (!listing) throw listingNotFound(listingId)

  let variantId: string | null = null
  if (input.productId) {
    const product = await db.orm.public.Product.where({ id: input.productId }).select('id').first()
    if (!product) {
      throw new MarketplaceError({ message: 'Site ürünü bulunamadı.', code: 'VALIDATION_ERROR', provider: 'TRENDYOL' })
    }
    if (input.variantId) {
      const variant = await db.orm.public.ProductVariant.where({ id: input.variantId, productId: input.productId }).first()
      if (!variant) {
        throw new MarketplaceError({ message: 'Varyant bu ürüne ait değil.', code: 'VALIDATION_ERROR', provider: 'TRENDYOL' })
      }
      variantId = variant.id
    }
  }

  const change = input.productId
    ? { productId: input.productId, variantId, matchMethod: 'MANUAL', ignored: false }
    : { productId: null, variantId: null, matchMethod: null }

  const ids = [listing.id]
  if (input.productId && input.applyToModel !== false && listing.productMainId) {
    const siblings = (await db.orm.public.MarketplaceListing.where({ productMainId: listing.productMainId }).all()) as ListingRow[]
    for (const s of siblings) if (s.id !== listing.id && !s.productId && !s.ignored) ids.push(s.id)
  }
  for (const id of ids) await db.orm.public.MarketplaceListing.where({ id }).update(change as never)

  await logAuditEvent({
    userId: adminUserId,
    action: input.productId ? 'marketplace.mapping.created' : 'marketplace.mapping.deleted',
    entity: 'MarketplaceListing',
    entityId: listing.id,
    metadata: { barcode: listing.barcode, productId: input.productId, variantId, listings: ids.length },
  })
  return { updated: ids.length }
}

export async function setListingIgnored(listingId: string, ignored: boolean, adminUserId: string): Promise<void> {
  const listing = await db.orm.public.MarketplaceListing.where({ id: listingId }).first()
  if (!listing) throw listingNotFound(listingId)
  await db.orm.public.MarketplaceListing.where({ id: listingId }).update(
    (ignored ? { ignored: true, productId: null, variantId: null, matchMethod: null } : { ignored: false }) as never
  )
  await logAuditEvent({
    userId: adminUserId,
    action: ignored ? 'marketplace.listing.ignored' : 'marketplace.listing.unignored',
    entity: 'MarketplaceListing',
    entityId: listingId,
    metadata: { barcode: listing.barcode },
  })
}

/** Store-specific prices pushed to the marketplace (list price never below sale price). */
export async function setListingTargetPrice(
  listingId: string,
  input: { salePrice: number | null; listPrice?: number | null },
  adminUserId: string
): Promise<void> {
  const listing = await db.orm.public.MarketplaceListing.where({ id: listingId }).first()
  if (!listing) throw listingNotFound(listingId)
  const sale = input.salePrice === null ? null : Number(input.salePrice)
  if (sale !== null && (!Number.isFinite(sale) || sale <= 0)) {
    throw new MarketplaceError({ message: 'Satış fiyatı 0’dan büyük olmalıdır.', code: 'VALIDATION_ERROR', provider: 'TRENDYOL' })
  }
  const list = sale === null ? null : Math.max(Number(input.listPrice ?? sale) || sale, sale)
  await db.orm.public.MarketplaceListing.where({ id: listingId }).update({
    targetSalePrice: sale === null ? null : dbNumeric(sale),
    targetListPrice: list === null ? null : dbNumeric(list),
  } as never)
  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.listing.price_set',
    entity: 'MarketplaceListing',
    entityId: listingId,
    metadata: { barcode: listing.barcode, salePrice: sale, listPrice: list },
  })
}

// ─────────────────────────────────────────────────────────────
// Listing view for the admin
// ─────────────────────────────────────────────────────────────

export async function getListings(filters: { storeId?: string; filter?: ListingFilter } = {}): Promise<ListingView[]> {
  const stores = await getMarketplaceStores()
  const storeById = new Map(stores.map((s) => [s.id, s]))
  let rows = (await db.orm.public.MarketplaceListing.where({ archived: false }).all()) as ListingRow[]
  if (filters.storeId) rows = rows.filter((r) => r.storeId === filters.storeId)
  switch (filters.filter) {
    case 'UNMAPPED':
      rows = rows.filter((r) => !r.productId && !r.ignored)
      break
    case 'MAPPED':
      rows = rows.filter((r) => r.productId)
      break
    case 'IGNORED':
      rows = rows.filter((r) => r.ignored)
      break
  }

  const products = await db.orm.public.Product.select('id', 'name', 'sku').all()
  const productById = new Map(products.map((p) => [p.id, p]))

  return rows
    .map((r): ListingView => {
      const store = storeById.get(r.storeId)
      const product = r.productId ? productById.get(r.productId) : undefined
      return {
        id: r.id,
        storeId: r.storeId,
        storeName: store?.name ?? '—',
        provider: store?.provider ?? 'TRENDYOL',
        barcode: r.barcode,
        stockCode: r.stockCode,
        productMainId: r.productMainId,
        title: r.title,
        brand: r.brand,
        categoryName: r.categoryName,
        imageUrl: stringArray(r.imageUrls)[0] ?? null,
        productUrl: r.productUrl,
        salePrice: money(r.salePrice),
        listPrice: money(r.listPrice),
        quantity: r.quantity,
        onSale: r.onSale,
        archived: r.archived,
        lastSeenAt: dbTimestampToIso(r.lastSeenAt),
        productId: r.productId,
        productName: product?.name ?? null,
        productSku: product?.sku ?? null,
        variantId: r.variantId,
        matchMethod: r.matchMethod as MatchMethod | null,
        ignored: r.ignored,
        targetSalePrice: nullableMoney(r.targetSalePrice),
        targetListPrice: nullableMoney(r.targetListPrice),
        suggestions: r.productId || r.ignored ? [] : suggestionsFor(r, products),
      }
    })
    .sort(
      (a, b) =>
        (a.productMainId ?? a.barcode).localeCompare(b.productMainId ?? b.barcode, 'tr') ||
        a.storeName.localeCompare(b.storeName, 'tr')
    )
}

/** Raw linked listings for other services (stock/price push, order matching). */
export async function getLinkedListings(storeId?: string) {
  const rows = (await db.orm.public.MarketplaceListing.where({ archived: false }).all()) as ListingRow[]
  return rows.filter((r) => r.productId && (!storeId || r.storeId === storeId))
}

// ─────────────────────────────────────────────────────────────
// Import listings as site products
// ─────────────────────────────────────────────────────────────

export interface ImportResult {
  created: Array<{ productId: string; name: string; listings: number; images: number }>
  skipped: Array<{ title: string; reason: string }>
  imageWarnings: string[]
}

/**
 * Creates one inactive site product per model code from the selected listings (all
 * stores' listings with that model code get linked). Stock starts at 0 and the site
 * price at the lowest current marketplace price; the admin reviews and activates.
 */
export async function importListingsAsProducts(listingIds: string[], adminUserId: string): Promise<ImportResult> {
  const wanted = new Set(listingIds)
  const all = (await db.orm.public.MarketplaceListing.where({ archived: false }).all()) as ListingRow[]
  const selected = all.filter((l) => wanted.has(l.id))
  const result: ImportResult = { created: [], skipped: [], imageWarnings: [] }

  const groups = new Map<string, ListingRow[]>()
  for (const l of selected) {
    const key = l.productMainId ?? `barcode:${l.barcode}`
    if (!groups.has(key)) groups.set(key, all.filter((x) => (x.productMainId ?? `barcode:${x.barcode}`) === key))
  }

  const categories = await db.orm.public.Category.select('id', 'slug').all()
  const collections = await db.orm.public.Collection.select('slug').all()

  for (const group of groups.values()) {
    const linked = group.find((l) => l.productId)
    const representative = [...group].sort(
      (a, b) =>
        stringArray(b.imageUrls).length - stringArray(a.imageUrls).length ||
        (b.description?.length ?? 0) - (a.description?.length ?? 0)
    )[0]
    if (linked) {
      result.skipped.push({ title: representative.title, reason: 'Zaten bir site ürününe bağlı.' })
      continue
    }

    const images: Array<{ url: string; isPrimary: boolean }> = []
    for (const url of stringArray(representative.imageUrls).slice(0, 8)) {
      const upload = await cloudinaryService.uploadRemoteImage(url, 'zuulab-products/marketplace')
      if (upload.success && upload.url) images.push({ url: upload.url, isPrimary: images.length === 0 })
      else result.imageWarnings.push(`${representative.title}: ${upload.error ?? 'görsel kopyalanamadı'}`)
    }

    const prices = group.map((l) => money(l.salePrice)).filter((p) => p > 0)
    const categorySlug = guessCategorySlug(representative.title, representative.categoryName)
    const category = categories.find((c) => c.slug === categorySlug) ?? categories[0]
    const collectionSlug = guessCollectionSlug(representative.title)
    const description = htmlToText(representative.description)

    try {
      const product = await adminCreateProduct(
        {
          name: representative.title,
          sku: representative.productMainId ?? representative.stockCode ?? representative.barcode,
          description,
          shortDescription: description.split('\n')[0]?.slice(0, 200) ?? '',
          price: prices.length ? Math.min(...prices) : 0,
          stock: 0,
          categoryId: category.id,
          collections: collectionSlug && collections.some((c) => c.slug === collectionSlug) ? [collectionSlug] : [],
          status: 'DRAFT',
          images,
        },
        `marketplace-import:${adminUserId}`
      )
      const attributes = (Array.isArray(representative.attributes) ? representative.attributes : []) as Array<{
        name?: string
        value?: string
      }>
      for (let i = 0; i < attributes.length; i++) {
        const a = attributes[i]
        if (!a.name || !a.value) continue
        await db.orm.public.ProductSpecification.create({
          productId: product.id,
          name: a.name,
          value: a.value,
          sortOrder: i,
        } as never)
      }
      for (const l of group) {
        await db.orm.public.MarketplaceListing.where({ id: l.id }).update({
          productId: product.id,
          variantId: null,
          matchMethod: 'IMPORT',
          ignored: false,
        } as never)
      }
      result.created.push({ productId: product.id, name: product.name, listings: group.length, images: images.length })
    } catch (err) {
      result.skipped.push({ title: representative.title, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  if (result.created.length > 0) invalidateCatalog()
  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.listings.imported',
    entity: 'MarketplaceListing',
    metadata: {
      created: result.created.length,
      skipped: result.skipped.length,
      imageWarnings: result.imageWarnings.length,
    },
  })
  return result
}
