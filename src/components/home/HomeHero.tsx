'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import styles from './HomeHero.module.css'

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
    id: 'zuulife',
    chipLabel: 'zuulife',
    badgeText: 'zuulife · 3d tasarım serisi',
    accentColor: 'var(--zuu-blue)',
    headlineMain: 'işlevsel geometri,',
    headlineAccent: 'yaşayan mekanlar.',
    description:
      'çalışma masası ve yaşam alanları için parametrik formlar, modüler düzenleyiciler ve 0.12mm FDM hassasiyeti.',
    primaryCtaText: 'zuulife koleksiyonu',
    primaryCtaHref: '/koleksiyon/zuulife',
    secondaryCtaText: 'tüm tasarımlar',
    secondaryCtaHref: '/urunler',
    imageUrl:
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1920&q=85',
    imageAlt: 'zuulife modern yaşam ve çalışma alanı tasarım objeleri',
    theme: 'light',
  },
  {
    id: 'zuukids',
    chipLabel: 'zuukids',
    badgeText: 'zuukids · çocuk koleksiyonu',
    accentColor: 'var(--zuu-yellow)',
    headlineMain: 'hayal gücüne dokunan',
    headlineAccent: 'güvenli formlar.',
    description:
      'çocuklar için özel üretilen yumuşak yüzeyli biyo-polimer figürler, montessori geometri setleri ve renkli dünyalar.',
    primaryCtaText: 'zuukids dünyası',
    primaryCtaHref: '/koleksiyon/zuukids',
    secondaryCtaText: 'figür setleri',
    secondaryCtaHref: '/urun/mini-dinozor-serisi-set',
    imageUrl:
      'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1920&q=85',
    imageAlt: 'zuukids çocuk güvenli renkli 3d baskı figürleri',
    theme: 'light',
  },
  {
    id: 'zuulight',
    chipLabel: 'zuulight',
    badgeText: 'zuulight · aydınlatma serisi',
    accentColor: 'var(--zuu-yellow)',
    headlineMain: 'ışık ve gölgenin',
    headlineAccent: 'parametrik heykeli.',
    description:
      'nasa topoğrafik yüzey haritaları ve litofan ışık geçirgenliğiyle tasarlanan küre ay lambaları ve ambiyans aydınlatmaları.',
    primaryCtaText: 'zuulight serisi',
    primaryCtaHref: '/koleksiyon/zuulight',
    secondaryCtaText: 'ay lambasını incele',
    secondaryCtaHref: '/urun/lithoglow-ay-yuzeyi-gece-lambasi',
    imageUrl:
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1920&q=85',
    imageAlt: 'zuulight litofan ay lambası ve sıcak ambiyans aydınlatması',
    theme: 'dark',
  },
]

export default function HomeHero({ hero }: HeroProps) {
  if (hero && hero.active === false) {
    return null
  }

  // Merge CMS hero props if provided
  const slides: SlideItem[] = DEFAULT_SLIDES.map((slide, idx) => {
    if (idx === 0 && hero) {
      return {
        ...slide,
        headlineMain: hero.headlineMain || slide.headlineMain,
        headlineAccent: hero.headlineItalic || slide.headlineAccent,
        description: hero.leadText || slide.description,
        imageUrl: hero.heroImage || slide.imageUrl,
        primaryCtaText: hero.primaryCtaText || slide.primaryCtaText,
        primaryCtaHref: hero.primaryCtaHref || slide.primaryCtaHref,
        secondaryCtaText: hero.secondaryCtaText || slide.secondaryCtaText,
        secondaryCtaHref: hero.secondaryCtaHref || slide.secondaryCtaHref,
        badgeText: hero.originTag ? `${hero.originTag} · 3d tasarım` : slide.badgeText,
      }
    }
    return slide
  })

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

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

  // User-controlled navigation (no forced autoplay loop)

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
                }`}
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
