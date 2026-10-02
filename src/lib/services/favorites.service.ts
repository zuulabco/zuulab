import 'server-only'
import { db } from '@/prisma/db'
import { getProductsByIds } from './catalog/catalog.service'

/**
 * Customer favorites, stored in Postgres only. A product can be favorited only if
 * it is live in the catalog; favorites of products that were later deactivated stay
 * stored but are not shown.
 */

function isUniqueViolation(err: unknown): boolean {
  const text = String((err as { message?: string })?.message ?? err) + JSON.stringify(err ?? {})
  return /unique|duplicate key|23505/i.test(text)
}

/**
 * Gets all favorited product IDs for a given user
 */
export async function getUserFavoriteProductIds(userId: string): Promise<string[]> {
  const favs = await db.orm.public.Favorite.where({ userId }).orderBy((f) => f.createdAt.desc()).all()
  return favs.map((f) => f.productId)
}

/** Favorited products that are currently live, newest favorite first. */
export async function getUserFavoriteProducts(userId: string) {
  const ids = await getUserFavoriteProductIds(userId)
  const products = await getProductsByIds(ids)
  const byId = new Map(products.map((p) => [p.id, p]))
  return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
}

/**
 * Adds a product to user favorites (idempotent)
 */
export async function addFavorite(userId: string, productId: string): Promise<boolean> {
  const [product] = await getProductsByIds([productId])
  if (!product) {
    throw new Error('Ürün bulunamadı veya satışta değil.')
  }

  const existing = await db.orm.public.Favorite.where({ userId, productId }).first()
  if (existing) return true

  try {
    await db.orm.public.Favorite.create({ userId, productId })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
  }
  return true
}

/**
 * Removes a product from user favorites
 */
export async function removeFavorite(userId: string, productId: string): Promise<boolean> {
  const existing = await db.orm.public.Favorite.where({ userId, productId }).first()
  if (existing) {
    await db.orm.public.Favorite.where({ id: existing.id }).delete()
  }
  return true
}

/**
 * Merges guest local favorites into the customer's authenticated account
 */
export async function syncLocalFavorites(userId: string, productIds: string[]): Promise<string[]> {
  const unique = [...new Set(productIds)].slice(0, 200)
  const live = await getProductsByIds(unique)
  for (const p of live) {
    await addFavorite(userId, p.id)
  }
  return getUserFavoriteProductIds(userId)
}
