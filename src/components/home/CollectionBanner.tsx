import Link from 'next/link'
import Image from 'next/image'
import styles from './CollectionBanner.module.css'

interface Props {
  eyebrow: string
  title: string
  subtitle: string
  description: string
  ctaText: string
  ctaHref: string
  imageUrl: string
  imageAlt: string
  align?: 'left' | 'right'
  theme?: 'dark' | 'light'
}

export default function CollectionBanner({
  eyebrow,
  title,
  subtitle,
  description,
  ctaText,
  ctaHref,
  imageUrl,
  imageAlt,
  align = 'left',
  theme = 'dark',
}: Props) {
  return (
    <section className={`${styles.section} ${styles[theme]}`} aria-label={title.toLowerCase()}>
      <div className={`${styles.inner} ${align === 'right' ? styles.reversed : ''}`}>
        {/* Image side */}
        <div className={styles.imageSide}>
          <div className={styles.imageFrame}>
            <Image
              src={imageUrl}
              alt={imageAlt}
              fill
              sizes="(max-width: 900px) 100vw, 55vw"
              className={styles.image}
              loading="lazy"
            />
          </div>
        </div>

        {/* Text side */}
        <div className={styles.textSide}>
          <div className={styles.textContent}>
            <span className={styles.eyebrow}>{eyebrow.toLowerCase()}</span>
            <h2 className={styles.title}>{title.toLowerCase()}</h2>
            <p className={styles.subtitle}>{subtitle.toLowerCase()}</p>
            <p className={styles.description}>{description.toLowerCase()}</p>
            <Link href={ctaHref} className={styles.ctaLink}>
              <span>{ctaText.toLowerCase()}</span>
              <span className={styles.ctaArrow} aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
