'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import styles from './HomeHero.module.css'

/** A slide ready to show: links and labels already resolved on the server */
export interface HeroSlideView {
  id: string
  chipLabel: string
  badgeText: string
  accent: 'blue' | 'yellow'
  headlineMain: string
  headlineAccent: string
  description: string
  primaryCtaText: string
  primaryCtaHref: string
  secondaryCtaText?: string
  secondaryCtaHref?: string
  imageUrl: string
  mobileImageUrl?: string
  focus: 'center' | 'left' | 'right'
  theme: 'light' | 'dark'
}

interface HeroProps {
  slides: HeroSlideView[]
  autoplay?: boolean
  /** Seconds per slide */
  interval?: number
}

const FOCUS: Record<HeroSlideView['focus'], string> = {
  center: 'center 38%',
  left: '22% 40%',
  right: '78% 40%',
}

export default function HomeHero({ slides, autoplay = true, interval = 6 }: HeroProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [pageHidden, setPageHidden] = useState(false)
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Autoplay is driven by the progress bar: when its fill animation ends the next
  // slide shows. Pausing the animation pauses autoplay; reduced motion (no animation)
  // turns it off.
  const canAutoplay = autoplay && slides.length > 1
  const isPaused = !canAutoplay || userPaused || isHovered || hasFocus || pageHidden

  const goToSlide = useCallback(
    (index: number) => setCurrentIndex((index + slides.length) % slides.length),
    [slides.length]
  )
  const nextSlide = useCallback(() => goToSlide(currentIndex + 1), [currentIndex, goToSlide])
  const prevSlide = useCallback(() => goToSlide(currentIndex - 1), [currentIndex, goToSlide])

  if (slides.length === 0) return null

  const activeSlide = slides[currentIndex] || slides[0]
  const isDark = activeSlide.theme === 'dark'
  const accentColor = (s: HeroSlideView) => (s.accent === 'yellow' ? 'var(--zuu-yellow)' : 'var(--zuu-blue)')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      prevSlide()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      nextSlide()
    }
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX
      touchStartYRef.current = e.touches[0].clientY
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) prevSlide()
      else nextSlide()
    }
    touchStartXRef.current = null
    touchStartYRef.current = null
  }

  return (
    <section
      className={`${styles.heroBanner} ${isDark ? styles.heroDark : ''}`}
      role="region"
      aria-roledescription="carousel"
      aria-label="Öne çıkan koleksiyonlar ve ürünler"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={(e) => {
        if (e.target !== e.currentTarget) setHasFocus(true)
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHasFocus(false)
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ ['--hero-interval' as string]: `${interval}s` }}
    >
      <div className={styles.slidesTrack}>
        {slides.map((slide, index) => {
          const isActive = index === currentIndex
          const slideDark = slide.theme === 'dark'

          return (
            <div
              key={slide.id}
              className={`${styles.slide} ${isActive ? styles.slideActive : ''} ${slideDark ? styles.slideDark : styles.slideLight}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${slides.length}: ${slide.chipLabel}`}
              aria-hidden={!isActive}
            >
              <div className={styles.imageWrapper}>
                <Image
                  src={slide.imageUrl}
                  alt=""
                  fill
                  priority={index === 0}
                  sizes="100vw"
                  className={`${styles.slideImg} ${slide.mobileImageUrl ? styles.imgDesktopOnly : ''}`}
                  style={{ objectPosition: FOCUS[slide.focus] }}
                />
                {slide.mobileImageUrl && (
                  <Image
                    src={slide.mobileImageUrl}
                    alt=""
                    fill
                    priority={index === 0}
                    sizes="100vw"
                    className={`${styles.slideImg} ${styles.imgMobileOnly}`}
                  />
                )}
              </div>

              <div className={slideDark ? styles.scrimDark : styles.scrimLight} aria-hidden />

              <div className={styles.contentContainer}>
                <div className={styles.contentWrapper}>
                  <div className={`${styles.badge} ${slideDark ? styles.badgeDark : styles.badgeLight}`}>
                    <span className={styles.badgeDot} style={{ backgroundColor: accentColor(slide) }} aria-hidden />
                    <span>{slide.badgeText}</span>
                  </div>

                  <h1 className={`${styles.headline} ${slideDark ? styles.headlineDark : styles.headlineLight}`}>
                    <span>{slide.headlineMain}</span>
                    {slide.headlineAccent && <em className={styles.headlineAccent}>{slide.headlineAccent}</em>}
                  </h1>

                  {slide.description && (
                    <p className={`${styles.description} ${slideDark ? styles.descDark : styles.descLight}`}>{slide.description}</p>
                  )}

                  <div className={styles.ctaRow}>
                    <Link
                      href={slide.primaryCtaHref}
                      className={`${styles.primaryCta} ${slideDark ? styles.primaryCtaDark : styles.primaryCtaLight}`}
                      tabIndex={isActive ? 0 : -1}
                    >
                      <span>{slide.primaryCtaText}</span>
                      <span className={styles.ctaArrow} aria-hidden>→</span>
                    </Link>

                    {slide.secondaryCtaText && slide.secondaryCtaHref && (
                      <Link
                        href={slide.secondaryCtaHref}
                        className={`${styles.secondaryCta} ${slideDark ? styles.secondaryCtaDark : styles.secondaryCtaLight}`}
                        tabIndex={isActive ? 0 : -1}
                      >
                        {slide.secondaryCtaText}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {slides.length > 1 && (
        <div className={styles.controlsBar}>
          <div className={styles.controlsInner}>
            <div className={styles.controlsLeft}>
              <span className={`${styles.slideIndex} ${isDark ? styles.indexDark : styles.indexLight}`} aria-live="polite">
                <span className={styles.indexCurrent}>{String(currentIndex + 1).padStart(2, '0')}</span>
                <span className={styles.indexSep}>/</span>
                <span>{String(slides.length).padStart(2, '0')}</span>
              </span>

              <div className={`${styles.progressTrack} ${isDark ? styles.progressTrackDark : styles.progressTrackLight}`} aria-hidden>
                <div
                  key={currentIndex}
                  className={`${styles.progressBar} ${isDark ? styles.progressBarDark : styles.progressBarLight} ${isPaused ? styles.progressBarPaused : ''}`}
                  onAnimationEnd={canAutoplay ? nextSlide : undefined}
                />
              </div>

              <div className={styles.chipList} role="tablist" aria-label="Slaytlar">
                {slides.map((s, idx) => {
                  const isSelected = idx === currentIndex
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      aria-label={`${s.chipLabel} slaytına git`}
                      onClick={() => goToSlide(idx)}
                      className={`${styles.chipBtn} ${
                        isDark
                          ? isSelected
                            ? styles.chipBtnActiveDark
                            : styles.chipBtnDark
                          : isSelected
                            ? styles.chipBtnActiveLight
                            : styles.chipBtnLight
                      }`}
                    >
                      {s.chipLabel}
                    </button>
                  )
                })}
              </div>

              {/* Phones: dots instead of the named tabs */}
              <div className={styles.dots} aria-hidden="true">
                {slides.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    tabIndex={-1}
                    className={`${styles.dot} ${idx === currentIndex ? styles.dotActive : ''}`}
                    onClick={() => goToSlide(idx)}
                  />
                ))}
              </div>
            </div>

            <div className={styles.controlsRight}>
              {canAutoplay && (
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.pauseBtn} ${isDark ? styles.iconBtnDark : styles.iconBtnLight}`}
                  onClick={() => setUserPaused((v) => !v)}
                  aria-label={userPaused ? 'Slaytları oynat' : 'Slaytları durdur'}
                  aria-pressed={userPaused}
                  title={userPaused ? 'Oynat' : 'Durdur'}
                >
                  {userPaused ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <polygon points="7 4 20 12 7 20 7 4" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  )}
                </button>
              )}
              <button
                type="button"
                className={`${styles.iconBtn} ${isDark ? styles.iconBtnDark : styles.iconBtnLight}`}
                onClick={prevSlide}
                aria-label="Önceki slayt"
                title="Önceki slayt"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${isDark ? styles.iconBtnDark : styles.iconBtnLight}`}
                onClick={nextSlide}
                aria-label="Sonraki slayt"
                title="Sonraki slayt"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
