'use client'

import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import styles from './ProductDetails.module.css'

interface Props {
  productId: string
  variantId: string | null
}

/**
 * Takes the place of "sepete ekle" when the product (or the chosen option) is out of
 * stock. Signed-in shoppers are registered with one tap; guests type their email.
 */
export default function StockAlertForm({ productId, variantId }: Props) {
  const { user, token } = useAuthStore()
  const [expanded, setExpanded] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [doneFor, setDoneFor] = useState<string | null>(null)

  const key = `${productId}:${variantId ?? ''}`
  const accountEmail = user?.email && !user.email.endsWith('@zuulab.user') ? user.email : null

  const submit = async (address: string) => {
    setStatus('sending')
    setError(null)
    try {
      const res = await fetch('/api/stock-alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ productId, variantId, email: address }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'İsteğiniz kaydedilemedi.')
      setStatus('done')
      setDoneFor(key)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error && err.message ? err.message : 'İsteğiniz kaydedilemedi.')
      // Show the form so the shopper sees the message and can try another address
      setEmail(address)
      setExpanded(true)
    }
  }

  if (status === 'done' && doneFor === key) {
    return (
      <div id="stock-alert" className={styles.stockAlertDone} role="status">
        <strong>talebiniz alındı.</strong> ürün tekrar stoğa girdiğinde size haber vereceğiz.
      </div>
    )
  }

  if (!expanded) {
    return (
      <button
        id="stock-alert"
        type="button"
        className={`btn btn-primary ${styles.stockAlertBtn}`}
        disabled={status === 'sending'}
        onClick={() => (accountEmail ? submit(accountEmail) : setExpanded(true))}
      >
        <BellIcon />
        <span>{status === 'sending' ? 'kaydediliyor…' : 'gelince haber ver'}</span>
      </button>
    )
  }

  return (
    <form
      id="stock-alert"
      className={styles.stockAlertForm}
      onSubmit={(e) => {
        e.preventDefault()
        if (email.trim()) submit(email.trim())
      }}
    >
      <label htmlFor="stock-alert-email" className="sr-only">
        e-posta adresiniz
      </label>
      <input
        id="stock-alert-email"
        type="email"
        required
        autoFocus
        autoComplete="email"
        placeholder="e-posta adresiniz"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={styles.stockAlertInput}
      />
      <button type="submit" className="btn btn-primary" disabled={status === 'sending'}>
        {status === 'sending' ? 'kaydediliyor…' : 'haber ver'}
      </button>
      {error && (
        <p className={styles.stockAlertError} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
