'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'

export interface AdminCategoryOption {
  id: string
  name: string
  slug: string
  isActive?: boolean
}

export interface AdminCollectionOption {
  id: string
  name: string
  slug: string
  status?: string
}

/**
 * Categories and collections for admin pickers, read from the database through
 * the admin API, so options created or renamed in the admin appear immediately.
 */
export function useAdminCatalogOptions() {
  const { token, canFetch } = useAuthStore()
  const [categories, setCategories] = useState<AdminCategoryOption[]>([])
  const [collections, setCollections] = useState<AdminCollectionOption[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!canFetch) return
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch('/api/admin/categories', { headers, cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/admin/collections', { headers, cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([cats, cols]) => {
        if (cats.success) setCategories(cats.categories ?? [])
        if (cols.success) setCollections(cols.collections ?? [])
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [canFetch, token])

  return { categories, collections, loaded }
}
