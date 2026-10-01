'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from '@/lib/mock-data'
import { ALL_COLLECTIONS } from '@/config/collections'
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

const POPULAR_DISCOVERY = {
  collections: [
    { name: 'zuukids', slug: 'zuukids' },
    { name: 'zuulife', slug: 'zuulife' },
    { name: 'zuulight', slug: 'zuulight' },
  ],
  categories: [
    { name: 'Aydınlatmalar', slug: 'aydinlatmalar' },
    { name: 'Figürler', slug: 'figurler' },
    { name: 'Masaüstü & Organizer', slug: 'masaustu-organizer' },
  ],
}

const STORAGE_KEY = 'zuulab_recent_searches'

export default function SearchBar() {
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

  // 1. Filter matching products
  const matchingProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return MOCK_PRODUCTS.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q) ||
        (p.collectionWorld && p.collectionWorld.toLowerCase().includes(q)) ||
        (p.collections && p.collections.some((c) => c.toLowerCase().includes(q))) ||
        p.material.toLowerCase().includes(q) ||
        (p.shortDescription && p.shortDescription.toLowerCase().includes(q))
      )
    }).slice(0, 4)
  }, [query])

  // 2. Filter matching collections
  const matchingCollections = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return ALL_COLLECTIONS.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.tagline && c.tagline.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q))
      )
    }).slice(0, 3)
  }, [query])

  // 3. Filter matching categories
  const matchingCategories = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return MOCK_CATEGORIES.filter((cat) => {
      return (
        cat.name.toLowerCase().includes(q) ||
        cat.slug.toLowerCase().includes(q) ||
        (cat.description && cat.description.toLowerCase().includes(q))
      )
    }).slice(0, 3)
  }, [query])

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
                              {p.images[0] && (
                                <Image
                                  src={p.images[0].url}
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
                            key={cat.id}
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
