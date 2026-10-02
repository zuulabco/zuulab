/** Catalog navigation passed from the store layout (server) to client components. */
export interface NavCategory {
  description: string
  slug: string
  name: string
}

export interface NavCollection {
  slug: string
  name: string
  heroImage: string
  accentColor: string
  tagline: string
}

export interface StoreNavigation {
  categories: NavCategory[]
  collections: NavCollection[]
}
