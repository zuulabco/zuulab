'use client'

import { postalCodesFor } from '@/lib/geo/tr-districts'
import styles from './PostalCodeInput.module.css'

interface PostalCodeInputProps {
  id: string
  city: string
  district: string
  value: string
  onChange: (value: string) => void
  inputClassName?: string
  error?: string
}

/**
 * Postal code field: digits only (5), with the codes used in the chosen district offered as one-tap choices.
 * Postal codes belong to neighbourhoods, so a district can have several; the first is filled in when the district
 * is chosen and the customer can pick another or type their own.
 */
export default function PostalCodeInput({ id, city, district, value, onChange, inputClassName = '', error }: PostalCodeInputProps) {
  const choices = postalCodesFor(city, district)
  const errorId = `${id}-error`

  return (
    <div className={styles.wrap}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]{5}"
        maxLength={5}
        required
        autoComplete="postal-code"
        placeholder="34710"
        className={inputClassName}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : choices.length > 1 ? `${id}-hint` : undefined}
      />
      {choices.length > 1 && (
        <div id={`${id}-hint`} className={styles.hint}>
          <span>Bu ilçede kullanılan kodlar (mahalleye göre değişir):</span>
          <span className={styles.chips}>
            {choices.map((code) => (
              <button
                key={code}
                type="button"
                className={`${styles.chip} ${code === value ? styles.chipActive : ''}`}
                aria-pressed={code === value}
                onClick={() => onChange(code)}
              >
                {code}
              </button>
            ))}
          </span>
        </div>
      )}
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
