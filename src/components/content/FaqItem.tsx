'use client'

import { useRef } from 'react'
import s from './Corporate.module.css'

const DURATION = 320
const EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

/**
 * One FAQ entry: a native <details> (works without JavaScript, searchable with
 * find-in-page) whose opening and closing slide instead of jumping. The height is
 * animated with the Web Animations API, so every browser gets the same motion;
 * reduced-motion users get the instant toggle.
 */
export default function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const animation = useRef<Animation | null>(null)

  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    e.preventDefault()

    // Heights are border-box: the item's top (and last item's bottom) border included
    const borders = el.offsetHeight - el.clientHeight
    const closed = `${(el.querySelector('summary')?.offsetHeight ?? 0) + borders}px`
    const closing = el.open && !el.classList.contains(s.faqClosing)
    const from = `${el.offsetHeight}px`
    animation.current?.cancel()

    if (closing) {
      el.classList.add(s.faqClosing)
      animation.current = el.animate({ height: [from, closed] }, { duration: DURATION, easing: EASING })
    } else {
      el.classList.remove(s.faqClosing)
      el.open = true
      const full = `${el.scrollHeight + borders}px`
      animation.current = el.animate({ height: [from, full] }, { duration: DURATION, easing: EASING })
    }
    animation.current.onfinish = () => {
      if (closing) el.open = false
      el.classList.remove(s.faqClosing)
      animation.current = null
    }
  }

  return (
    <details ref={ref} className={s.faq}>
      <summary onClick={toggle}>{question}</summary>
      <div className={s.faqAnswer}>{children}</div>
    </details>
  )
}
