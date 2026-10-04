'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { getImageProps } from 'next/image'
import { isCloudinaryUrl, cloudinaryHeroLoader } from '@/lib/images/cloudinary-loader'
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
  /** Inline ~32px previews shown blurred until the photos load */
  blurDataUrl?: string
  mobileBlurDataUrl?: string
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
  /**
   * Slides whose photo is in the page. Only the first loads with the page (it is
   * the LCP image); the next one joins once the page has loaded, and every slide
   * stays loaded once shown. Until then a slide shows its inline blurred preview.
   */
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([0]))
  const keepLoaded = useCallback((...indexes: number[]) => {
    setLoaded((prev) => (indexes.every((i) => prev.has(i)) ? prev : new Set([...prev, ...indexes])))
  }, [])

  useEffect(() => {
    if (slides.length < 2) return
    const preloadNext = () => keepLoaded(1)
    if (document.readyState === 'complete') {
      preloadNext()
      return
    }
    window.addEventListener('load', preloadNext, { once: true })
    return () => window.removeEventListener('load', preloadNext)
  }, [slides.length, keepLoaded])

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
    (index: number) => {
      const next = (index + slides.length) % slides.length
      // The shown slide and the one after it load their photos
      keepLoaded(next, (next + 1) % slides.length)
      setCurrentIndex(next)
    },
    [slides.length, keepLoaded]
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
      // Hover pauses only for a real mouse: a tap fires a synthetic mouseenter with no
      // mouseleave after it, which used to stop autoplay on phones for good.
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setIsHovered(true)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setIsHovered(false)
      }}
      onFocus={(e) => {
        // Keyboard focus pauses; focus left behind by a tap on a dot or tab does not.
        if (e.target !== e.currentTarget && e.target.matches(':focus-visible')) setHasFocus(true)
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
                {slide.blurDataUrl && (
                  <div
                    className={`${styles.blurPreview} ${slide.mobileImageUrl ? styles.imgDesktopOnly : ''}`}
                    style={{ backgroundImage: `url(${slide.blurDataUrl})`, backgroundPosition: FOCUS[slide.focus] }}
                    aria-hidden
                  />
                )}
                {slide.mobileImageUrl && slide.mobileBlurDataUrl && (
                  <div
                    className={`${styles.blurPreview} ${styles.imgMobileOnly}`}
                    style={{ backgroundImage: `url(${slide.mobileBlurDataUrl})` }}
                    aria-hidden
                  />
                )}
                {loaded.has(index) && <HeroPicture slide={slide} first={index === 0} />}
              </div>

              <div className={slideDark ? styles.scrimDark : styles.scrimLight} aria-hidden />

              <div className={styles.contentContainer}>
                <div className={styles.contentWrapper}>
                  <div className={`${styles.badge} ${slideDark ? styles.badgeDark : styles.badgeLight}`}>
                    <span className={styles.badgeDot} style={{ backgroundColor: accentColor(slide) }} aria-hidden />
                    <span>{slide.badgeText}</span>
                  </div>

                  {/* A rotating slogan, not a section of the page: a paragraph, not a heading */}
                  <p className={`${styles.headline} ${slideDark ? styles.headlineDark : styles.headlineLight}`}>
                    <span>{slide.headlineMain}</span>
                    {slide.headlineAccent && <em className={styles.headlineAccent}>{slide.headlineAccent}</em>}
                  </p>

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

/**
 * The slide photo as <picture>: phones download only the portrait photo when the
 * slide has one, wider screens only the wide one. The first slide is the page's
 * LCP image, so it loads at once with high priority and skips the fade-in (its
 * blurred preview is already showing).
 */
function HeroPicture({ slide, first }: { slide: HeroSlideView; first: boolean }) {
  const alt = [slide.headlineMain, slide.headlineAccent].filter(Boolean).join(' ')
  const common = { alt, fill: true, sizes: '100vw' } as const
  const loaderFor = (src: string) => (isCloudinaryUrl(src) ? cloudinaryHeroLoader : undefined)
  const { props: wide } = getImageProps({ ...common, src: slide.imageUrl, loader: loaderFor(slide.imageUrl) })
  const portrait = slide.mobileImageUrl
    ? getImageProps({ ...common, src: slide.mobileImageUrl, loader: loaderFor(slide.mobileImageUrl) }).props
    : null

  return (
    <picture>
      {portrait && <source media="(max-width: 768px)" srcSet={portrait.srcSet} sizes={portrait.sizes} />}
      <img
        {...wide}
        alt={alt}
        className={styles.slideImg}
        style={{ ...wide.style, objectPosition: FOCUS[slide.focus] }}
        loading={first ? 'eager' : 'lazy'}
        fetchPriority={first ? 'high' : undefined}
        data-nofade={first ? '' : undefined}
      />
    </picture>
  )
}
