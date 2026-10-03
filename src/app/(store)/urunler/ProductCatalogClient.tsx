'use client'

import { useState, useMemo, useEffect, useCallback, useTransition, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { toProductListItem, type CatalogProduct, type CatalogCategory } from '@/types/catalog'
import { CATALOG_COLORS, CATALOG_MATERIALS, getColorDef, extractMaterialSlug } from '@/config/catalog-filters'
import ProductCard from '@/components/home/ProductCard'
import Dropdown from '@/components/common/Dropdown'
import GridDensity, { useGridColumns } from './GridDensity'
import styles from './ProductCatalog.module.css'

interface Props {
  products: CatalogProduct[]
  categories: CatalogCategory[]
  /** Live collections (database), for the collection filter. */
  collections: Array<{ slug: string; name: string }>
  initialCategory?: string
  initialCollection?: string
  /** When true, hides the /urunler editorial intro; category or collection pages pass true */
  hideHeroIntro?: boolean
  /** Category or Collection page: compact header data */
  catalogTitle?: string
  catalogDescription?: string
}

export type SortOption = 'featured' | 'newest' | 'bestseller' | 'favorites' | 'price-asc' | 'price-desc'

export const SORT_LABELS: Record<SortOption, string> = {
  featured: 'önerilen',
  newest: 'yeni ürünler',
  bestseller: 'çok satanlar',
  favorites: 'en çok favorilenenler',
  'price-asc': 'fiyat: düşükten yükseğe',
  'price-desc': 'fiyat: yüksekten düşüğe',
}

const SORT_OPTIONS = (Object.keys(SORT_LABELS) as SortOption[]).map((value) => ({ value, label: SORT_LABELS[value] }))

export const MIN_PRICE = 0
/** Highest value the price inputs accept. No bound is applied until the shopper types one. */
export const PRICE_LIMIT = 100000

/** Parses a price bound from the URL or an input: empty or invalid means "no bound". */
function parsePriceBound(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(n, PRICE_LIMIT)
}

export default function ProductCatalogClient({
  products,
  categories,
  initialCategory = 'all',
  initialCollection = 'all',
  hideHeroIntro = false,
  catalogTitle,
  catalogDescription,
  collections,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // ── URL-derived State (Single Source of Truth) ─────────────
  const isCategoryPage = Boolean(hideHeroIntro && initialCategory && initialCategory !== 'all')
  const isCollectionPage = Boolean(hideHeroIntro && initialCollection && initialCollection !== 'all')

  const selectedCategory = useMemo(() => {
    if (isCategoryPage) return initialCategory
    return searchParams.get('category') || 'all'
  }, [isCategoryPage, initialCategory, searchParams])

  const selectedCollection = useMemo(() => {
    if (isCollectionPage) return initialCollection
    return searchParams.get('collection') || 'all'
  }, [isCollectionPage, initialCollection, searchParams])

  const inStockOnly = useMemo(() => {
    const s = searchParams.get('stock')
    return s === '1' || s === 'true'
  }, [searchParams])

  // null = no bound: every product is listed until the shopper sets a price.
  const minPrice = useMemo(() => {
    const n = parsePriceBound(searchParams.get('minPrice'))
    return n !== null && n > MIN_PRICE ? n : null
  }, [searchParams])

  const maxPrice = useMemo(() => parsePriceBound(searchParams.get('maxPrice')), [searchParams])

  const gridColumns = useGridColumns()

  const sortBy = useMemo(() => {
    const s = searchParams.get('sort') as SortOption
    if (s && s in SORT_LABELS) return s
    return 'featured'
  }, [searchParams])

  const searchQuery = useMemo(() => {
    return (searchParams.get('q') || searchParams.get('arama') || '').trim()
  }, [searchParams])

  /** Active color filters (multi-select) */
  const selectedColors = useMemo(() => {
    const raw = searchParams.get('colors')
    if (!raw) return [] as string[]
    return raw.split(',').filter(Boolean)
  }, [searchParams])

  /** Active material filter (single) */
  const selectedMaterial = useMemo(() => {
    return searchParams.get('material') || 'all'
  }, [searchParams])

  // ── Local Input States (for responsive debounce & typing) ──
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [localMinPrice, setLocalMinPrice] = useState(minPrice?.toString() ?? '')
  const [localMaxPrice, setLocalMaxPrice] = useState(maxPrice?.toString() ?? '')
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  // Accordion open states
  const [categoryOpen, setCategoryOpen] = useState(true)
  const [collectionOpen, setCollectionOpen] = useState(true)
  const [priceOpen, setPriceOpen] = useState(true)
  const [colorOpen, setColorOpen] = useState(true)
  const [materialOpen, setMaterialOpen] = useState(false)
  const [featuresOpen, setFeaturesOpen] = useState(true)

  // Keep local inputs in sync when URL changes (e.g. Back/Forward)
  useEffect(() => { setLocalSearch(searchQuery) }, [searchQuery])
  useEffect(() => { setLocalMinPrice(minPrice?.toString() ?? '') }, [minPrice])
  useEffect(() => { setLocalMaxPrice(maxPrice?.toString() ?? '') }, [maxPrice])

  // ── URL Update Helper ──────────────────────────────────────
  const updateUrl = useCallback(
    (
      newValues: {
        category?: string
        collection?: string
        stock?: boolean
        minPrice?: number | null
        maxPrice?: number | null
        sort?: SortOption
        q?: string
        colors?: string[]
        material?: string
      },
      options: { replace?: boolean; newPathname?: string } = {}
    ) => {
      const nextCategory   = newValues.category   !== undefined ? newValues.category   : selectedCategory
      const nextCollection = newValues.collection !== undefined ? newValues.collection : selectedCollection
      const nextStock      = newValues.stock      !== undefined ? newValues.stock      : inStockOnly
      const nextMin        = newValues.minPrice   !== undefined ? newValues.minPrice   : minPrice
      const nextMax        = newValues.maxPrice   !== undefined ? newValues.maxPrice   : maxPrice
      const nextSort       = newValues.sort       !== undefined ? newValues.sort       : sortBy
      const nextQ          = newValues.q          !== undefined ? newValues.q.trim()   : searchQuery
      const nextColors     = newValues.colors     !== undefined ? newValues.colors     : selectedColors
      const nextMaterial   = newValues.material   !== undefined ? newValues.material   : selectedMaterial

      const params = new URLSearchParams()
      let targetPath = options.newPathname ?? pathname

      if (newValues.category !== undefined && isCategoryPage) {
        if (nextCategory === 'all') {
          targetPath = '/urunler'
        } else {
          targetPath = `/kategori/${nextCategory}`
        }
      } else if (!isCategoryPage && nextCategory !== 'all') {
        params.set('category', nextCategory)
      }

      if (newValues.collection !== undefined && isCollectionPage) {
        if (nextCollection === 'all') {
          targetPath = '/urunler'
        } else {
          targetPath = `/koleksiyon/${nextCollection}`
        }
      } else if (!isCollectionPage && nextCollection !== 'all') {
        params.set('collection', nextCollection)
      }

      if (nextStock) params.set('stock', '1')
      if (nextMin !== null && nextMin > MIN_PRICE) params.set('minPrice', String(nextMin))
      if (nextMax !== null) params.set('maxPrice', String(nextMax))
      if (nextSort && nextSort !== 'featured') params.set('sort', nextSort)
      if (nextQ) params.set('q', nextQ)
      if (nextColors.length > 0) params.set('colors', nextColors.join(','))
      if (nextMaterial && nextMaterial !== 'all') params.set('material', nextMaterial)

      const queryString = params.toString()
      const destination = queryString ? `${targetPath}?${queryString}` : targetPath

      startTransition(() => {
        if (options.replace) {
          router.replace(destination, { scroll: false })
        } else {
          router.push(destination, { scroll: false })
        }
      })
    },
    [
      selectedCategory, selectedCollection, inStockOnly, minPrice, maxPrice,
      sortBy, searchQuery, selectedColors, selectedMaterial,
      pathname, isCategoryPage, isCollectionPage, router,
    ]
  )

  // ── Toggle color (multi-select) ────────────────────────────
  const handleToggleColor = useCallback((slug: string) => {
    const next = selectedColors.includes(slug)
      ? selectedColors.filter((c) => c !== slug)
      : [...selectedColors, slug]
    updateUrl({ colors: next }, { replace: true })
  }, [selectedColors, updateUrl])

  // ── Debounced Search Handling ──────────────────────────────
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const handleSearchChange = (value: string) => {
    setLocalSearch(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      updateUrl({ q: value }, { replace: true })
    }, 250)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    updateUrl({ q: localSearch }, { replace: false })
  }

  const handleClearSearch = () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    setLocalSearch('')
    updateUrl({ q: '' }, { replace: false })
  }

  // ── Debounced Price Handling ───────────────────────────────
  const priceDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const handleMinPriceChange = (value: string) => {
    setLocalMinPrice(value)
    if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current)
    priceDebounceRef.current = setTimeout(() => {
      updateUrl({ minPrice: parsePriceBound(value) }, { replace: true })
    }, 400)
  }

  const handleMaxPriceChange = (value: string) => {
    setLocalMaxPrice(value)
    if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current)
    priceDebounceRef.current = setTimeout(() => {
      updateUrl({ maxPrice: parsePriceBound(value) }, { replace: true })
    }, 400)
  }

  // Handle escape key and body scroll lock for mobile drawer
  useEffect(() => {
    if (!mobileDrawerOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileDrawerOpen(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileDrawerOpen])

  // ── Filter and Sort Products ───────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase()

    return products
      .filter((p) => {
        // Search query filter
        if (q) {
          const matchName = p.name.toLowerCase().includes(q)
          const matchSku = p.sku.toLowerCase().includes(q)
          const matchCat = p.categoryName.toLowerCase().includes(q)
          const matchMaterial = p.material ? p.material.toLowerCase().includes(q) : false
          const matchShortDesc = p.shortDescription ? p.shortDescription.toLowerCase().includes(q) : false
          const matchDesc = p.description ? p.description.toLowerCase().includes(q) : false
          if (!matchName && !matchSku && !matchCat && !matchMaterial && !matchShortDesc && !matchDesc) return false
        }

        // Category filter
        if (selectedCategory !== 'all' && p.categorySlug !== selectedCategory) return false

        // Collection filter
        if (!isCollectionPage && selectedCollection !== 'all') {
          const colls = p.collections || (p.collectionWorld && p.collectionWorld !== 'general' ? [p.collectionWorld] : [])
          if (!colls.includes(selectedCollection)) return false
        }

        // In-stock filter
        if (inStockOnly && p.stock <= 0) return false

        // Price filter
        if (minPrice !== null && p.price < minPrice) return false
        if (maxPrice !== null && p.price > maxPrice) return false

        // Color filter (product must have at least one selected color)
        if (selectedColors.length > 0) {
          const pColors = p.colors || []
          if (!selectedColors.some((c) => pColors.includes(c))) return false
        }

        // Material filter
        if (selectedMaterial !== 'all') {
          const pMatSlug = extractMaterialSlug(p.material)
          if (pMatSlug !== selectedMaterial) return false
        }

        return true
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc')  return a.price - b.price
        if (sortBy === 'price-desc') return b.price - a.price
        if (sortBy === 'newest')     return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
        // Real sales first; the admin's best-seller flag before any sales exist
        if (sortBy === 'bestseller') return (b.soldCount ?? 0) - (a.soldCount ?? 0) || Number(Boolean(b.isBestSeller)) - Number(Boolean(a.isBestSeller))
        if (sortBy === 'favorites')  return (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0) || (b.rating ?? 0) - (a.rating ?? 0)
        return (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0)
      })
  }, [
    products, searchQuery, selectedCategory, selectedCollection, isCollectionPage,
    inStockOnly, minPrice, maxPrice, selectedColors, selectedMaterial, sortBy,
  ])

  // Changes whenever the visible set changes, so the grid replays its fade-in
  const resultKey = useMemo(() => filteredProducts.map((p) => p.id).join('|'), [filteredProducts])

  // ── Derive which colors actually appear in the current product set ─
  const availableColors = useMemo(() => {
    const colorCounts = new Map<string, number>()
    products.forEach((p) => {
      (p.colors || []).forEach((c) => {
        colorCounts.set(c, (colorCounts.get(c) || 0) + 1)
      })
    })
    return CATALOG_COLORS.filter((c) => colorCounts.has(c.slug))
  }, [products])

  // ── Derive which materials actually appear ─────────────────
  const availableMaterials = useMemo(() => {
    const slugSet = new Set<string>()
    products.forEach((p) => {
      const s = extractMaterialSlug(p.material)
      if (s) slugSet.add(s)
    })
    return CATALOG_MATERIALS.filter((m) => slugSet.has(m.slug))
  }, [products])

  // ── Active Filters & Pills ─────────────────────────────────
  const activePills = useMemo(() => {
    const pills: Array<{ label: string; onRemove: () => void }> = []

    if (searchQuery) {
      pills.push({
        label: `"${searchQuery}"`,
        onRemove: () => { setLocalSearch(''); updateUrl({ q: '' }) },
      })
    }

    if (!isCategoryPage && selectedCategory !== 'all') {
      const cat = categories.find((c) => c.slug === selectedCategory)
      pills.push({
        label: cat ? cat.name.toLowerCase() : selectedCategory,
        onRemove: () => updateUrl({ category: 'all' }),
      })
    }

    if (!isCollectionPage && selectedCollection !== 'all') {
      const col = collections.find((c) => c.slug === selectedCollection)
      pills.push({
        label: col ? col.name.toLowerCase() : selectedCollection,
        onRemove: () => updateUrl({ collection: 'all' }),
      })
    }

    if (inStockOnly) {
      pills.push({
        label: 'stokta',
        onRemove: () => updateUrl({ stock: false }),
      })
    }

    if (minPrice !== null || maxPrice !== null) {
      pills.push({
        label:
          minPrice !== null && maxPrice !== null
            ? `₺${minPrice} — ₺${maxPrice}`
            : minPrice !== null
              ? `₺${minPrice} ve üzeri`
              : `₺${maxPrice} ve altı`,
        onRemove: () => {
          setLocalMinPrice('')
          setLocalMaxPrice('')
          updateUrl({ minPrice: null, maxPrice: null })
        },
      })
    }

    selectedColors.forEach((slug) => {
      const def = getColorDef(slug)
      pills.push({
        label: def ? def.label.toLowerCase() : slug,
        onRemove: () => updateUrl({ colors: selectedColors.filter((c) => c !== slug) }),
      })
    })

    if (selectedMaterial !== 'all') {
      const mat = CATALOG_MATERIALS.find((m) => m.slug === selectedMaterial)
      pills.push({
        label: mat ? mat.label : selectedMaterial,
        onRemove: () => updateUrl({ material: 'all' }),
      })
    }

    if (sortBy !== 'featured') {
      pills.push({
        label: SORT_LABELS[sortBy],
        onRemove: () => updateUrl({ sort: 'featured' }),
      })
    }

    return pills
  }, [
    searchQuery, isCategoryPage, selectedCategory, categories,
    isCollectionPage, selectedCollection, inStockOnly, minPrice, maxPrice,
    selectedColors, selectedMaterial, sortBy, updateUrl,
  ])

  const activeFiltersCount = activePills.length

  const handleResetFilters = useCallback(() => {
    setLocalSearch('')
    setLocalMinPrice('')
    setLocalMaxPrice('')
    if (isCategoryPage || isCollectionPage) {
      startTransition(() => router.push(pathname, { scroll: false }))
    } else {
      startTransition(() => router.push('/urunler', { scroll: false }))
    }
  }, [isCategoryPage, isCollectionPage, pathname, router])

  // Chips for the active filters. Always rendered so opening and closing can animate.
  const selectedFilters = (
    <div className={`${styles.pillsPanel} ${activePills.length > 0 ? styles.pillsPanelOpen : ''}`} inert={activePills.length === 0}>
      <div className={styles.groupPanelInner}>
        <div className={styles.activeFiltersRow}>
          {activePills.map((pill) => (
            <span key={pill.label} className={styles.filterPill}>
              {pill.label}
              <button type="button" onClick={pill.onRemove} aria-label={`${pill.label} filtresini kaldır`} className={styles.filterPillRemove}>
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  )

  // ── Filter Panel ───────────────────────────────────────────
  const filterPanel = (
    <div className={styles.filterPanel}>
      <div className={styles.filterHeader}>
        <span className={styles.filterHeading}>Filtreler</span>
        <button
          type="button"
          className={`${styles.filterClearAll} ${activeFiltersCount > 0 ? styles.filterClearAllOn : ''}`}
          onClick={handleResetFilters}
          tabIndex={activeFiltersCount > 0 ? 0 : -1}
          aria-hidden={activeFiltersCount === 0}
        >
          tümünü temizle
        </button>
      </div>
      <div className={styles.sidebarPills}>{selectedFilters}</div>

      {/* ── Kategori ── */}
      <div className={styles.filterGroup}>
        <button
          type="button"
          className={styles.filterGroupToggle}
          onClick={() => setCategoryOpen(!categoryOpen)}
          aria-expanded={categoryOpen}
        >
          <span>Kategori</span>
          <AccordionIcon open={categoryOpen} />
        </button>
        <div className={`${styles.groupPanel} ${categoryOpen ? styles.groupPanelOpen : ''}`} inert={!categoryOpen}>
          <div className={styles.groupPanelInner}>
              <div className={styles.filterGroupBody}>
                {!isCategoryPage && (
                  <label className={styles.filterRadioLabel}>
                    <input
                      type="radio"
                      name="catalog-category"
                      className={styles.filterRadio}
                      checked={selectedCategory === 'all'}
                      onChange={() => updateUrl({ category: 'all' })}
                    />
                    <span className={styles.filterRadioText}>tüm kategoriler</span>
                    <span className={styles.filterCount}>{products.length}</span>
                  </label>
                )}
                {categories.map((c) => {
                  const count = products.filter((p) => p.categorySlug === c.slug).length
                  return (
                    <label key={c.id} className={styles.filterRadioLabel}>
                      <input
                        type="radio"
                        name="catalog-category"
                        className={styles.filterRadio}
                        checked={selectedCategory === c.slug}
                        onChange={() => updateUrl({ category: c.slug })}
                      />
                      <span className={styles.filterRadioText}>{c.name}</span>
                      <span className={styles.filterCount}>{count}</span>
                    </label>
                  )
                })}
              </div>
          </div>
        </div>
      </div>

      <div className={styles.filterDivider} />

      {/* ── Koleksiyon ── */}
      {!isCollectionPage && (
        <>
          <div className={styles.filterGroup}>
            <button
              type="button"
              className={styles.filterGroupToggle}
              onClick={() => setCollectionOpen(!collectionOpen)}
              aria-expanded={collectionOpen}
            >
              <span>Koleksiyon</span>
              <AccordionIcon open={collectionOpen} />
            </button>
            <div className={`${styles.groupPanel} ${collectionOpen ? styles.groupPanelOpen : ''}`} inert={!collectionOpen}>
              <div className={styles.groupPanelInner}>
                  <div className={styles.filterGroupBody} role="radiogroup" aria-label="Koleksiyon Filtresi">
                    {/* Tüm koleksiyonlar */}
                    <label
                      className={`${styles.filterRadioLabel} ${selectedCollection === 'all' ? styles.filterRadioLabelActive : ''}`}
                      onClick={(e) => {
                        e.preventDefault()
                        updateUrl({ collection: 'all' })
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          updateUrl({ collection: 'all' })
                        }
                      }}
                    >
                      <input
                        type="radio"
                        name="catalog-collection"
                        className={styles.filterRadio}
                        checked={selectedCollection === 'all'}
                        readOnly
                        tabIndex={-1}
                      />
                      <span className={styles.filterRadioText}>tüm koleksiyonlar</span>
                      <span className={styles.filterCount}>{products.length}</span>
                    </label>
    
                    {/* Individual distinct collections */}
                    {collections.map((c) => {
                      const count = products.filter((p) => {
                        const colls = p.collections || (p.collectionWorld && p.collectionWorld !== 'general' ? [p.collectionWorld] : [])
                        return colls.includes(c.slug)
                      }).length
                      const isChecked = selectedCollection === c.slug
                      return (
                        <label
                          key={c.slug}
                          className={`${styles.filterRadioLabel} ${isChecked ? styles.filterRadioLabelActive : ''}`}
                          onClick={(e) => {
                            e.preventDefault()
                            // Toggle-off: if already checked, revert to 'all' (clears collection param); otherwise select c.slug
                            updateUrl({ collection: isChecked ? 'all' : c.slug })
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault()
                              updateUrl({ collection: isChecked ? 'all' : c.slug })
                            }
                          }}
                        >
                          <input
                            type="radio"
                            name="catalog-collection"
                            className={styles.filterRadio}
                            checked={isChecked}
                            readOnly
                            tabIndex={-1}
                          />
                          <span className={styles.filterRadioText}>{c.name}</span>
                          <span className={styles.filterCount}>{count}</span>
                        </label>
                      )
                    })}
                  </div>
              </div>
            </div>
          </div>
          <div className={styles.filterDivider} />
        </>
      )}

      {/* ── Renk ── */}
      {availableColors.length > 0 && (
        <>
          <div className={styles.filterGroup}>
            <button
              type="button"
              className={styles.filterGroupToggle}
              onClick={() => setColorOpen(!colorOpen)}
              aria-expanded={colorOpen}
            >
              <span>Renk</span>
              {selectedColors.length > 0 && (
                <span className={styles.filterGroupCount}>{selectedColors.length}</span>
              )}
              <AccordionIcon open={colorOpen} />
            </button>
            <div className={`${styles.groupPanel} ${colorOpen ? styles.groupPanelOpen : ''}`} inert={!colorOpen}>
              <div className={styles.groupPanelInner}>
                  <div className={styles.filterGroupBody}>
                    <div className={styles.colorSwatchGrid}>
                      {availableColors.map((colorDef) => {
                        const isActive = selectedColors.includes(colorDef.slug)
                        return (
                          <button
                            key={colorDef.slug}
                            type="button"
                            className={`${styles.colorSwatch} ${isActive ? styles.colorSwatchActive : ''}`}
                            style={{
                              '--swatch-color': colorDef.hex,
                              '--swatch-border': colorDef.border ?? colorDef.hex,
                            } as React.CSSProperties}
                            title={colorDef.label}
                            aria-label={`${colorDef.label}${isActive ? ' (seçili)' : ''}`}
                            aria-pressed={isActive}
                            onClick={() => handleToggleColor(colorDef.slug)}
                          />
                        )
                      })}
                    </div>
                    {selectedColors.length > 0 && (
                      <button
                        type="button"
                        className={styles.filterClearAll}
                        style={{ marginTop: 8 }}
                        onClick={() => updateUrl({ colors: [] })}
                      >
                        renkleri temizle
                      </button>
                    )}
                  </div>
              </div>
            </div>
          </div>
          <div className={styles.filterDivider} />
        </>
      )}

      {/* ── Malzeme ── */}
      {availableMaterials.length > 0 && (
        <>
          <div className={styles.filterGroup}>
            <button
              type="button"
              className={styles.filterGroupToggle}
              onClick={() => setMaterialOpen(!materialOpen)}
              aria-expanded={materialOpen}
            >
              <span>Malzeme</span>
              <AccordionIcon open={materialOpen} />
            </button>
            <div className={`${styles.groupPanel} ${materialOpen ? styles.groupPanelOpen : ''}`} inert={!materialOpen}>
              <div className={styles.groupPanelInner}>
                  <div className={styles.filterGroupBody}>
                    <label className={styles.filterRadioLabel}>
                      <input
                        type="radio"
                        name="catalog-material"
                        className={styles.filterRadio}
                        checked={selectedMaterial === 'all'}
                        onChange={() => updateUrl({ material: 'all' })}
                      />
                      <span className={styles.filterRadioText}>tüm malzemeler</span>
                    </label>
                    {availableMaterials.map((mat) => {
                      const count = products.filter((p) => extractMaterialSlug(p.material) === mat.slug).length
                      return (
                        <label key={mat.slug} className={styles.filterRadioLabel}>
                          <input
                            type="radio"
                            name="catalog-material"
                            className={styles.filterRadio}
                            checked={selectedMaterial === mat.slug}
                            onChange={() => updateUrl({ material: mat.slug })}
                          />
                          <span className={styles.filterRadioText}>{mat.label}</span>
                          <span className={styles.filterCount}>{count}</span>
                        </label>
                      )
                    })}
                  </div>
              </div>
            </div>
          </div>
          <div className={styles.filterDivider} />
        </>
      )}

      {/* ── Fiyat Aralığı ── */}
      <div className={styles.filterGroup}>
        <button
          type="button"
          className={styles.filterGroupToggle}
          onClick={() => setPriceOpen(!priceOpen)}
          aria-expanded={priceOpen}
        >
          <span>Fiyat Aralığı</span>
          <AccordionIcon open={priceOpen} />
        </button>
        <div className={`${styles.groupPanel} ${priceOpen ? styles.groupPanelOpen : ''}`} inert={!priceOpen}>
          <div className={styles.groupPanelInner}>
              <div className={styles.filterGroupBody}>
                <div className={styles.priceInputRow}>
                  <div className={styles.priceInputWrap}>
                    <span className={styles.priceInputPrefix}>₺</span>
                    <input
                      type="number"
                      className={styles.priceInput}
                      inputMode="numeric"
                      value={localMinPrice}
                      min={MIN_PRICE}
                      max={PRICE_LIMIT}
                      step={1}
                      onChange={(e) => handleMinPriceChange(e.target.value)}
                      onBlur={() => updateUrl({ minPrice: parsePriceBound(localMinPrice) })}
                      aria-label="Minimum fiyat"
                      placeholder="0"
                    />
                  </div>
                  <span className={styles.priceRangeSep}>—</span>
                  <div className={styles.priceInputWrap}>
                    <span className={styles.priceInputPrefix}>₺</span>
                    <input
                      type="number"
                      className={styles.priceInput}
                      inputMode="numeric"
                      value={localMaxPrice}
                      min={MIN_PRICE}
                      max={PRICE_LIMIT}
                      step={1}
                      onChange={(e) => handleMaxPriceChange(e.target.value)}
                      onBlur={() => updateUrl({ maxPrice: parsePriceBound(localMaxPrice) })}
                      aria-label="Maksimum fiyat"
                      placeholder="1000"
                    />
                  </div>
                </div>
              </div>
          </div>
        </div>
      </div>

      <div className={styles.filterDivider} />

      {/* ── Özellikler ── */}
      <div className={styles.filterGroup}>
        <button
          type="button"
          className={styles.filterGroupToggle}
          onClick={() => setFeaturesOpen(!featuresOpen)}
          aria-expanded={featuresOpen}
        >
          <span>Özellikler</span>
          <AccordionIcon open={featuresOpen} />
        </button>
        <div className={`${styles.groupPanel} ${featuresOpen ? styles.groupPanelOpen : ''}`} inert={!featuresOpen}>
          <div className={styles.groupPanelInner}>
              <div className={styles.filterGroupBody}>
                <label className={styles.filterCheckLabel}>
                  <input
                    type="checkbox"
                    className={styles.filterCheck}
                    checked={inStockOnly}
                    onChange={(e) => updateUrl({ stock: e.target.checked })}
                  />
                  <span className={styles.filterCheckText}>yalnızca stokta olanlar</span>
                </label>
              </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className={styles.catalogRoot} id="urunler">
      {/* ── Catalog Header ─────────────────────────────────── */}
      <div className={styles.catalogHeader}>
        <div className={styles.catalogTitleRow}>
          <div>
            {!hideHeroIntro ? (
              <>
                <h1 className={styles.catalogTitle}>ürünler</h1>
                <p className={styles.catalogSubtitle}>
                  biyo-bozunur pla ile üretilmiş 3d tasarım objeleri
                </p>
              </>
            ) : (
              <>
                <h1 className={styles.catalogTitle}>{catalogTitle ?? ''}</h1>
                {catalogDescription && (
                  <p className={styles.catalogSubtitle}>{catalogDescription}</p>
                )}
              </>
            )}
          </div>

          <div className={styles.headerRight}>
            {/* In-Catalog Search Bar */}
            <form onSubmit={handleSearchSubmit} className={styles.catalogSearchWrap}>
              <span className={styles.catalogSearchIcon} aria-hidden>
                <SearchIcon />
              </span>
              <input
                type="search"
                value={localSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="ürün veya malzeme ara…"
                className={styles.catalogSearchInput}
                autoComplete="off"
                spellCheck={false}
                aria-label="Katalogda ara"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className={styles.catalogSearchClear}
                  aria-label="Aramayı temizle"
                >
                  <XIcon />
                </button>
              )}
            </form>

            <span className={styles.resultCount}>
              {searchQuery ? `"${searchQuery}" · ` : ''}
              {filteredProducts.length} ürün
            </span>

            <GridDensity />

            {/* Desktop Sort Dropdown */}
            <div className={styles.sortWrap}>
              <Dropdown
                label="Sırala"
                prefix="sırala"
                align="end"
                value={sortBy}
                options={SORT_OPTIONS}
                onChange={(sort) => updateUrl({ sort })}
              />
            </div>
          </div>
        </div>

        {/* Selected filters (phones; on wide screens they sit in the sidebar) */}
        <div className={styles.mobilePills}>{selectedFilters}</div>

        {/* Mobile Toolbar */}
        <div className={styles.mobileToolbar}>
          <button
            type="button"
            className={styles.mobileFilterBtn}
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Filtreleri aç"
            aria-expanded={mobileDrawerOpen}
          >
            <FilterIcon />
            filtrele
            {activeFiltersCount > 0 && (
              <span className={styles.mobileBadge}>{activeFiltersCount}</span>
            )}
          </button>
          <div className={styles.mobileSortWrap}>
            <Dropdown
              label="Sırala"
              align="end"
              fullWidth
              value={sortBy}
              options={SORT_OPTIONS}
              onChange={(sort) => updateUrl({ sort })}
            />
          </div>
        </div>
      </div>

      {/* ── Catalog Body: Sidebar + Grid ──────────────────── */}
      <div className={styles.catalogBody}>
        {/* Desktop Sidebar */}
        <aside className={styles.sidebar} aria-label="Filtreler">
          {filterPanel}
        </aside>

        {/* Product Grid Area */}
        <div className={`${styles.gridArea} ${isPending ? styles.isPending : ''}`}>
          {filteredProducts.length > 0 ? (
            <div
              key={resultKey}
              className={`${styles.grid} ${styles.gridEnter}`}
              style={{ ['--cols' as string]: gridColumns }}
            >
              {filteredProducts.map((p, index) => (
                // Each card is named so a column change can animate it to its new place
                <div
                  key={p.id}
                  className={styles.gridCell}
                  style={{ viewTransitionName: `pc-${p.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`, ['--i' as string]: Math.min(index, 11) }}
                >
                  <ProductCard product={toProductListItem(p)} priority={index < 4} />
                </div>
              ))}
            </div>
          ) : searchQuery ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyBadge}>sonuç yok</span>
              <p className={styles.emptyTitle}>&ldquo;{searchQuery}&rdquo; ile eşleşen ürün bulunamadı.</p>
              <p className={styles.emptyDesc}>
                arama terimini sadeleştirebilir veya tüm kataloğa göz atabilirsin.
              </p>
              <button type="button" className={styles.emptyResetBtn} onClick={handleClearSearch}>
                tüm ürünleri gör
              </button>
              <div className={styles.emptySuggestions}>
                <span className={styles.emptySuggestionsLabel}>bunları deneyebilirsiniz</span>
                <div className={styles.emptySuggestionsPills}>
                  <button type="button" className={styles.emptyPill} onClick={() => updateUrl({ q: '', collection: 'zuukids' })}>
                    zuukids
                  </button>
                  <button type="button" className={styles.emptyPill} onClick={() => updateUrl({ q: '', collection: 'zuulife' })}>
                    zuulife
                  </button>
                  <button type="button" className={styles.emptyPill} onClick={() => updateUrl({ q: '', collection: 'zuulight' })}>
                    zuulight
                  </button>
                  <button type="button" className={styles.emptyPill} onClick={() => updateUrl({ q: '', category: 'aydinlatmalar' })}>
                    aydınlatmalar
                  </button>
                  <button type="button" className={styles.emptyPill} onClick={() => updateUrl({ q: '', category: 'figurler' })}>
                    figürler
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyBadge}>sonuç yok</span>
              <p className={styles.emptyTitle}>bu filtrelerle eşleşen ürün bulunamadı.</p>
              <p className={styles.emptyDesc}>
                {catalogTitle ? `${catalogTitle} içinde ` : ''}seçtiğin filtre kriterlerini kaldırarak daha fazla tasarım görebilirsin.
              </p>
              <button type="button" className={styles.emptyResetBtn} onClick={handleResetFilters}>
                filtreleri temizle
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile Filter Drawer ───────────────────────────── */}
      {mobileDrawerOpen && (
        <div
          className={styles.drawerOverlay}
          onClick={() => setMobileDrawerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Filtreler"
        >
          <div className={styles.drawerSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <span className={styles.drawerTitle}>filtreler</span>
              <button
                type="button"
                className={styles.drawerCloseBtn}
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Kapat"
              >
                <XIcon />
              </button>
            </div>
            <div className={styles.drawerBody}>{filterPanel}</div>
            <div className={styles.drawerFooter}>
              <button
                type="button"
                className={styles.drawerResetBtn}
                onClick={() => { handleResetFilters(); setMobileDrawerOpen(false) }}
              >
                sıfırla
              </button>
              <button
                type="button"
                className={styles.drawerApplyBtn}
                onClick={() => setMobileDrawerOpen(false)}
              >
                sonuçları gör ({filteredProducts.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Fallback skeleton component for Next.js Suspense boundary */
export function ProductCatalogSkeleton() {
  return (
    <div className={styles.catalogRoot}>
      <div className={styles.catalogHeader}>
        <div className={styles.catalogTitleRow}>
          <div>
            <div style={{ width: 140, height: 32, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', marginBottom: 8 }} />
            <div style={{ width: 240, height: 16, background: 'var(--surface-2)', borderRadius: 'var(--radius-xs)' }} />
          </div>
        </div>
      </div>
      <div className={styles.grid}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={styles.skeletonCard}>
            <div className={styles.skeletonImg} />
            <div className={styles.skeletonMeta}>
              <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
              <div className={`${styles.skeletonLine} ${styles.skeletonLineTiny}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AccordionIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      aria-hidden
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform var(--dur-slow) var(--ease-default)',
        flexShrink: 0,
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
