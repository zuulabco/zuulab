import Link from 'next/link'
import Image from 'next/image'
import styles from './CategoryBanners.module.css'

interface BannerItem {
  id: string
  title: string
  tag: string
  desc: string
  href: string
  image: string
  alt: string
}

const BANNERS: BannerItem[] = [
  {
    id: 'zuukids',
    title: 'zuukids',
    tag: 'çocuk dünyası · biyo-pla',
    desc: 'çocuklar için güvenli, yumuşak yüzeyli eğitici figürler ve montessori serisi.',
    href: '/koleksiyon/zuukids',
    image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1200&q=85',
    alt: 'zuukids 3d baskı çocuk oyuncakları ve figürleri',
  },
  {
    id: 'zuulife',
    title: 'zuulife',
    tag: 'yaşam alanı',
    desc: 'masaüstü ve takı organizerleri, günlük düzeni sadeleştiren ev objeleri.',
    href: '/koleksiyon/zuulife',
    image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=85',
    alt: 'zuulife parametrik masa objeleri ve iç mekan tasarımları',
  },
  {
    id: 'zuulight',
    title: 'zuulight',
    tag: 'aydınlatma',
    desc: 'parametrik desenli masa lambaları; katmanlardan süzülen ışık ve duvara düşen gölge desenleri.',
    href: '/koleksiyon/zuulight',
    image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=85',
    alt: 'zuulight masa lambası ve ambiyans ışığı',
  },
]

export default function CategoryBanners() {
  return (
    <section className={styles.section} aria-label="koleksiyonları keşfet">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.sectionTitle}>koleksiyonları keşfet</h2>
          <Link href="/koleksiyonlar" className={styles.allLink}>
            <span>tüm koleksiyonlar</span>
            <span aria-hidden>→</span>
          </Link>
        </div>

        <div className={styles.grid}>
          {BANNERS.map((banner) => (
            <Link key={banner.id} href={banner.href} className={styles.banner}>
              <div className={styles.imageFrame}>
                <Image
                  src={banner.image}
                  alt={banner.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className={styles.bannerImg}
                />
              </div>

              <div className={styles.scrim} aria-hidden />

              <div className={styles.content}>
                <span className={styles.tag}>{banner.tag}</span>
                <h3 className={styles.title}>{banner.title}</h3>
                <p className={styles.desc}>{banner.desc}</p>
                <span className={styles.cta}>
                  <span>keşfet</span>
                  <span className={styles.ctaArrow} aria-hidden>→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
