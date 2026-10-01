import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { MOCK_PRODUCTS } from '@/lib/mock-data'

// In-memory fallback for local dev when PostgreSQL is not configured
const inMemoryFavorites: Map<string, Set<string>> = new Map()

/**
 * Gets all favorited product IDs for a given user
 */
export async function getUserFavoriteProductIds(userId: string): Promise<string[]> {
  if (isDatabaseConfigured) {
    try {
      const favs = await db.orm.public.Favorite.where({ userId }).all()
      return favs.map((f) => f.productId)
    } catch (err) {
      console.warn('[favorites.service] DB fetch failed, using fallback:', err)
    }
  }

  const set = inMemoryFavorites.get(userId)
  return set ? Array.from(set) : []
}

/**
 * Adds a product to user favorites (prevents duplicates)
 */
export async function addFavorite(userId: string, productId: string): Promise<boolean> {
  if (isDatabaseConfigured) {
    try {
      const existing = await db.orm.public.Favorite.where({
        userId,
        productId,
      }).first()

      if (!existing) {
        await db.orm.public.Favorite.create({
          userId,
          productId,
        })
      }
      return true
    } catch (err) {
      console.warn('[favorites.service] DB add failed, using fallback:', err)
    }
  }

  if (!inMemoryFavorites.has(userId)) {
    inMemoryFavorites.set(userId, new Set())
  }
  inMemoryFavorites.get(userId)!.add(productId)
  return true
}

/**
 * Removes a product from user favorites
 */
export async function removeFavorite(userId: string, productId: string): Promise<boolean> {
  if (isDatabaseConfigured) {
    try {
      const existing = await db.orm.public.Favorite.where({
        userId,
        productId,
      }).first()

      if (existing) {
        await db.orm.public.Favorite.where({ id: existing.id }).delete()
      }
      return true
    } catch (err) {
      console.warn('[favorites.service] DB remove failed, using fallback:', err)
    }
  }

  const set = inMemoryFavorites.get(userId)
  if (set) {
    set.delete(productId)
  }
  return true
}

/**
 * Merges guest local favorites into the customer's authenticated account
 */
export async function syncLocalFavorites(userId: string, productIds: string[]): Promise<string[]> {
  for (const pid of productIds) {
    // Only add if product actually exists
    const exists = MOCK_PRODUCTS.some((p) => p.id === pid)
    if (exists) {
      await addFavorite(userId, pid)
    }
  }
  return getUserFavoriteProductIds(userId)
}
