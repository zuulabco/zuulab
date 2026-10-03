import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { getCollectionViews } from '@/lib/services/catalog/collection-presentation'
import styles from './CollectionsDiscovery.module.css'

export const metadata: Metadata = {
  title: 'Koleksiyonlar',
  description:
    'zuulab özel tasarım dünyaları ve tematik seriler. zuukids, zuulife, zuulight, zuutoptan ve deneysel form koleksiyonları.',
}

// The brand worlds with a hand-designed slot on this page.
const FEATURED_SLUGS = ['zuukids', 'zuulife', 'zuulight', 'zuutoptan', 'koleksiyonlar']

export default async function CollectionsDiscoveryPage() {
  // Only collections that are live in the admin appear; a deactivated one drops
  // out of its slot, and collections added later are listed after the features.
  const views = await getCollectionViews()
  const bySlug = new Map(views.map((v) => [v.slug, v]))
  const kids = bySlug.get('zuukids')
  const life = bySlug.get('zuulife')
  const light = bySlug.get('zuulight')
  const toptan = bySlug.get('zuutoptan')
  const limited = bySlug.get('koleksiyonlar')
  const others = views.filter((v) => !FEATURED_SLUGS.includes(v.slug))

  return (
    <div className={`container ${styles.pageRoot}`}>
      <Breadcrumbs items={[{ label: 'koleksiyonlar' }]} />

      <header className={styles.header}>
        <div className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden />
          <span>zuulab / dünyalar & tematik seriler</span>
        </div>
        <h1 className={styles.title}>koleksiyonlar</h1>
        <p className={styles.subtitle}>
          farklı yaşam ritimlerine, mekanlara ve fonksiyonel arayışlara adanmış 3d üretim evrenleri.
          her koleksiyon kendine özgü tasarım dili ve malzeme seçimiyle şekillenir.
        </p>
      </header>

      <div className={styles.showcaseGrid}>
        {/* ── Feature 01: Hero Pair (zuukids & zuulife) ── */}
        <div className={styles.duoRow}>
          {kids && (
            <Link
              href={`/koleksiyon/${kids.slug}`}
              className={styles.card}
              aria-label={`${kids.name} koleksiyonunu keşfet`}
            >
              <div className={styles.imgWrap}>
                <Image
                  src={kids.heroImage}
                  alt={kids.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className={styles.img}
                  priority
                />
                <span
                  className={styles.accentDot}
                  style={{ backgroundColor: kids.accentColor }}
                  aria-hidden
                />
                <span className={styles.themeBadge}>çocuk & eğitim</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitleRow}>
                  <h2 className={styles.cardName}>{kids.name}</h2>
                </div>
                <p className={styles.cardTagline}>{kids.tagline}</p>
                <p className={styles.cardExcerpt}>{kids.editorialTitle}</p>
                <ul className={styles.pillarList}>
                  {kids.pillars.slice(0, 3).map((p) => (
                    <li key={p.title} className={styles.pillarItem}>
                      {p.title}
                    </li>
                  ))}
                </ul>
                <div className={styles.cardCta}>
                  <span>koleksiyonu keşfet</span>
                  <span className={styles.cardArrow} aria-hidden>→</span>
                </div>
              </div>
            </Link>
          )}

          {life && (
            <Link
              href={`/koleksiyon/${life.slug}`}
              className={styles.card}
              aria-label={`${life.name} koleksiyonunu keşfet`}
            >
              <div className={styles.imgWrap}>
                <Image
                  src={life.heroImage}
                  alt={life.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className={styles.img}
                  priority
                />
                <span
                  className={styles.accentDot}
                  style={{ backgroundColor: life.accentColor }}
                  aria-hidden
                />
                <span className={styles.themeBadge}>yaşam & masaüstü</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitleRow}>
                  <h2 className={styles.cardName}>{life.name}</h2>
                </div>
                <p className={styles.cardTagline}>{life.tagline}</p>
                <p className={styles.cardExcerpt}>{life.editorialTitle}</p>
                <ul className={styles.pillarList}>
                  {life.pillars.slice(0, 3).map((p) => (
                    <li key={p.title} className={styles.pillarItem}>
                      {p.title}
                    </li>
                  ))}
                </ul>
                <div className={styles.cardCta}>
                  <span>koleksiyonu keşfet</span>
                  <span className={styles.cardArrow} aria-hidden>→</span>
                </div>
              </div>
            </Link>
          )}
        </div>

        {/* ── Feature 02: Wide Atmospheric Showcase (zuulight) ── */}
        {light && (
          <Link
            href={`/koleksiyon/${light.slug}`}
            className={styles.wideCard}
            aria-label={`${light.name} koleksiyonunu keşfet`}
          >
            <div className={styles.wideImgWrap}>
              <Image
                src={light.heroImage}
                alt={light.name}
                fill
                sizes="(max-width: 900px) 100vw, 60vw"
                className={styles.img}
              />
              <span
                className={styles.accentDot}
                style={{ backgroundColor: light.accentColor }}
                aria-hidden
              />
              <span className={styles.themeBadge}>ambiyans aydınlatma</span>
            </div>
            <div className={styles.wideCardBody}>
              <div className={styles.cardTitleRow}>
                <h2 className={styles.cardName}>{light.name}</h2>
              </div>
              <p className={styles.cardTagline}>{light.tagline}</p>
              <p className={styles.cardExcerpt}>{light.editorialStatement}</p>
              <ul className={styles.pillarList}>
                {light.pillars.slice(0, 3).map((p) => (
                  <li key={p.title} className={styles.pillarItem}>
                    {p.title}
                  </li>
                ))}
              </ul>
              <div className={styles.cardCta}>
                <span>aydınlatma serisini keşfet</span>
                <span className={styles.cardArrow} aria-hidden>→</span>
              </div>
            </div>
          </Link>
        )}

        {/* ── Feature 03: Balanced Duo (zuutoptan & koleksiyonlar sınırlı seri) ── */}
        <div className={styles.duoRow}>
          {toptan && (
            <Link
              href={`/koleksiyon/${toptan.slug}`}
              className={styles.card}
              aria-label={`${toptan.name} koleksiyonunu keşfet`}
            >
              <div className={styles.imgWrap}>
                <Image
                  src={toptan.heroImage}
                  alt={toptan.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className={styles.img}
                />
                <span
                  className={styles.accentDot}
                  style={{ backgroundColor: toptan.accentColor }}
                  aria-hidden
                />
                <span className={styles.themeBadge}>kurumsal & b2b</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitleRow}>
                  <h2 className={styles.cardName}>{toptan.name}</h2>
                </div>
                <p className={styles.cardTagline}>{toptan.tagline}</p>
                <p className={styles.cardExcerpt}>{toptan.editorialStatement}</p>
                <ul className={styles.pillarList}>
                  {toptan.pillars.slice(0, 3).map((p) => (
                    <li key={p.title} className={styles.pillarItem}>
                      {p.title}
                    </li>
                  ))}
                </ul>
                <div className={styles.cardCta}>
                  <span>kurumsal üretimi keşfet</span>
                  <span className={styles.cardArrow} aria-hidden>→</span>
                </div>
              </div>
            </Link>
          )}

          {limited && (
            <Link
              href={`/koleksiyon/${limited.slug}`}
              className={styles.card}
              aria-label={`${limited.name} sınırlı serisini keşfet`}
            >
              <div className={styles.imgWrap}>
                <Image
                  src={limited.heroImage}
                  alt={limited.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className={styles.img}
                />
                <span
                  className={styles.accentDot}
                  style={{ backgroundColor: limited.accentColor }}
                  aria-hidden
                />
                <span className={styles.themeBadge}>sınırlı seri · deneysel</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitleRow}>
                  <h2 className={styles.cardName}>{limited.name}</h2>
                </div>
                <p className={styles.cardTagline}>{limited.tagline}</p>
                <p className={styles.cardExcerpt}>{limited.editorialStatement}</p>
                <ul className={styles.pillarList}>
                  {limited.pillars.slice(0, 3).map((p) => (
                    <li key={p.title} className={styles.pillarItem}>
                      {p.title}
                    </li>
                  ))}
                </ul>
                <div className={styles.cardCta}>
                  <span>deneysel formları keşfet</span>
                  <span className={styles.cardArrow} aria-hidden>→</span>
                </div>
              </div>
            </Link>
          )}
        </div>

        {others.length > 0 && (
          <div className={styles.duoRow}>
            {others.map((c) => (
              <Link
                key={c.slug}
                href={`/koleksiyon/${c.slug}`}
                className={styles.card}
                aria-label={`${c.name} koleksiyonunu keşfet`}
              >
                <div className={styles.imgWrap}>
                  <Image
                    src={c.heroImage}
                    alt={c.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className={styles.img}
                  />
                  <span className={styles.accentDot} style={{ backgroundColor: c.accentColor }} aria-hidden />
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardTitleRow}>
                    <h2 className={styles.cardName}>{c.name}</h2>
                  </div>
                  {c.tagline && <p className={styles.cardTagline}>{c.tagline}</p>}
                  {c.editorialStatement && <p className={styles.cardExcerpt}>{c.editorialStatement}</p>}
                  <div className={styles.cardCta}>
                    <span>koleksiyonu keşfet</span>
                    <span className={styles.cardArrow} aria-hidden>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom Atölye Strip ── */}
      <div className={styles.bottomStrip}>
        <Link href="/urunler" className={styles.bottomLink}>
          <span>tüm ürün kataloğunu görüntüle</span>
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  )
}
