'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import styles from './ProductGallery.module.css'

interface ImageItem {
  url: string
  alt: string
  isPrimary?: boolean
}

interface Props {
  images: ImageItem[]
  productName: string
}

export default function ProductGallery({ images, productName }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  // Reset selected index if images list changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [images])

  // The details panel asks for a photo when the shopper picks a colour / variant
  useEffect(() => {
    const onShow = (e: Event) => {
      const url = (e as CustomEvent<{ url: string }>).detail?.url
      const index = images.findIndex((img) => img.url === url)
      if (index >= 0) setSelectedIndex(index)
    }
    window.addEventListener('zuu:show-product-image', onShow)
    return () => window.removeEventListener('zuu:show-product-image', onShow)
  }, [images])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!images || images.length <= 1) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % images.length)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + images.length) % images.length)
      }
    },
    [images]
  )

  // Touch swipe support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
    touchEndX.current = null
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null || images.length <= 1) return
    const diff = touchStartX.current - touchEndX.current
    const threshold = 40

    if (diff > threshold) {
      // Swiped left -> next
      setSelectedIndex((prev) => (prev + 1) % images.length)
    } else if (diff < -threshold) {
      // Swiped right -> prev
      setSelectedIndex((prev) => (prev - 1 + images.length) % images.length)
    }

    touchStartX.current = null
    touchEndX.current = null
  }

  if (!images || images.length === 0) {
    return (
      <div className={styles.placeholder}>
        <div className={styles.placeholderIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <span>görsel hazırlanıyor</span>
      </div>
    )
  }

  const activeImage = images[selectedIndex] || images[0]

  return (
    <div
      className={styles.gallery}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={`${productName} ürün galerisi. Ok tuşları ile veya kaydırarak görseller arasında geçiş yapabilirsiniz.`}
    >
      {/* ── Main Hero Image Viewport ───────────────────── */}
      <div
        className={styles.mainWrapper}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          key={activeImage.url}
          src={activeImage.url}
          alt={activeImage.alt || `${productName} detay`}
          fill
          priority
          sizes="(max-width: 900px) 100vw, 55vw"
          className={styles.mainImage}
        />

        {/* Counter Badge */}
        {images.length > 1 && (
          <span className={styles.counterBadge} aria-hidden="true">
            {selectedIndex + 1} / {images.length}
          </span>
        )}

        {/* Mobile Swipe Navigation Dots */}
        {images.length > 1 && (
          <div className={styles.mobileDots} aria-hidden="true">
            {images.map((_, idx) => (
              <span
                key={idx}
                className={`${styles.dot} ${idx === selectedIndex ? styles.dotActive : ''}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Thumbnails Strip ───────────────────────────── */}
      {images.length > 1 && (
        <div className={styles.thumbnails} role="tablist" aria-label="Ürün görselleri">
          {images.map((img, idx) => {
            const isActive = idx === selectedIndex
            return (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`${productName} görsel ${idx + 1}`}
                className={`${styles.thumbBtn} ${isActive ? styles.thumbBtnActive : ''}`}
                onClick={() => setSelectedIndex(idx)}
              >
                <Image
                  src={img.url}
                  alt={img.alt || `${productName} küçük görsel ${idx + 1}`}
                  fill
                  sizes="72px"
                  className={styles.thumbImage}
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
