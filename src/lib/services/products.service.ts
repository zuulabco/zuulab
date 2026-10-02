import 'server-only'

/**
 * Storefront product reads. Implemented by the cached, database-only catalog
 * (src/lib/services/catalog/catalog.service.ts); kept as the import path the
 * pages and API routes already use.
 */
export {
  getProducts,
  getProductBySlug,
  getProductById,
  getProductsByIds,
  getProductsByCollection,
  getProductsByCategory,
  getBestSellers,
  getCategories,
  getCategoryBySlug,
  getCollections,
  getCollectionBySlug,
  type ProductFilterOptions,
} from './catalog/catalog.service'
