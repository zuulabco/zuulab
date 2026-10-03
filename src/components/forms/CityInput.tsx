'use client'

import { useId, useRef, useState } from 'react'
import { matchProvince, suggestProvinces } from '@/lib/geo/tr-provinces'
import styles from './CityInput.module.css'

interface CityInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  /** Class of the surrounding form's text inputs, so the field matches them. */
  inputClassName?: string
  /** Error from the parent's submit check; shown instead of the field's own. */
  error?: string
  placeholder?: string
}

export const CITY_INVALID_MESSAGE = 'Geçerli bir il adı yazın ve listeden seçin.'
export const CITY_REQUIRED_MESSAGE = 'İl alanı zorunludur.'

/** Error for a city field, or '' when it holds a real province. */
export function cityError(value: string): string {
  if (!value.trim()) return CITY_REQUIRED_MESSAGE
  return matchProvince(value) ? '' : CITY_INVALID_MESSAGE
}

/**
 * Province field: free typing with suggestions from all 81 provinces (accent- and
 * case-insensitive, e.g. "izmir" → İzmir). Leaving the field snaps a recognised
 * name to its official spelling and flags anything that is not a province.
 */
export default function CityInput({ id, value, onChange, inputClassName = '', error, placeholder = 'il yazın, ör. Bolu' }: CityInputProps) {
  const listId = useId()
  const errorId = `${id}-error`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [touchedError, setTouchedError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const options = open ? suggestProvinces(value) : []
  const shownError = error || touchedError

  const choose = (name: string) => {
    onChange(name)
    setTouchedError('')
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setActive((i) => Math.min(i + 1, suggestProvinces(value).length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open && active >= 0 && options[active]) {
      // Pick the highlighted province instead of submitting the form
      e.preventDefault()
      choose(options[active])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      setActive(-1)
    }
  }

  const onBlur = () => {
    setOpen(false)
    setActive(-1)
    if (!value.trim()) return // "required" is reported by the submit check
    const match = matchProvince(value)
    if (match) {
      if (match !== value) onChange(match)
      setTouchedError('')
    } else {
      setTouchedError(CITY_INVALID_MESSAGE)
    }
  }

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={Boolean(shownError)}
        aria-describedby={shownError ? errorId : undefined}
        aria-required="true"
        autoComplete="address-level1"
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setTouchedError('')
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className={styles.list}>
          {options.map((name, i) => (
            <li
              key={name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`${styles.option} ${i === active ? styles.optionActive : ''}`}
              // mousedown, not click: runs before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault()
                choose(name)
              }}
              onMouseEnter={() => setActive(i)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
      {shownError && (
        <span id={errorId} className={styles.error} role="alert">
          {shownError}
        </span>
      )}
    </div>
  )
}
