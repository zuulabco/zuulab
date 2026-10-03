import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import styles from '../ContentPage.module.css'

export const metadata: Metadata = {
  title: 'Hakkımızda',
  description:
    'Zuulab, İstanbul merkezli tasarım odaklı katmanlı üretim stüdyosudur. 3D printing ile günlük yaşam nesnelerini yeniden tasarlıyoruz.',
}

const COLLECTIONS = [
  {
    slug: 'zuukids',
    logo: '/zuukids_logo.svg',
    desc: 'Çocuk odaları ve yaratıcı alanlar için hayvan karakterli organizasyon ve dekor ürünleri.',
    meta: 'oyuncak · dekor · organizasyon',
  },
  {
    slug: 'zuulife',
    logo: '/zuulife_logo.svg',
    desc: 'Çalışma masası, günlük kullanım ve ev aksesuarları için işlevsel nesneler.',
    meta: 'masaüstü · ev · aksesuar',
  },
  {
    slug: 'zuulight',
    logo: '/zuulight_logo.svg',
    desc: 'FDM baskı tekniğiyle üretilen orijinal filaman aydınlatmalar.',
    meta: 'aydınlatma · tasarım · filaman',
  },
  {
    slug: 'zuutoptan',
    logo: '/zuutoptan_logo.svg',
    desc: 'Ticari alıcılara ve bayilere yönelik toplu sipariş ve özel üretim seçenekleri.',
    meta: 'toptan · kurumsal · özel üretim',
  },
]

export default function HakkimizdaPage() {
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
          Zuulab, İstanbul merkezli bağımsız bir tasarım ve üretim stüdyosudur.
          3D printing'i endüstriyel bir araç olarak kullanıyor; günlük nesneleri
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
          <div className={styles.section}>
            <span className={styles.sectionLabel}>koleksiyonlar</span>
            <nav className={styles.collectionsGrid} aria-label="Zuu koleksiyonları">
              {COLLECTIONS.map((col) => (
                <Link
                  key={col.slug}
                  href={`/kategori/${col.slug}`}
                  className={styles.collectionRow}
                >
                  <div className={styles.collectionLogoWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={col.logo}
                      alt={col.slug}
                      style={{ maxHeight: 28, maxWidth: 140, width: 'auto', objectFit: 'contain' }}
                    />
                  </div>
                  <div className={styles.collectionInfo}>
                    <span className={styles.collectionDesc}>{col.desc}</span>
                    <span className={styles.collectionMeta}>{col.meta}</span>
                  </div>
                  <span className={styles.collectionArrow} aria-hidden>→</span>
                </Link>
              ))}
            </nav>
          </div>
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
              <span className={styles.infoValue}>Kadıköy, İstanbul — Türkiye</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>üretim yöntemi</span>
              <span className={styles.infoValue}>talep üzerine (on-demand), sıfır atık</span>
            </div>
            <div className={styles.infoSeparator} />
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>iletişim</span>
              <a href="mailto:info@zuulab.com" className={styles.infoLink}>
                info@zuulab.com
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
