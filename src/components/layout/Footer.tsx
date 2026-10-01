import Link from 'next/link'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import styles from './Footer.module.css'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className={styles.footer}>
      <div className="container">
        {/* Main grid */}
        <div className={styles.grid}>
          {/* Brand column */}
          <div className={styles.brand}>
            <Link href="/" className={styles.logo}>
              <span className={styles.logoText}>zuulab</span>
              <span className={styles.logoDot} aria-hidden />
            </Link>
            <p className={styles.tagline}>
              üç boyutlu tasarım ve hassas katman üretimi.<br />
              istanbul, türkiye.
            </p>
            <div className={styles.socials}>
              <a
                href="https://instagram.com/zuulab"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Zuulab Instagram"
              >
                <InstagramIcon />
              </a>
              <a
                href="https://twitter.com/zuulab"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Zuulab Twitter/X"
              >
                <TwitterIcon />
              </a>
              <a
                href="https://youtube.com/zuulab"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Zuulab YouTube"
              >
                <YoutubeIcon />
              </a>
            </div>
          </div>

          {/* Koleksiyonlar */}
          <div className={styles.col}>
            <h3 className={styles.colTitle}>koleksiyonlar</h3>
            <ul className={styles.links}>
              <li><Link href="/koleksiyonlar">tüm koleksiyonlar</Link></li>
              <li><Link href="/koleksiyon/zuukids">zuukids</Link></li>
              <li><Link href="/koleksiyon/zuulife">zuulife</Link></li>
              <li><Link href="/koleksiyon/zuulight">zuulight</Link></li>
              <li><Link href="/koleksiyon/zuutoptan">zuutoptan</Link></li>
            </ul>
          </div>

          {/* Hesabım */}
          <div className={styles.col}>
            <h3 className={styles.colTitle}>hesabım</h3>
            <ul className={styles.links}>
              <li><Link href="/hesap">genel bakış</Link></li>
              <li><Link href="/hesap/siparisler">siparişlerim</Link></li>
              <li><Link href="/hesap/favoriler">favorilerim</Link></li>
              <li><Link href="/hesap/adresler">adreslerim</Link></li>
              <li><Link href="/hesap/profil">profilim</Link></li>
              <li><Link href="/hesap/destek">destek talepleri</Link></li>
            </ul>
          </div>

          {/* Kurumsal */}
          <div className={styles.col}>
            <h3 className={styles.colTitle}>kurumsal</h3>
            <ul className={styles.links}>
              <li><Link href="/hakkimizda">hakkımızda</Link></li>
              <li><Link href="/uretim-sureci">üretim süreci</Link></li>
              <li><Link href="/iletisim">iletişim</Link></li>
            </ul>
          </div>

          {/* Yasal */}
          <div className={styles.col}>
            <h3 className={styles.colTitle}>yasal</h3>
            <ul className={styles.links}>
              <li><Link href="/gizlilik-politikasi">gizlilik politikası</Link></li>
              <li><Link href="/kullanim-kosullari">kullanım koşulları</Link></li>
              <li><Link href="/iade-politikasi">iade politikası</Link></li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Bottom bar */}
        <div className={styles.bottom}>
          <div className={styles.bottomLeft}>
            <span className={styles.mascotMark} aria-hidden="true">
              <ZuuMascotIcon size={16} />
            </span>
            <p className={styles.copyright}>
              © {year} zuulab. tüm hakları saklıdır.
            </p>
          </div>
          <div className={styles.paymentBadges}>
            <span className={styles.payBadge}>PayTR</span>
            <span className={styles.payBadge}>3D Secure</span>
            <span className={styles.payBadge}>256-bit SSL</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function TwitterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function YoutubeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
      <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" />
    </svg>
  )
}
