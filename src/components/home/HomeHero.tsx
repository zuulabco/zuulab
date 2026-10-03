'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import styles from './HomeHero.module.css'

/** Best-selling product of a collection, shown as the slide's second button. */
export interface HeroPick {
  name: string
  slug: string
}

interface HeroProps {
  hero?: {
    brandWorld?: string
    originTag?: string
    headlineMain?: string
    headlineItalic?: string
    leadText?: string
    heroImage?: string
    imageCaptionCode?: string
    imageCaptionText?: string
    primaryCtaText?: string
    primaryCtaHref?: string
    secondaryCtaText?: string
    secondaryCtaHref?: string
    active?: boolean
  }
  /** Keyed by collection slug (zuukids, zuulife, zuulight). */
  picks?: Partial<Record<string, HeroPick>>
}

interface SlideItem {
  id: string
  chipLabel: string
  badgeText: string
  accentColor: string
  headlineMain: string
  headlineAccent: string
  description: string
  primaryCtaText: string
  primaryCtaHref: string
  secondaryCtaText?: string
  secondaryCtaHref?: string
  imageUrl: string
  imageAlt: string
  theme: 'light' | 'dark'
}

const DEFAULT_SLIDES: SlideItem[] = [
  {
    id: 'zuukids',
    chipLabel: 'zuukids',
    badgeText: 'zuukids · çocuk koleksiyonu',
    accentColor: 'var(--zuu-yellow)',
    headlineMain: 'oynarken öğrenen',
    headlineAccent: 'küçük eller için.',
    description:
      'şekil eşleştirme setleri, kesir yapbozları ve sıralama oyunları; keskin kenarı olmayan, pürüzsüz yüzeyli formlar.',
    primaryCtaText: 'zuukids dünyası',
    primaryCtaHref: '/koleksiyon/zuukids',
    imageUrl:
      'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1920&q=85',
    imageAlt: 'zuukids renkli eğitici oyuncaklar',
    theme: 'light',
  },
  {
    id: 'zuulife',
    chipLabel: 'zuulife',
    badgeText: 'zuulife · yaşam ve masa',
    accentColor: 'var(--zuu-blue)',
    headlineMain: 'işlevsel geometri,',
    headlineAccent: 'düzenli mekanlar.',
    description:
      'masaüstü organizerleri, takı ağaçları ve ev objeleri; günlük düzeni sade formlarla bir araya getiren tasarımlar.',
    primaryCtaText: 'zuulife koleksiyonu',
    primaryCtaHref: '/koleksiyon/zuulife',
    imageUrl:
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1920&q=85',
    imageAlt: 'zuulife yaşam ve çalışma alanı objeleri',
    theme: 'light',
  },
  {
    id: 'zuulight',
    chipLabel: 'zuulight',
    badgeText: 'zuulight · aydınlatma serisi',
    accentColor: 'var(--zuu-yellow)',
    headlineMain: 'ışığı katman katman',
    headlineAccent: 'şekillendiren lambalar.',
    description:
      'parametrik desenli masa lambaları; açıkken duvara düşen gölgesiyle, kapalıyken formuyla odaya karakter katar.',
    primaryCtaText: 'zuulight serisi',
    primaryCtaHref: '/koleksiyon/zuulight',
    imageUrl:
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1920&q=85',
    imageAlt: 'zuulight masa lambası ve sıcak ambiyans ışığı',
    theme: 'dark',
  },
]

export default function HomeHero({ hero, picks }: HeroProps) {
  // Each collection slide links to that collection's best seller; the CMS hero, when the
  // admin has filled it in, becomes its own closing brand slide instead of overwriting one.
  const slides: SlideItem[] = DEFAULT_SLIDES.map((slide) => {
    const pick = picks?.[slide.id]
    return pick
      ? { ...slide, secondaryCtaText: pick.name.toLowerCase(), secondaryCtaHref: `/urun/${pick.slug}` }
      : { ...slide, secondaryCtaText: 'tüm ürünler', secondaryCtaHref: '/urunler' }
  })
  if (hero?.headlineMain) {
    slides.push({
      id: 'zuulab',
      chipLabel: 'zuulab',
      badgeText: hero.originTag ? `zuulab · ${hero.originTag}` : 'zuulab',
      accentColor: 'var(--zuu-blue)',
      headlineMain: hero.headlineMain,
      headlineAccent: hero.headlineItalic ?? '',
      description: hero.leadText ?? '',
      primaryCtaText: hero.primaryCtaText || 'tüm koleksiyonlar',
      primaryCtaHref: hero.primaryCtaHref || '/koleksiyonlar',
      secondaryCtaText: hero.secondaryCtaText,
      secondaryCtaHref: hero.secondaryCtaHref,
      imageUrl: hero.heroImage || DEFAULT_SLIDES[1].imageUrl,
      imageAlt: hero.imageCaptionText || 'zuulab tasarım objeleri',
      theme: 'light',
    })
  }

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [pageHidden, setPageHidden] = useState(false)
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Autoplay is driven by the progress bar: when its 6s fill animation ends, the next
  // slide shows. Pausing the animation pauses autoplay, and reduced motion (no animation)
  // turns it off entirely.
  const isPaused = userPaused || isHovered || hasFocus || pageHidden

  const activeSlide = slides[currentIndex] || slides[0]
  const isDark = activeSlide.theme === 'dark'

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex((index + slides.length) % slides.length)
  }, [slides.length])

  const nextSlide = useCallback(() => {
    goToSlide(currentIndex + 1)
  }, [currentIndex, goToSlide])

  const prevSlide = useCallback(() => {
    goToSlide(currentIndex - 1)
  }, [currentIndex, goToSlide])

  if (hero?.active === false) {
    return null
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      prevSlide()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      nextSlide()
    }
  }

  // Touch Swipe handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX
      touchStartYRef.current = e.touches[0].clientY
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return
    const touchEndX = e.changedTouches[0].clientX
    const touchEndY = e.changedTouches[0].clientY
    const deltaX = touchEndX - touchStartXRef.current
    const deltaY = touchEndY - touchStartYRef.current

    // Horizontal swipe threshold 45px, more horizontal than vertical
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) {
        prevSlide()
      } else {
        nextSlide()
      }
    }

    touchStartXRef.current = null
    touchStartYRef.current = null
  }

  return (
    <section
      ref={containerRef}
      className={styles.heroBanner}
      role="region"
      aria-roledescription="carousel"
      aria-label="Öne çıkan koleksiyonlar ve ürünler"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={(e) => { if (e.target !== e.currentTarget) setHasFocus(true) }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHasFocus(false)
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Slide Track ────────────────────────────────────── */}
      <div className={styles.slidesTrack}>
        {slides.map((slide, index) => {
          const isActive = index === currentIndex
          const slideDark = slide.theme === 'dark'

          return (
            <div
              key={slide.id}
              className={`${styles.slide} ${isActive ? styles.slideActive : ''}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${slides.length}: ${slide.chipLabel}`}
              aria-hidden={!isActive}
            >
              {/* Background media */}
              <div className={styles.imageWrapper}>
                <Image
                  src={slide.imageUrl}
                  alt={slide.imageAlt}
                  fill
                  priority={index === 0}
                  sizes="100vw"
                  className={styles.slideImg}
                />
              </div>

              {/* Scrim overlay for crisp legibility */}
              <div
                className={slideDark ? styles.scrimDark : styles.scrimLight}
                aria-hidden
              />

              {/* Content overlay */}
              <div className={styles.contentContainer}>
                <div className={styles.contentWrapper}>
                  {/* Eyebrow badge */}
                  <div
                    className={`${styles.badge} ${
                      slideDark ? styles.badgeDark : styles.badgeLight
                    }`}
                  >
                    <span
                      className={styles.badgeDot}
                      style={{ backgroundColor: slide.accentColor }}
                      aria-hidden
                    />
                    <span>{slide.badgeText}</span>
                  </div>

                  {/* Headline */}
                  <h1
                    className={`${styles.headline} ${
                      slideDark ? styles.headlineDark : styles.headlineLight
                    }`}
                  >
                    <span>{slide.headlineMain}</span>
                    <em className={styles.headlineAccent}>{slide.headlineAccent}</em>
                  </h1>

                  {/* Description */}
                  <p
                    className={`${styles.description} ${
                      slideDark ? styles.descDark : styles.descLight
                    }`}
                  >
                    {slide.description}
                  </p>

                  {/* CTA Row */}
                  <div className={styles.ctaRow}>
                    <Link
                      href={slide.primaryCtaHref}
                      className={`${styles.primaryCta} ${
                        slideDark ? styles.primaryCtaDark : styles.primaryCtaLight
                      }`}
                      tabIndex={isActive ? 0 : -1}
                    >
                      <span>{slide.primaryCtaText}</span>
                      <span className={styles.ctaArrow} aria-hidden>
                        →
                      </span>
                    </Link>

                    {slide.secondaryCtaText && slide.secondaryCtaHref && (
                      <Link
                        href={slide.secondaryCtaHref}
                        className={`${styles.secondaryCta} ${
                          slideDark ? styles.secondaryCtaDark : styles.secondaryCtaLight
                        }`}
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

      {/* ── Minimal Editorial Controls Bar ─────────────────── */}
      <div className={styles.controlsBar}>
        <div className={styles.controlsInner}>
          {/* Left: Counter + Progress line + Chips */}
          <div className={styles.controlsLeft}>
            {/* Number counter (01 / 03) */}
            <span
              className={`${styles.slideIndex} ${
                isDark ? styles.indexDark : styles.indexLight
              }`}
              aria-live="polite"
            >
              <span className={styles.indexCurrent}>
                {String(currentIndex + 1).padStart(2, '0')}
              </span>
              <span className={styles.indexSep}>/</span>
              <span>{String(slides.length).padStart(2, '0')}</span>
            </span>

            {/* Slim progress bar track */}
            <div
              className={`${styles.progressTrack} ${
                isDark ? styles.progressTrackDark : styles.progressTrackLight
              }`}
              aria-hidden
            >
              <div
                key={currentIndex}
                className={`${styles.progressBar} ${
                  isDark ? styles.progressBarDark : styles.progressBarLight
                } ${isPaused ? styles.progressBarPaused : ''}`}
                onAnimationEnd={nextSlide}
              />
            </div>

            {/* Quick jump chip tabs */}
            <div className={styles.chipList} role="tablist" aria-label="Koleksiyon slaytları">
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
          </div>

          {/* Right: Prev & Next */}
          <div className={styles.controlsRight}>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.pauseBtn} ${
                isDark ? styles.iconBtnDark : styles.iconBtnLight
              }`}
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
            <button
              type="button"
              className={`${styles.iconBtn} ${
                isDark ? styles.iconBtnDark : styles.iconBtnLight
              }`}
              onClick={prevSlide}
              aria-label="Önceki slayt"
              title="Önceki slayt"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <button
              type="button"
              className={`${styles.iconBtn} ${
                isDark ? styles.iconBtnDark : styles.iconBtnLight
              }`}
              onClick={nextSlide}
              aria-label="Sonraki slayt"
              title="Sonraki slayt"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
