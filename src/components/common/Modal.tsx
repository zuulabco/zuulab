'use client'

import React, { useState, useEffect, useRef } from 'react'
import styles from './Modal.module.css'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  ariaLabel?: string
  className?: string
  overlayClassName?: string
  maxWidth?: string | number
  showCloseBtn?: boolean
  closeOnOverlayClick?: boolean
  closeOnEsc?: boolean
}

export default function Modal({
  isOpen,
  onClose,
  children,
  ariaLabel,
  className,
  overlayClassName,
  maxWidth,
  showCloseBtn = true,
  closeOnOverlayClick = true,
  closeOnEsc = true,
}: ModalProps) {
  const [isRendered, setIsRendered] = useState(isOpen)
  const [isExiting, setIsExiting] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  // Manage mount / unmount transition lifecycle
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement | null
      setIsRendered(true)
      setIsExiting(false)
    } else if (isRendered) {
      setIsExiting(true)
      const timer = setTimeout(() => {
        setIsRendered(false)
        setIsExiting(false)
        previousActiveElement.current?.focus()
      }, 190) // Match overlayExit duration
      return () => clearTimeout(timer)
    }
  }, [isOpen, isRendered])

  // Body scroll lock & Escape key
  useEffect(() => {
    if (!isRendered) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') {
        onClose()
      }
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isRendered, closeOnEsc, onClose])

  if (!isRendered) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnOverlayClick) {
      onClose()
    }
  }

  return (
    <div
      className={`${styles.overlay} ${isExiting ? styles.overlayExiting : ''} ${
        overlayClassName || ''
      }`}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        ref={modalRef}
        className={`${styles.content} ${isExiting ? styles.contentExiting : ''} ${
          className || ''
        }`}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseBtn && (
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Pencereyi kapat"
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
