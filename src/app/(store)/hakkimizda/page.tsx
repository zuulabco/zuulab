import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo/metadata'
import Image from 'next/image'
import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { getCollectionViews } from '@/lib/services/catalog/collection-presentation'
import styles from '../ContentPage.module.css'

export const metadata: Metadata = pageMetadata({
  title: 'Hakkımızda',
  description:
    'zuulab, Bolu’da kendi atölyesinde 3D baskıyla lamba, oyuncak ve ev objeleri tasarlayıp üreten bağımsız bir tasarım stüdyosudur. Hikayemiz ve ilkelerimiz.',
  path: '/hakkimizda',
})

/** Brand worlds shown here, in this order, with this page's own one-line pitch */
const COLLECTIONS: Array<{ slug: string; desc: string; meta: string }> = [
  { slug: 'zuukids', desc: 'Çocuk odaları ve yaratıcı alanlar için oyuncak, dekor ve düzenleyiciler.', meta: 'çocuk · eğitim' },
  { slug: 'zuulife', desc: 'Çalışma masası, günlük kullanım ve ev için işlevsel nesneler.', meta: 'masaüstü · ev' },
  { slug: 'zuulight', desc: 'FDM baskıyla üretilen özgün masa lambaları ve aydınlatmalar.', meta: 'aydınlatma' },
  { slug: 'zuutoptan', desc: 'İşletmelere toplu sipariş ve kişiye özel üretim.', meta: 'toptan · kurumsal' },
]

export default async function HakkimizdaPage() {
  // Names, photos and colours as set in the admin; only live collections are shown
  const views = new Map((await getCollectionViews()).map((v) => [v.slug, v]))
  const collections = COLLECTIONS.flatMap((c) => {
    const view = views.get(c.slug)
    return view ? [{ ...c, view }] : []
  })

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.breadcrumbRow}>
        <Breadcrumbs items={[{ label: 'Hakkımızda' }]} />
      </div>

      {/* ── Hero ──────────────────────────────────────────── */}
      <header className={styles.pageHero}>
        <span className={styles.heroEyebrow}>zuulab / hakkımızda</span>
        <h1 className={styles.heroTitle}>
          fikirleri fiziksel şeylere dönüştürüyoruz.
        </h1>
        <p className={styles.heroLead}>
          zuulab, Bolu’da kendi atölyesinde üretim yapan bağımsız bir tasarım stüdyosudur.
          3D printing’i endüstriyel bir araç olarak kullanıyor; günlük nesneleri
          yeniden tasarlıyoruz.
        </p>
      </header>

      {/* ── İki kolon: hikaye + bilgi bloku ───────────────── */}
      <div className={styles.twoCol}>
        {/* Sol: Marka hikayesi */}
        <div>
          {/* Biz kimiz */}
          <div className={styles.sectionFirst}>
            <span className={styles.sectionLabel}>stüdyo</span>
            <article className={styles.prose}>
              <p>
                Geleneksel seri üretimin getirdiği tekdüzelik yerine; özenli
                kalibrasyon, bitki kaynaklı PLA gibi malzemeler ve modüler tasarım
                prensipleriyle çalışıyoruz.
              </p>
              <p>
                Her ürün, dijital geometriden başlayıp elle bitirilmiş bir nesneye
                dönüşüyor. Tasarım ve üretim aynı atölyede, aynı ekip tarafından
                gerçekleşiyor.
              </p>
            </article>
          </div>

          {/* Üretim felsefesi */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>üretim felsefesi</span>
            <article className={styles.prose}>
              <ul>
                <li>
                  <strong>Sıfır atık hedefi:</strong> talep üzerine (on-demand) üretim
                  yaparak aşırı stok ve ham madde israfını engelliyoruz.
                </li>
                <li>
                  <strong>Çevre dostu malzemeler:</strong> mısır nişastası ve şeker
                  kamışından elde edilen endüstriyel PLA+ ve geri dönüştürülebilir
                  PETG filamentler kullanıyoruz.
                </li>
                <li>
                  <strong>Kendi atölyemizde:</strong> her ürünü 3d yazıcılarımızda katman
                  katman basıyor, elden geçirip paketliyoruz.
                </li>
              </ul>
            </article>
          </div>

          {/* Metrikler */}
          <div className={styles.metricsRow}>
            <div className={styles.metric}>
              <span className={styles.metricValue}>3d</span>
              <span className={styles.metricLabel}>katman katman baskı</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricValue}>%100</span>
              <span className={styles.metricLabel}>biyo-bozunur pla</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricValue}>0 atık</span>
              <span className={styles.metricLabel}>talep üzerine üretim</span>
            </div>
          </div>

          {/* Koleksiyonlar */}
          {collections.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>koleksiyonlar</span>
              <nav className={styles.collectionCards} aria-label="zuulab koleksiyonları">
                {collections.map(({ slug, desc, meta, view }) => (
                  <Link key={slug} href={`/koleksiyon/${slug}`} className={styles.collectionCard}>
                    <span className={`${styles.collectionMedia} img-frame`}>
                      <Image
                        src={view.heroImage}
                        alt={`${view.name} koleksiyonu`}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 360px"
                        className={styles.collectionImg}
                      />
                    </span>
                    <span className={styles.collectionScrim} aria-hidden />
                    <span className={styles.collectionBody}>
                      <span className={styles.collectionTag}>
                        <span className={styles.collectionDot} style={{ backgroundColor: view.accentColor }} aria-hidden />
                        {meta}
                        {view.productCount > 0 && <> · {view.productCount} ürün</>}
                      </span>
                      <span className={styles.collectionName}>{view.name.toLocaleLowerCase('tr-TR')}</span>
                      <span className={styles.collectionDesc}>{desc}</span>
                      <span className={styles.collectionCta}>
                        keşfet <span aria-hidden>→</span>
                      </span>
                    </span>
                  </Link>
                ))}
              </nav>
            </div>
          )}
        </div>

        {/* Sağ: Bilgi bloku */}
        <aside>
          <div className={styles.infoBlock}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>tür</span>
              <span className={styles.infoValue}>bağımsız tasarım & üretim stüdyosu</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>teknoloji</span>
              <span className={styles.infoValue}>FDM / FFF katmanlı üretim (3D printing)</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>malzeme</span>
              <span className={styles.infoValue}>Endüstriyel PLA+, PETG, biyo-polimer</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>konum</span>
              <span className={styles.infoValue}>Bolu, Türkiye</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>üretim yöntemi</span>
              <span className={styles.infoValue}>talep üzerine (on-demand), sıfır atık</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>iletişim</span>
              <a href="mailto:zuulab.co@gmail.com" className={styles.infoLink}>
                zuulab.co@gmail.com
              </a>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>üretim süreci</span>
              <Link href="/uretim-sureci" className={styles.infoLink}>
                nasıl üretiyoruz →
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
