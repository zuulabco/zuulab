'use client'

import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import styles from './ProductCatalog.module.css'

export type GridColumns = 3 | 4 | 5

const KEY = 'zuu-catalog-columns'
const EVENT = 'zuu-catalog-columns'
const OPTIONS: GridColumns[] = [3, 4, 5]

function read(): GridColumns {
  try {
    const n = Number(localStorage.getItem(KEY))
    return n === 3 || n === 5 ? n : 4
  } catch {
    return 4
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** How many products per row the shopper chose (remembered on this device). */
export function useGridColumns(): GridColumns {
  return useSyncExternalStore(subscribe, read, () => 4)
}

/**
 * Changes the column count. Where the browser supports view transitions every card
 * glides to its new place and size; elsewhere the grid simply re-flows.
 */
function setColumns(n: GridColumns) {
  const apply = () => {
    try {
      localStorage.setItem(KEY, String(n))
    } catch {
      // private mode: the choice lasts until reload
    }
    window.dispatchEvent(new Event(EVENT))
  }
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (doc.startViewTransition && !reduced) doc.startViewTransition(() => flushSync(apply))
  else apply()
}

function GridIcon({ cols }: { cols: number }) {
  const w = 18 / cols
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <g key={i}>
          <rect x={i * w + 0.6} y="0.5" width={w - 1.2} height="6" rx="1" fill="currentColor" />
          <rect x={i * w + 0.6} y="7.5" width={w - 1.2} height="6" rx="1" fill="currentColor" />
        </g>
      ))}
    </svg>
  )
}

export default function GridDensity() {
  const current = useGridColumns()
  return (
    <div className={styles.densityGroup} role="radiogroup" aria-label="Satırdaki ürün sayısı">
      {OPTIONS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={`Satırda ${n} ürün`}
          title={`Satırda ${n} ürün`}
          className={styles.densityBtn}
          onClick={() => current !== n && setColumns(n)}
        >
          <GridIcon cols={n} />
        </button>
      ))}
    </div>
  )
}
