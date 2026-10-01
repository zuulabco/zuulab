'use client'

import React, { useState, useEffect } from 'react'
import { useToastStore, type ToastItem } from '@/store/toastStore'
import styles from './Toast.module.css'

function ToastRow({ toast }: { toast: ToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const duration = toast.duration ?? 3000
    if (duration <= 0) return

    const dismissTimer = setTimeout(() => {
      setIsExiting(true)
    }, duration)

    return () => clearTimeout(dismissTimer)
  }, [toast.duration])

  useEffect(() => {
    if (!isExiting) return
    const unmountTimer = setTimeout(() => {
      removeToast(toast.id)
    }, 190) // wait for toastExit keyframe to finish

    return () => clearTimeout(unmountTimer)
  }, [isExiting, toast.id, removeToast])

  const handleManualDismiss = () => {
    setIsExiting(true)
  }

  const renderIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <span className={`${styles.iconWrap} ${styles.iconSuccess}`} aria-hidden>
            ✓
          </span>
        )
      case 'error':
        return (
          <span className={`${styles.iconWrap} ${styles.iconError}`} aria-hidden>
            ✕
          </span>
        )
      case 'warning':
        return (
          <span className={`${styles.iconWrap} ${styles.iconWarning}`} aria-hidden>
            !
          </span>
        )
      case 'info':
      default:
        return (
          <span className={`${styles.iconWrap} ${styles.iconInfo}`} aria-hidden>
            ℹ
          </span>
        )
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${styles.toastItem} ${isExiting ? styles.toastItemExiting : ''}`}
    >
      {renderIcon()}
      <span className={styles.message}>{toast.message}</span>
      <button
        type="button"
        onClick={handleManualDismiss}
        className={styles.dismissBtn}
        aria-label="Kapat"
      >
        ×
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className={styles.toastViewport} aria-label="Bildirimler">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
    </div>
  )
}
