import Link from 'next/link'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import FooterColumn from './FooterColumn'
import { getActiveSocialLinks } from '@/lib/services/social.service'
import { SOCIAL_PLATFORMS, SocialIcon } from '@/lib/social/platforms'
import styles from './Footer.module.css'

export default async function Footer() {
  const year = new Date().getFullYear()
  // Links from Vitrin → Sosyal medya
  const socials = await getActiveSocialLinks()

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
              bolu, türkiye.
            </p>
            {socials.length > 0 && (
              <div className={styles.socials}>
                {socials.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`zuulab ${SOCIAL_PLATFORMS[link.platform].name}`}
                    title={SOCIAL_PLATFORMS[link.platform].name}
                  >
                    <SocialIcon platform={link.platform} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Koleksiyonlar */}
          <FooterColumn title="koleksiyonlar">
            <ul className={styles.links}>
              <li><Link href="/koleksiyonlar">tüm koleksiyonlar</Link></li>
              <li><Link href="/koleksiyon/zuukids">zuukids</Link></li>
              <li><Link href="/koleksiyon/zuulife">zuulife</Link></li>
              <li><Link href="/koleksiyon/zuulight">zuulight</Link></li>
              <li><Link href="/koleksiyon/zuutoptan">zuutoptan</Link></li>
            </ul>
          </FooterColumn>

          {/* Hesabım */}
          <FooterColumn title="hesabım">
            <ul className={styles.links}>
              <li><Link href="/hesap">genel bakış</Link></li>
              <li><Link href="/hesap/siparisler">siparişlerim</Link></li>
              <li><Link href="/hesap/favoriler">favorilerim</Link></li>
              <li><Link href="/hesap/adresler">adreslerim</Link></li>
              <li><Link href="/hesap/profil">profilim</Link></li>
              <li><Link href="/hesap/destek">destek talepleri</Link></li>
            </ul>
          </FooterColumn>

          {/* Kurumsal */}
          <FooterColumn title="kurumsal">
            <ul className={styles.links}>
              <li><Link href="/hakkimizda">hakkımızda</Link></li>
              <li><Link href="/uretim-sureci">üretim süreci</Link></li>
              <li><Link href="/iletisim">iletişim</Link></li>
            </ul>
          </FooterColumn>

          {/* Yasal */}
          <FooterColumn title="yasal">
            <ul className={styles.links}>
              <li><Link href="/gizlilik-politikasi">gizlilik politikası</Link></li>
              <li><Link href="/kullanim-kosullari">kullanım koşulları</Link></li>
              <li><Link href="/iade-politikasi">iade politikası</Link></li>
            </ul>
          </FooterColumn>
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



