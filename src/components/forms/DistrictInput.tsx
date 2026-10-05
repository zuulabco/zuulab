'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { DISTRICT_INVALID_MESSAGE, DISTRICT_NEEDS_CITY_MESSAGE, districtsOf, matchDistrict, suggestDistricts } from '@/lib/geo/tr-districts'
import styles from './CityInput.module.css'

interface DistrictInputProps {
  id: string
  /** The province chosen above; the districts offered (and accepted) are the ones of this province */
  city: string
  value: string
  onChange: (value: string) => void
  inputClassName?: string
  /** Error from the parent's submit check; shown instead of the field's own. */
  error?: string
  placeholder?: string
}

/**
 * District field: after a province is chosen it offers that province's districts (A–Z, narrowing as you type,
 * accent- and case-insensitive) and only accepts one of them, so a wrong district cannot be sent. Leaving the
 * field snaps a recognised name to its official spelling and flags anything else.
 */
export default function DistrictInput({ id, city, value, onChange, inputClassName = '', error, placeholder }: DistrictInputProps) {
  const listId = useId()
  const errorId = `${id}-error`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [touchedError, setTouchedError] = useState('')
  const hasDistricts = districtsOf(city).length > 0

  const options = open ? suggestDistricts(city, value) : []
  const shownError = error || touchedError

  useEffect(() => {
    if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, listId])

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
      setActive((i) => Math.min(i + 1, suggestDistricts(city, value).length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open && active >= 0 && options[active]) {
      // Pick the highlighted district instead of submitting the form
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
    if (!hasDistricts) {
      setTouchedError(DISTRICT_NEEDS_CITY_MESSAGE)
      return
    }
    const match = matchDistrict(city, value)
    if (match) {
      if (match !== value) onChange(match)
      setTouchedError('')
    } else {
      setTouchedError(DISTRICT_INVALID_MESSAGE)
    }
  }

  return (
    <div className={styles.wrap}>
      <input
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
        autoComplete="address-level2"
        className={inputClassName}
        placeholder={placeholder ?? (hasDistricts ? 'ilçe seçin veya yazın' : 'önce il seçin')}
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
      {open && !hasDistricts && (
        <span className={styles.error} role="status">
          {DISTRICT_NEEDS_CITY_MESSAGE}
        </span>
      )}
      {shownError && (
        <span id={errorId} className={styles.error} role="alert">
          {shownError}
        </span>
      )}
    </div>
  )
}
