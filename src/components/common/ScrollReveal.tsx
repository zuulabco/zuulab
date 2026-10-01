'use client'

import React, { useEffect, useRef, useState } from 'react'
import styles from './ScrollReveal.module.css'

interface ScrollRevealProps {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: React.ElementType
}

export default function ScrollReveal({
  children,
  delay = 0,
  className = '',
  as: Component = 'div',
}: ScrollRevealProps) {
  const [isVisible, setIsVisible] = useState(false)
  const elementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    // If reduced motion is preferred, show immediately
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setIsVisible(true)
      return
    }

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true)
      return
    }

    const currentEl = elementRef.current
    if (!currentEl) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (delay > 0) {
            const timer = setTimeout(() => {
              setIsVisible(true)
            }, delay)
            observer.unobserve(entry.target)
            return () => clearTimeout(timer)
          } else {
            setIsVisible(true)
            observer.unobserve(entry.target)
          }
        }
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -50px 0px',
      }
    )

    observer.observe(currentEl)

    return () => {
      observer.disconnect()
    }
  }, [delay])

  return (
    <Component
      ref={elementRef}
      className={`${styles.reveal} ${isVisible ? styles.visible : ''} ${className}`.trim()}
    >
      {children}
    </Component>
  )
}
