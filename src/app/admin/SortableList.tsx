'use client'

import { useRef, useState } from 'react'
import styles from './SortableList.module.css'

interface Props<T> {
  items: T[]
  getId: (item: T) => string
  /** Called with the new order after a drop or a keyboard move */
  onReorder: (items: T[]) => void
  /** Row content; the drag handle is added on the left */
  renderItem: (item: T, index: number) => React.ReactNode
  /** Accessible name of each row, used for the handle and announcements */
  getLabel: (item: T) => string
  className?: string
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * A list the admin reorders by dragging rows by their handle. Keyboard: focus the
 * handle, press Space to pick the row up, arrows to move it, Space again to drop
 * (Esc cancels). The new position is announced to screen readers.
 */
export default function SortableList<T>({ items, getId, onReorder, renderItem, getLabel, className }: Props<T>) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [liftedId, setLiftedId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const startOrder = useRef<T[] | null>(null)
  const handleRefs = useRef(new Map<string, HTMLButtonElement>())

  const indexOf = (id: string | null) => items.findIndex((i) => getId(i) === id)

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const row = (e.currentTarget as HTMLElement).closest(`.${styles.row}`) as HTMLElement | null
    if (row) e.dataTransfer.setDragImage(row, 24, 20)
  }

  const onDragOver = (e: React.DragEvent, index: number) => {
    if (dragId === null) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    setOverIndex(after ? index + 1 : index)
  }

  const finishDrag = () => {
    const from = indexOf(dragId)
    if (from >= 0 && overIndex !== null) {
      const to = overIndex > from ? overIndex - 1 : overIndex
      if (to !== from) onReorder(move(items, from, to))
    }
    setDragId(null)
    setOverIndex(null)
  }

  const onHandleKey = (e: React.KeyboardEvent, id: string) => {
    const from = indexOf(id)
    const label = getLabel(items[from])
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (liftedId === id) {
        setLiftedId(null)
        startOrder.current = null
        setAnnouncement(`${label} bırakıldı, ${from + 1}. sıra.`)
      } else {
        setLiftedId(id)
        startOrder.current = items
        setAnnouncement(`${label} seçildi. Yukarı ve aşağı oklarla taşıyın, boşlukla bırakın.`)
      }
      return
    }
    if (liftedId !== id) return
    if (e.key === 'Escape') {
      e.preventDefault()
      if (startOrder.current) onReorder(startOrder.current)
      setLiftedId(null)
      setAnnouncement('Taşıma iptal edildi.')
      return
    }
    const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!delta) return
    e.preventDefault()
    const to = from + delta
    if (to < 0 || to >= items.length) return
    onReorder(move(items, from, to))
    setAnnouncement(`${label}: ${to + 1}. sıra`)
    requestAnimationFrame(() => handleRefs.current.get(id)?.focus())
  }

  return (
    <>
      <ul className={`${styles.list} ${className ?? ''}`} onDragEnd={finishDrag} onDrop={(e) => { e.preventDefault(); finishDrag() }}>
        {items.map((item, index) => {
          const id = getId(item)
          const isDragging = dragId === id
          const isLifted = liftedId === id
          return (
            <li
              key={id}
              className={`${styles.row} ${isDragging ? styles.dragging : ''} ${isLifted ? styles.lifted : ''} ${
                overIndex === index && dragId ? styles.dropBefore : ''
              } ${overIndex === index + 1 && index === items.length - 1 && dragId ? styles.dropAfter : ''}`}
              onDragOver={(e) => onDragOver(e, index)}
            >
              <button
                ref={(el) => {
                  if (el) handleRefs.current.set(id, el)
                  else handleRefs.current.delete(id)
                }}
                type="button"
                className={styles.handle}
                draggable
                onDragStart={(e) => onDragStart(e, id)}
                onKeyDown={(e) => onHandleKey(e, id)}
                aria-label={`${getLabel(item)}: sırasını değiştir`}
                aria-pressed={isLifted}
                title="Sürükleyerek taşıyın"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="9" cy="6" r="1.6" />
                  <circle cx="15" cy="6" r="1.6" />
                  <circle cx="9" cy="12" r="1.6" />
                  <circle cx="15" cy="12" r="1.6" />
                  <circle cx="9" cy="18" r="1.6" />
                  <circle cx="15" cy="18" r="1.6" />
                </svg>
              </button>
              <div className={styles.content}>{renderItem(item, index)}</div>
            </li>
          )
        })}
      </ul>
      <p className="sr-only" aria-live="assertive">
        {announcement}
      </p>
    </>
  )
}
