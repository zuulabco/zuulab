'use client'

import { useEffect, useId, useRef, useState } from 'react'
import styles from './Dropdown.module.css'

export interface DropdownOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  /** Accessible name of the control */
  label: string
  /** Small muted text inside the button before the value, e.g. "sırala" */
  prefix?: string
  align?: 'start' | 'end'
  className?: string
  fullWidth?: boolean
}

/**
 * A select replacement in the ZUULAB style: a quiet outlined button that opens a small
 * menu which fades and drops in. Works with mouse, touch and keyboard (arrows, Home/End,
 * Enter/Space, Esc, type-ahead) and is announced as a listbox.
 */
export default function Dropdown<T extends string>({
  value,
  options,
  onChange,
  label,
  prefix,
  align = 'start',
  className,
  fullWidth = false,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const id = useId()

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const selected = options[selectedIndex]

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => {
    if (open) listRef.current?.focus()
  }, [open])

  const openMenu = () => {
    setActive(selectedIndex)
    setOpen(true)
  }

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  const choose = (index: number) => {
    const option = options[index]
    if (option && option.value !== value) onChange(option.value)
    close()
  }

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openMenu()
    }
  }

  const onListKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => Math.min(options.length - 1, i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
        break
      case 'Home':
        e.preventDefault()
        setActive(0)
        break
      case 'End':
        e.preventDefault()
        setActive(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(active)
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'Tab':
        close(false)
        break
      default:
        if (e.key.length === 1) {
          const now = e.timeStamp
          const prev = now - typed.current.at > 600 ? '' : typed.current.text
          typed.current = { text: prev + e.key.toLocaleLowerCase('tr-TR'), at: now }
          const hit = options.findIndex((o) => o.label.toLocaleLowerCase('tr-TR').startsWith(typed.current.text))
          if (hit >= 0) setActive(hit)
        }
    }
  }

  return (
    <div ref={rootRef} className={`${styles.root} ${fullWidth ? styles.full : ''} ${className ?? ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onButtonKey}
      >
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        <span className={styles.value}>{selected?.label}</span>
        <svg className={styles.chevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <ul
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        tabIndex={-1}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        className={`${styles.menu} ${align === 'end' ? styles.menuEnd : ''} ${open ? styles.menuOpen : ''}`}
        onKeyDown={onListKey}
        inert={!open}
      >
        {options.map((o, i) => (
          <li
            key={o.value}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={o.value === value}
            className={`${styles.option} ${i === active ? styles.optionActive : ''}`}
            onPointerEnter={() => setActive(i)}
            onClick={() => choose(i)}
          >
            <span>{o.label}</span>
            {o.value === value && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
