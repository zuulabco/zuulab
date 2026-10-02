'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { StoreNavigation } from '@/types/navigation'
import { formatPrice } from '@/lib/utils'
import styles from './SearchBar.module.css'

const SUGGESTED_QUERIES = [
  'mini dinozor',
  'kulaklık standı',
  'ay lambası',
  'masa düzenleyici',
  'spiral vazo',
  'toptan stand',
]

interface SearchProduct {
  id: string
  slug: string
  name: string
  price: number
  categoryName: string
  image: string | null
}

/** Lowercase, Turkish-aware, accent-free; mirrors the server's search normalisation. */
function normalize(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const STORAGE_KEY = 'zuulab_recent_searches'

export default function SearchBar({ navigation }: { navigation: StoreNavigation }) {
  // Discovery shortcuts follow the live catalog navigation.
  const POPULAR_DISCOVERY = {
    collections: navigation.collections.slice(0, 3),
    categories: navigation.categories.slice(0, 3),
  }
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setRecentSearches(JSON.parse(stored).slice(0, 4))
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  // Body scroll lock when search modal is open
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  const saveRecentSearch = (term: string) => {
    const trimmed = term.trim().toLowerCase()
    if (!trimmed) return
    const updated = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(0, 4)
    setRecentSearches(updated)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // Ignore storage errors
    }
  }

  const openSearch = useCallback(() => {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const closeSearch = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    saveRecentSearch(q)
    router.push(`/urunler?q=${encodeURIComponent(q)}`)
    closeSearch()
  }

  const handleSelectQuery = (term: string) => {
    saveRecentSearch(term)
    router.push(`/urunler?q=${encodeURIComponent(term)}`)
    closeSearch()
  }

  // 1. Matching products come from the server (database catalog), debounced.
  const [productResults, setProductResults] = useState<{ q: string; items: SearchProduct[] }>({ q: '', items: [] })
  const trimmedQuery = query.trim()
  // Only show results that belong to the current query.
  const matchingProducts = trimmedQuery.length >= 2 && productResults.q === trimmedQuery ? productResults.items : []
  useEffect(() => {
    const q = trimmedQuery
    if (q.length < 2) return
    const controller = new AbortController()
    const handle = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setProductResults({ q, items: data.success ? (data.products as SearchProduct[]).slice(0, 4) : [] }))
        .catch(() => {})
    }, 200)
    return () => {
      clearTimeout(handle)
      controller.abort()
    }
  }, [trimmedQuery])

  // 2. Matching collections (from the live navigation)
  const matchingCollections = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return []
    return navigation.collections
      .filter((c) => normalize(`${c.name} ${c.slug} ${c.tagline}`).includes(q))
      .slice(0, 3)
  }, [query, navigation.collections])

  // 3. Matching categories (from the live navigation)
  const matchingCategories = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return []
    return navigation.categories
      .filter((cat) => normalize(`${cat.name} ${cat.slug}`).includes(q))
      .slice(0, 3)
  }, [query, navigation.categories])

  const totalMatches = matchingProducts.length + matchingCollections.length + matchingCategories.length

  // Keyboard shortcut: / or CMD+K to open search, Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch()
      if (
        (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (document.activeElement as HTMLElement)?.tagName
        )
      ) {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSearch, closeSearch])

  return (
    <>
      <button
        className={`btn btn-ghost btn-icon ${styles.trigger}`}
        onClick={openSearch}
        aria-label="Arama"
        id="search-trigger"
      >
        <SearchIcon />
      </button>

      {open && (
        <>
          <div className={styles.overlay} onClick={closeSearch} aria-hidden />
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Ürün Arama">
            {/* Search Input Bar */}
            <form onSubmit={handleSubmit} className={styles.form}>
              <span className={styles.icon} aria-hidden>
                <SearchIcon />
              </span>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="tasarım, model, sku veya malzeme ara…"
                className={styles.input}
                autoComplete="off"
                spellCheck={false}
                id="search-input"
              />
              {query && (
                <button
                  type="button"
                  className={styles.clear}
                  onClick={() => setQuery('')}
                  aria-label="Aramayı temizle"
                >
                  <XIcon />
                </button>
              )}
              <kbd className={styles.kbd}>ESC</kbd>
            </form>

            {/* Results & Suggestions Dropdown Body */}
            <div className={styles.dropdownBody}>
              {/* If query has matches (3-tier hierarchy) */}
              {query.trim() && totalMatches > 0 && (
                <div className={styles.resultsContainer}>
                  {/* Tier 1: Products */}
                  {matchingProducts.length > 0 && (
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionLabel}>ürünler ({matchingProducts.length})</span>
                      </div>
                      <div className={styles.productList}>
                        {matchingProducts.map((p) => (
                          <Link
                            key={p.id}
                            href={`/urun/${p.slug}`}
                            className={styles.productItem}
                            onClick={() => {
                              saveRecentSearch(p.name)
                              closeSearch()
                            }}
                          >
                            <div className={styles.productThumb}>
                              {p.image && (
                                <Image
                                  src={p.image}
                                  alt={p.name}
                                  fill
                                  sizes="48px"
                                  className={styles.thumbImg}
                                />
                              )}
                            </div>
                            <div className={styles.productInfo}>
                              <span className={styles.productCat}>{p.categoryName}</span>
                              <span className={styles.productTitle}>{p.name.toLowerCase()}</span>
                              <span className={styles.productPrice}>{formatPrice(p.price)}</span>
                            </div>
                            <span className={styles.itemArrow}>→</span>
                          </Link>
                        ))}
                      </div>

                      <button
                        type="button"
                        className={styles.viewAllBtn}
                        onClick={handleSubmit}
                      >
                        tüm &ldquo;{query}&rdquo; ürün sonuçlarını gör →
                      </button>
                    </div>
                  )}

                  {/* Tier 2: Collections */}
                  {matchingCollections.length > 0 && (
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionLabel}>koleksiyonlar ({matchingCollections.length})</span>
                      </div>
                      <div className={styles.entityList}>
                        {matchingCollections.map((col) => (
                          <Link
                            key={col.slug}
                            href={col.slug === 'koleksiyonlar' ? '/koleksiyonlar' : `/koleksiyon/${col.slug}`}
                            className={styles.entityItem}
                            onClick={() => {
                              saveRecentSearch(col.name)
                              closeSearch()
                            }}
                          >
                            <div className={styles.entityInfo}>
                              <div className={styles.entityTitleRow}>
                                <span className={styles.entityBadge}>koleksiyon</span>
                                <span className={styles.entityTitle}>{col.name}</span>
                              </div>
                              {col.tagline && (
                                <span className={styles.entityDesc}>{col.tagline}</span>
                              )}
                            </div>
                            <span className={styles.itemArrow}>→</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tier 3: Categories */}
                  {matchingCategories.length > 0 && (
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionLabel}>kategoriler ({matchingCategories.length})</span>
                      </div>
                      <div className={styles.entityList}>
                        {matchingCategories.map((cat) => (
                          <Link
                            key={cat.slug}
                            href={`/kategori/${cat.slug}`}
                            className={styles.entityItem}
                            onClick={() => {
                              saveRecentSearch(cat.name)
                              closeSearch()
                            }}
                          >
                            <div className={styles.entityInfo}>
                              <div className={styles.entityTitleRow}>
                                <span className={styles.entityBadge}>kategori</span>
                                <span className={styles.entityTitle}>{cat.name}</span>
                              </div>
                              {cat.description && (
                                <span className={styles.entityDesc}>{cat.description}</span>
                              )}
                            </div>
                            <span className={styles.itemArrow}>→</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* If query has NO matches across all 3 tiers */}
              {query.trim() && totalMatches === 0 && (
                <div className={styles.noResults}>
                  <p className={styles.noResultsTitle}>&ldquo;{query}&rdquo; ile eşleşen sonuç bulunamadı</p>
                  <p className={styles.noResultsHint}>
                    farklı bir anahtar kelime deneyebilir veya aşağıdaki önerilen kategorileri ve koleksiyonları keşfedebilirsiniz.
                  </p>

                  <div className={styles.discoveryBlock}>
                    <span className={styles.discoveryLabel}>bunları deneyebilirsiniz</span>
                    <div className={styles.discoveryPills}>
                      {POPULAR_DISCOVERY.collections.map((col) => (
                        <Link
                          key={col.slug}
                          href={`/koleksiyon/${col.slug}`}
                          className={styles.discoveryPill}
                          onClick={closeSearch}
                        >
                          {col.name}
                        </Link>
                      ))}
                      {POPULAR_DISCOVERY.categories.map((cat) => (
                        <Link
                          key={cat.slug}
                          href={`/kategori/${cat.slug}`}
                          className={styles.discoveryPill}
                          onClick={closeSearch}
                        >
                          {cat.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Suggestions and Recents (shown when empty input) */}
              {!query.trim() && (
                <div className={styles.hintsSection}>
                  {/* Recent searches */}
                  {recentSearches.length > 0 && (
                    <div className={styles.hintBlock}>
                      <div className={styles.hintHeader}>
                        <span className={styles.sectionLabel}>son aramalar</span>
                        <button
                          type="button"
                          className={styles.clearRecentsBtn}
                          onClick={() => {
                            setRecentSearches([])
                            try {
                              localStorage.removeItem(STORAGE_KEY)
                            } catch {}
                          }}
                        >
                          temizle
                        </button>
                      </div>
                      <div className={styles.pillList}>
                        {recentSearches.map((term, i) => (
                          <button
                            key={i}
                            type="button"
                            className={styles.queryPill}
                            onClick={() => handleSelectQuery(term)}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span>{term}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested keywords */}
                  <div className={styles.hintBlock}>
                    <span className={styles.sectionLabel}>önerilen aramalar</span>
                    <div className={styles.pillList}>
                      {SUGGESTED_QUERIES.map((term, i) => (
                        <button
                          key={i}
                          type="button"
                          className={styles.queryPill}
                          onClick={() => handleSelectQuery(term)}
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fast discovery */}
                  <div className={styles.hintBlock}>
                    <span className={styles.sectionLabel}>hızlı keşif</span>
                    <div className={styles.pillList}>
                      {POPULAR_DISCOVERY.collections.map((col) => (
                        <Link
                          key={col.slug}
                          href={`/koleksiyon/${col.slug}`}
                          className={styles.discoveryPill}
                          onClick={closeSearch}
                        >
                          {col.name}
                        </Link>
                      ))}
                      {POPULAR_DISCOVERY.categories.map((cat) => (
                        <Link
                          key={cat.slug}
                          href={`/kategori/${cat.slug}`}
                          className={styles.discoveryPill}
                          onClick={closeSearch}
                        >
                          {cat.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
