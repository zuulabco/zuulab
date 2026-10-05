'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { matchScore, searchTokens } from '@/lib/admin-search'
import { NAV_SECTIONS, QUICK_ACTIONS } from './nav'

interface Entry {
  group: string
  title: string
  subtitle?: string
  href: string
}

interface ServerGroup {
  key: string
  label: string
  items: Array<{ title: string; subtitle?: string; href: string }>
}

const PAGES = [
  ...NAV_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({ ...item, sectionTitle: section.title ?? '', isAction: false }))
  ),
  ...QUICK_ACTIONS.map((item) => ({ ...item, sectionTitle: 'İşlem', isAction: true })),
]

/** Menu pages and quick actions matching `query`, best first. */
function matchPages(query: string): Entry[] {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return []
  return PAGES.map((page, index) => ({
    page,
    index,
    // The page name counts double, so "iade" ranks İadeler above pages that only mention it
    score:
      matchScore(tokens, [page.label]) * 2 ||
      matchScore(tokens, [page.label, page.sectionTitle, ...(page.keywords ?? '').split(' ')]),
  }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 6)
    .map(({ page }) => ({
      group: 'Sayfalar',
      title: page.label,
      subtitle: page.isAction ? 'İşlem' : page.sectionTitle || 'Genel',
      href: page.href,
    }))
}

/**
 * The top bar quick search: menu pages (by name or related words) as you type,
 * plus records from /api/admin/search. Arrow keys move, Enter opens, Esc closes;
 * Ctrl+K or "/" jumps to the box from anywhere in the panel.
 */
export default function AdminSearch({ token, canFetch }: { token: string | null; canFetch: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const rootRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  // The server's answer and the query it belongs to (an answer to an older query is not shown)
  const [answer, setAnswer] = useState<{ q: string; groups: ServerGroup[]; error: string | null } | null>(null)
  // Highlighted row, for the query it was chosen in (a new query starts at the top)
  const [highlight, setHighlight] = useState({ q: '', index: 0 })
  const [seenPath, setSeenPath] = useState(pathname)

  // Leaving the page clears the search
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setQuery('')
    setOpen(false)
  }

  const trimmed = query.trim()
  const searchesRecords = trimmed.length >= 2 && canFetch
  const current = searchesRecords && answer?.q === trimmed ? answer : null
  const waiting = searchesRecords && !current
  const error = current?.error ?? null
  const active = highlight.q === trimmed ? highlight.index : 0
  const setActive = (index: number) => setHighlight({ q: trimmed, index })

  const pages = useMemo(() => matchPages(trimmed), [trimmed])
  const entries: Entry[] = useMemo(
    () => [...pages, ...(current?.groups ?? []).flatMap((g) => g.items.map((item) => ({ group: g.label, ...item })))],
    [pages, current]
  )

  // Records: debounced; a stale answer is dropped
  useEffect(() => {
    if (!searchesRecords) return
    let isCancelled = false
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json().catch(() => ({}))
        if (isCancelled) return
        setAnswer({
          q: trimmed,
          groups: data.success && Array.isArray(data.groups) ? data.groups : [],
          error: data.success ? null : data.error || 'Arama yapılamadı.',
        })
      } catch {
        if (!isCancelled) setAnswer({ q: trimmed, groups: [], error: 'Arama sırasında bağlantı hatası oluştu.' })
      }
    }, 250)
    return () => {
      isCancelled = true
      clearTimeout(handle)
    }
  }, [trimmed, searchesRecords, token])

  // Ctrl+K / Cmd+K, or "/" outside a text field, focuses the box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A click outside closes the list
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keep the highlighted row in view
  useEffect(() => {
    rootRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (entry: Entry | undefined) => {
    if (!entry) return
    setOpen(false)
    inputRef.current?.blur()
    router.push(entry.href)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive(entries.length ? (active + 1) % entries.length : 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(entries.length ? (active - 1 + entries.length) % entries.length : 0)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showList = open && trimmed.length > 0

  let lastGroup = ''
  return (
    <form
      ref={rootRef}
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        go(entries[active])
      }}
      style={{ position: 'relative', width: 300, maxWidth: '45vw' }}
    >
      <input
        ref={inputRef}
        type="search"
        aria-label="Yönetim panelinde ara"
        aria-expanded={showList}
        aria-controls="admin-search-results"
        aria-activedescendant={showList && entries[active] ? `admin-search-${active}` : undefined}
        role="combobox"
        autoComplete="off"
        placeholder="Ara: sayfa, sipariş, ürün, müşteri… (Ctrl K)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="input input-sm"
        style={{ borderRadius: 'var(--radius-full)', width: '100%' }}
      />
      {showList && (
        <div
          id="admin-search-results"
          role="listbox"
          style={{
            position: 'absolute',
            top: '120%',
            right: 0,
            width: 400,
            maxWidth: '92vw',
            maxHeight: '70vh',
            overflowY: 'auto',
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 6,
            zIndex: 200,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {entries.map((entry, i) => {
            const header = entry.group !== lastGroup ? entry.group : null
            lastGroup = entry.group
            const isActive = i === active
            return (
              <React.Fragment key={`${entry.group}-${entry.href}-${entry.title}-${i}`}>
                {header && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em', padding: '8px 8px 4px', textTransform: 'uppercase' }}>
                    {header}
                  </div>
                )}
                <div
                  id={`admin-search-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(entry)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: isActive ? 'var(--surface-2)' : 'transparent',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.title}
                    </div>
                    {entry.subtitle && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.subtitle}
                      </div>
                    )}
                  </div>
                  {isActive && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }} aria-hidden="true">
                      ↵
                    </span>
                  )}
                </div>
              </React.Fragment>
            )
          })}
          {waiting && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px' }}>Kayıtlarda aranıyor…</div>
          )}
          {error && <div style={{ fontSize: 12, color: '#dc2626', padding: '8px' }}>{error}</div>}
          {!waiting && !error && entries.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px' }}>
              “{trimmed}” için sonuç bulunamadı.
            </div>
          )}
          {trimmed.length === 1 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px 6px' }}>
              Kayıtlarda aramak için en az 2 harf yazın.
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 8px 2px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
            ↑ ↓ ile gezin · Enter ile aç · Esc ile kapat
          </div>
        </div>
      )}
    </form>
  )
}
