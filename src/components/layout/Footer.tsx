import Link from 'next/link'
import ZuuMascotIcon from '@/components/common/ZuuMascotIcon'
import FooterColumn from './FooterColumn'
import { getActiveSocialLinks } from '@/lib/services/social.service'
import { SOCIAL_PLATFORMS, SocialIcon } from '@/lib/social/platforms'
import { COMPANY } from '@/config/company'
import { CORPORATE_PAGES, LEGAL_DOCS } from '@/lib/legal/documents'
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
            <Link prefetch={false} href="/" className={styles.logo}>
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
              <li><Link prefetch={false} href="/koleksiyonlar">tüm koleksiyonlar</Link></li>
              <li><Link prefetch={false} href="/koleksiyon/zuukids">zuukids</Link></li>
              <li><Link prefetch={false} href="/koleksiyon/zuulife">zuulife</Link></li>
              <li><Link prefetch={false} href="/koleksiyon/zuulight">zuulight</Link></li>
              <li><Link prefetch={false} href="/koleksiyon/zuutoptan">zuutoptan</Link></li>
            </ul>
          </FooterColumn>

          {/* Hesabım */}
          <FooterColumn title="hesabım">
            <ul className={styles.links}>
              <li><Link prefetch={false} href="/hesap">genel bakış</Link></li>
              <li><Link prefetch={false} href="/hesap/siparisler">siparişlerim</Link></li>
              <li><Link prefetch={false} href="/hesap/favoriler">favorilerim</Link></li>
              <li><Link prefetch={false} href="/hesap/adresler">adreslerim</Link></li>
              <li><Link prefetch={false} href="/hesap/profil">profilim</Link></li>
              <li><Link prefetch={false} href="/hesap/destek">destek talepleri</Link></li>
            </ul>
          </FooterColumn>

          {/* Kurumsal */}
          <FooterColumn title="kurumsal">
            <ul className={styles.links}>
              {CORPORATE_PAGES.map((p) => (
                <li key={p.slug}>
                  <Link prefetch={false} href={`/${p.slug}`}>{p.label}</Link>
                </li>
              ))}
            </ul>
          </FooterColumn>

          {/* Yasal */}
          <FooterColumn title="yasal">
            <ul className={styles.links}>
              {LEGAL_DOCS.map((d) => (
                <li key={d.slug}>
                  <Link prefetch={false} href={`/${d.slug}`}>{d.label}</Link>
                </li>
              ))}
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
          {/* Seller identity (6563 s. Kanun). E-mail and KEP addresses are on the linked
              page rather than in every page's source, out of reach of address harvesters. */}
          <p className={styles.imprint}>
            <Link prefetch={false} href="/satici-bilgileri">{COMPANY.tradeName}</Link> · {COMPANY.district}/{COMPANY.city} ·{' '}
            <a href={`tel:${COMPANY.phoneE164}`}>{COMPANY.phoneDisplay}</a> ·{' '}
            <Link prefetch={false} href="/satici-bilgileri">satıcı bilgileri ve iletişim</Link>
          </p>
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



