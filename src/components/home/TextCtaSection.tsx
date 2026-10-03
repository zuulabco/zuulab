import Link from 'next/link'
import type { TextCtaSettings } from '@/lib/cms/homepage'
import styles from './TextCtaSection.module.css'

/** A short message and one button, added from the homepage editor ("Metin ve buton"). */
export default function TextCtaSection({ settings }: { settings: TextCtaSettings }) {
  const { eyebrow, title, body, ctaLabel, ctaHref, align, tone } = settings
  if (!title) return null

  return (
    <section className={`${styles.section} ${styles[tone] ?? ''}`} aria-label={title}>
      <div className={`${styles.container} ${align === 'center' ? styles.center : ''}`}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h2 className={styles.title}>{title}</h2>
        {body && <p className={styles.body}>{body}</p>}
        {ctaLabel && ctaHref && (
          <Link href={ctaHref} className={`btn btn-lg ${tone === 'dark' ? styles.ctaOnDark : 'btn-primary'}`}>
            {ctaLabel}
          </Link>
        )}
      </div>
    </section>
  )
}
