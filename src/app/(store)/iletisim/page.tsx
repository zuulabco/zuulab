import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo/metadata'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import IletisimClient from './IletisimClient'
import styles from '../ContentPage.module.css'

export const metadata: Metadata = pageMetadata({
  title: 'İletişim',
  description:
    'zuulab ile iletişime geçin: sipariş soruları, kişiye özel tasarım ve toptan üretim talepleri için e-posta, destek talebi ve sosyal medya kanalları.',
  path: '/iletisim',
})

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
