import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import IletisimClient from './IletisimClient'
import styles from '../ContentPage.module.css'

export const metadata: Metadata = {
  title: 'İletişim — Zuulab',
  description:
    'Zuulab ile iletişim kurun. E-posta, telefon, atölye adresi ve destek kanalları.',
}

export default function IletisimPage() {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.breadcrumbRow}>
        <Breadcrumbs items={[{ label: 'İletişim' }]} />
      </div>

      <header className={styles.pageHero}>
        <span className={styles.heroEyebrow}>zuulab / iletişim</span>
        <h1 className={styles.heroTitle}>iletişime geçin.</h1>
        <p className={styles.heroLead}>
          Özel tasarım talepleri, toptan siparişler veya sorularınız için dilediğiniz
          kanaldan bize ulaşabilirsiniz.
        </p>
      </header>

      <IletisimClient />
    </div>
  )
}
