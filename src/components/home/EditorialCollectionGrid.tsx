import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { COLLECTION_CONFIGS } from '@/config/collections'
import styles from './EditorialCollectionGrid.module.css'

export default function EditorialCollectionGrid() {
  const kids = COLLECTION_CONFIGS['zuukids']
  const life = COLLECTION_CONFIGS['zuulife']
  const light = COLLECTION_CONFIGS['zuulight']
  const toptan = COLLECTION_CONFIGS['zuutoptan']

  return (
    <section className={styles.section} aria-label="zuulab koleksiyonları">
      <div className={styles.container}>
        {/* Editorial Section Header */}
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>zuulab / koleksiyonlar</span>
            <h2 className={styles.title}>tasarlanmış dünyalar</h2>
          </div>

          <Link href="/koleksiyonlar" className={styles.viewAllLink}>
            <span>tüm koleksiyonlar (4)</span>
            <span aria-hidden>→</span>
          </Link>
        </header>

        {/* ── Asymmetric Showcase Grid ─────────────────────── */}
        <div className={styles.grid}>
          {/* Left Primary Hero Card: zuukids */}
          {kids && (
            <Link
              href={`/koleksiyon/${kids.slug}`}
              className={`${styles.card} ${styles.primaryCard}`}
              aria-label={`${kids.name} koleksiyonunu keşfet`}
            >
              <div className={styles.imageFrame}>
                <Image
                  src={kids.heroImage}
                  alt={`${kids.name} çocuk 3d figür koleksiyonu`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  className={styles.cardImg}
                  loading="lazy"
                />
              </div>

              <div className={styles.scrim} aria-hidden />

              <div className={styles.content}>
                <div className={styles.tagRow}>
                  <span
                    className={styles.tagDot}
                    style={{ backgroundColor: kids.accentColor }}
                    aria-hidden
                  />
                  <span className={styles.tagText}>çocuk & eğitim · biyo-pla</span>
                </div>
                <h3 className={styles.cardTitle}>{kids.name}</h3>
                <p className={styles.cardTagline}>{kids.editorialTitle || kids.tagline}</p>
                <span className={styles.cardCta}>
                  <span>koleksiyonu keşfet</span>
                  <span aria-hidden>→</span>
                </span>
              </div>
            </Link>
          )}

          {/* Right Stacked Duo: zuulife & zuulight */}
          <div className={styles.stackedCol}>
            {life && (
              <Link
                href={`/koleksiyon/${life.slug}`}
                className={`${styles.card} ${styles.stackedCard}`}
                aria-label={`${life.name} koleksiyonunu keşfet`}
              >
                <div className={styles.imageFrame}>
                  <Image
                    src={life.heroImage}
                    alt={`${life.name} modern yaşam ve masa düzeni objeleri`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className={styles.cardImg}
                    loading="lazy"
                  />
                </div>

                <div className={styles.scrim} aria-hidden />

                <div className={styles.content}>
                  <div className={styles.tagRow}>
                    <span
                      className={styles.tagDot}
                      style={{ backgroundColor: life.accentColor }}
                      aria-hidden
                    />
                    <span className={styles.tagText}>yaşam & masaüstü · 0.12mm fdm</span>
                  </div>
                  <h3 className={styles.cardTitle}>{life.name}</h3>
                  <p className={styles.cardTagline}>{life.tagline}</p>
                  <span className={styles.cardCta}>
                    <span>koleksiyonu keşfet</span>
                    <span aria-hidden>→</span>
                  </span>
                </div>
              </Link>
            )}

            {light && (
              <Link
                href={`/koleksiyon/${light.slug}`}
                className={`${styles.card} ${styles.stackedCard}`}
                aria-label={`${light.name} koleksiyonunu keşfet`}
              >
                <div className={styles.imageFrame}>
                  <Image
                    src={light.heroImage}
                    alt={`${light.name} litofan ambiyans ve gece aydınlatması`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className={styles.cardImg}
                    loading="lazy"
                  />
                </div>

                <div className={styles.scrim} aria-hidden />

                <div className={styles.content}>
                  <div className={styles.tagRow}>
                    <span
                      className={styles.tagDot}
                      style={{ backgroundColor: light.accentColor }}
                      aria-hidden
                    />
                    <span className={styles.tagText}>aydınlatma · litofan teknoloji</span>
                  </div>
                  <h3 className={styles.cardTitle}>{light.name}</h3>
                  <p className={styles.cardTagline}>{light.tagline}</p>
                  <span className={styles.cardCta}>
                    <span>koleksiyonu keşfet</span>
                    <span aria-hidden>→</span>
                  </span>
                </div>
              </Link>
            )}
          </div>
        </div>

        {/* ── Bottom Wide Anchor: zuutoptan ────────────────── */}
        {toptan && (
          <Link
            href={`/koleksiyon/${toptan.slug}`}
            className={`${styles.card} ${styles.wideCard}`}
            aria-label={`${toptan.name} kurumsal üretim çözümlerini keşfet`}
          >
            <div className={styles.imageFrame}>
              <Image
                src={toptan.heroImage}
                alt={`${toptan.name} butik işletmeler için kurumsal 3d üretim`}
                fill
                sizes="100vw"
                className={styles.cardImg}
                loading="lazy"
              />
            </div>

            <div className={styles.scrim} aria-hidden />

            <div className={styles.content}>
              <div className={styles.wideLeft}>
                <div className={styles.tagRow}>
                  <span
                    className={styles.tagDot}
                    style={{ backgroundColor: toptan.accentColor }}
                    aria-hidden
                  />
                  <span className={styles.tagText}>kurumsal & butik b2b çözümleri</span>
                </div>
                <h3 className={styles.cardTitle}>{toptan.name}</h3>
                <p className={styles.cardTagline}>{toptan.editorialTitle || toptan.tagline}</p>
              </div>

              <span className={styles.cardCta}>
                <span>kurumsal üretimi incele</span>
                <span aria-hidden>→</span>
              </span>
            </div>
          </Link>
        )}
      </div>
    </section>
  )
}
