import 'server-only'
import type { StoreNavigation } from '@/types/navigation'
import { getCategories } from './catalog.service'
import { getCollectionViews } from './collection-presentation'

/** Menu data for the header and search; follows admin changes via the catalog cache. */
export async function getStoreNavigation(): Promise<StoreNavigation> {
  const [categories, collections] = await Promise.all([getCategories(), getCollectionViews()])
  return {
    categories: categories.map((c) => ({ slug: c.slug, name: c.name, description: c.description })),
    collections: collections.map((c) => ({
      slug: c.slug,
      name: c.name,
      heroImage: c.heroImage,
      accentColor: c.accentColor,
      tagline: c.tagline,
    })),
  }
}
