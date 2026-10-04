import Link from 'next/link'
import Image from 'next/image'
import { getCollectionBySlug, getCollections } from '@/lib/services/catalog/catalog.service'
import { getCollectionView } from '@/lib/services/catalog/collection-presentation'
import styles from './ProductCollectionDiscovery.module.css'

interface Props {
  collectionSlug?: string
  collectionName?: string
  productName: string
}

/**
 * "Koleksiyonu keşfet" under the product page. Everything shown comes from the
 * collection as set in the admin (Katalog → Koleksiyonlar): cover photo, name,
 * short description, description, colour and product count. A product without
 * a live collection gets the live collections instead.
 */
export default async function ProductCollectionDiscovery({ collectionSlug }: Props) {
  const [collection, view] = collectionSlug
    ? await Promise.all([getCollectionBySlug(collectionSlug), getCollectionView(collectionSlug)])
    : [null, null]

  if (collection && view) {
    const image = collection.heroImage || view.heroImage
    const tagline = collection.shortDescription || view.tagline
    const statement = collection.description || view.description
    return (
      <section className={styles.section} aria-label={`${collection.name} koleksiyonu`}>
        <Link href={`/koleksiyon/${collection.slug}`} className={styles.card}>
          <div className={styles.content}>
            <span className={styles.eyebrow}>
              <span className={styles.dot} style={{ backgroundColor: collection.accentColor || view.accentColor }} aria-hidden />
              koleksiyonu keşfet
              {collection.productCount > 0 && <> · {collection.productCount} ürün</>}
            </span>
            <h2 className={styles.title}>{collection.name.toLocaleLowerCase('tr-TR')}</h2>
            {tagline && <p className={styles.tagline}>{tagline}</p>}
            {statement && statement !== tagline && <p className={styles.statement}>{statement}</p>}
            <div className={styles.actionWrap}>
              <span className={styles.ctaLink}>
                <span>tüm {collection.name.toLocaleLowerCase('tr-TR')} ürünleri</span>
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </span>
            </div>
          </div>

          {image && !image.endsWith('/placeholder.png') && (
            <div className={`${styles.imageFrame} img-frame`}>
              <Image src={image} alt={`${collection.name} koleksiyonu`} fill sizes="(max-width: 900px) 100vw, 420px" className={styles.image} />
              <div className={styles.imageScrim} aria-hidden="true" />
            </div>
          )}
        </Link>
      </section>
    )
  }

  // No live collection: offer the collections that have products
  const live = (await getCollections()).filter((c) => c.productCount > 0).slice(0, 4)
  if (live.length === 0) return null
  return (
    <section className={styles.section} aria-label="koleksiyonları keşfet">
      <div className={styles.listHead}>
        <span className={styles.eyebrow}>koleksiyonları keşfet</span>
        <Link href="/koleksiyonlar" className={styles.ctaLink}>
          <span>tüm koleksiyonlar</span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
        </Link>
      </div>
      <ul className={styles.miniGrid}>
        {live.map((c) => (
          <li key={c.slug}>
            <Link href={`/koleksiyon/${c.slug}`} className={styles.miniCard}>
              {c.heroImage && (
                <span className={`${styles.miniImage} img-frame`}>
                  <Image src={c.heroImage} alt={`${c.name} koleksiyonu`} fill sizes="(max-width: 900px) 50vw, 280px" className={styles.image} />
                </span>
              )}
              <span className={styles.miniBody}>
                <span className={styles.miniName}>
                  <span className={styles.dot} style={{ backgroundColor: c.accentColor || '#70706a' }} aria-hidden />
                  {c.name.toLocaleLowerCase('tr-TR')}
                </span>
                {c.shortDescription && <span className={styles.miniText}>{c.shortDescription}</span>}
                <span className={styles.miniCount}>{c.productCount} ürün</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
