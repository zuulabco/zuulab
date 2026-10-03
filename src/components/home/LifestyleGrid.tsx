import Image from 'next/image'
import Link from 'next/link'
import { SECTION_TEMPLATES, type LifestyleSettings, type LifestyleTile } from '@/lib/cms/homepage'
import styles from './LifestyleGrid.module.css'

const TILE_CLASS = [styles.tall, styles.landscape, styles.square]
const TILE_SIZES = ['(max-width: 900px) 100vw, 40vw', '(max-width: 900px) 100vw, 55vw', '(max-width: 900px) 50vw, 30vw']

function Tile({ tile, index }: { tile: LifestyleTile; index: number }) {
  if (!tile.imageUrl) return null
  const body = (
    <>
      <Image src={tile.imageUrl} alt={tile.alt} fill sizes={TILE_SIZES[index]} className={styles.img} loading="lazy" />
      {tile.label && <span className={styles.imageLabel}>{tile.label}</span>}
    </>
  )
  const cls = `${styles.imageTile} ${TILE_CLASS[index]}`
  if (!tile.href) return <div className={cls}>{body}</div>
  return tile.href.startsWith('/') ? (
    <Link href={tile.href} className={cls}>
      {body}
    </Link>
  ) : (
    <a href={tile.href} className={cls} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  )
}

/** Text tile and three photos; edited in Vitrin → Ana sayfa → "Yaşam alanı galerisi". */
export default function LifestyleGrid({ settings }: { settings?: LifestyleSettings }) {
  const s = settings ?? SECTION_TEMPLATES.lifestyle.defaults()
  const external = s.linkHref && !s.linkHref.startsWith('/')

  return (
    <section className={styles.section} aria-label="yaşam alanlarından zuulab kareleri">
      <div className={styles.container}>
        <div className={styles.grid}>
          <div className={styles.textTile}>
            {s.heading && <h2 className={styles.heading}>{s.heading}</h2>}
            {s.body && <p className={styles.desc}>{s.body}</p>}
            {s.linkLabel && s.linkHref && (
              <a
                href={s.linkHref}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className={styles.instaLink}
              >
                <span>{s.linkLabel}</span>
                <span className={styles.arrow} aria-hidden>
                  →
                </span>
              </a>
            )}
          </div>
          {s.tiles.map((tile, i) => (
            <Tile key={i} tile={tile} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
