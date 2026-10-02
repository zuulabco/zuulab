import Link from 'next/link'
import Image from 'next/image'
import { getCollectionView } from '@/lib/services/catalog/collection-presentation'
import styles from './ProductCollectionDiscovery.module.css'

interface Props {
  collectionSlug?: string
  collectionName?: string
  productName: string
}

export default async function ProductCollectionDiscovery({
  collectionSlug,
  collectionName,
  productName,
}: Props) {
  // The product's brand collection, only while that collection is live.
  const config = collectionSlug ? await getCollectionView(collectionSlug) : null

  if (config) {
    const imageUrl = config.secondaryImage || config.heroImage
    return (
      <section className={styles.section} aria-label={`${config.name} koleksiyonu`}>
        <div className={styles.card}>
          <div className={styles.content}>
            <span className={styles.eyebrow}>koleksiyonu keşfet</span>
            <h2 className={styles.title}>{config.name}</h2>
            <p className={styles.tagline}>{config.tagline}</p>
            <p className={styles.statement}>{config.editorialStatement}</p>
            
            <div className={styles.actionWrap}>
              <Link href={`/koleksiyon/${config.slug}`} className={styles.ctaLink}>
                <span>tüm {config.name} serisini keşfedin</span>
                <span className={styles.arrow} aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          {imageUrl && (
            <div className={styles.imageFrame}>
              <Image
                src={imageUrl}
                alt={`${config.name} koleksiyonu`}
                fill
                sizes="(max-width: 768px) 100vw, 420px"
                className={styles.image}
              />
              <div className={styles.imageScrim} aria-hidden="true" />
            </div>
          )}
        </div>
      </section>
    )
  }

  // Fallback to general collection discovery
  return (
    <section className={styles.section} aria-label="koleksiyonları keşfet">
      <div className={styles.card}>
        <div className={styles.content}>
          <span className={styles.eyebrow}>özel seriler</span>
          <h2 className={styles.title}>zuulab koleksiyonları</h2>
          <p className={styles.tagline}>amaca ve mekana özel 3d tasarım serileri</p>
          <p className={styles.statement}>
            zuukids çocuk evreninden zuulife parametrik masa objelerine ve zuulight ambiyans aydınlatmalarına uzanan özgün koleksiyonlarımızı keşfedin.
          </p>

          <div className={styles.actionWrap}>
            <Link href="/koleksiyonlar" className={styles.ctaLink}>
              <span>tüm koleksiyonları görüntüle</span>
              <span className={styles.arrow} aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className={styles.imageFrame}>
          <Image
            src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=85"
            alt="zuulab koleksiyonları"
            fill
            sizes="(max-width: 768px) 100vw, 420px"
            className={styles.image}
          />
          <div className={styles.imageScrim} aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
