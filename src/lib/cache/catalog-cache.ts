import 'server-only'
import { revalidateTag } from 'next/cache'

/** Cache tag of the storefront catalog snapshot (catalog.service). */
export const CATALOG_TAG = 'catalog'

/**
 * Call after any admin change to products, categories, collections, images,
 * variants, reviews or stock. Expires immediately, so the next storefront request
 * sees the change instead of one more stale render (the admin expects to see
 * their edit right away).
 */
export function invalidateCatalog(): void {
  try {
    revalidateTag(CATALOG_TAG, { expire: 0 })
  } catch (err) {
    // Outside a request scope (scripts, tests) there is no cache to invalidate.
    console.warn('[catalog-cache] invalidateCatalog skipped:', (err as Error).message)
  }
}

/**
 * Stock moved because of an order. The storefront may show the old number for one
 * more request while it refreshes in the background; checkout always reads stock
 * from the database, so this never lets anyone buy what is not there.
 */
export function refreshCatalogStock(): void {
  try {
    revalidateTag(CATALOG_TAG, 'max')
  } catch (err) {
    console.warn('[catalog-cache] refreshCatalogStock skipped:', (err as Error).message)
  }
}
