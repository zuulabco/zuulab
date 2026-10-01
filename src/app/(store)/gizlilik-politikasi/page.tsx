import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import styles from '../ContentPage.module.css'

export const metadata: Metadata = {
  title: 'Gizlilik ve Güvenlik Politikası — Zuulab',
  description: 'Zuulab kişisel verilerin korunması, çerez politikası ve gizlilik ilkeleri.',
}

export default function GizlilikPolitikasiPage() {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.breadcrumbRow}>
        <Breadcrumbs items={[{ label: 'Gizlilik Politikası' }]} />
      </div>

      <header className={styles.pageHero}>
        <span className={styles.heroEyebrow}>zuulab / yasal</span>
        <h1 className={styles.heroTitle}>gizlilik ve güvenlik politikası</h1>
      </header>

      <article className={`${styles.legalPage} ${styles.prose}`}>
        <div className={styles.legalDisclaimer}>
          hukuki bilgilendirme notu — Bu metin Zuulab e-ticaret platformunun
          teknik mimarisi kapsamında hazırlanmış kurumsal bir taslaktır. Canlı satış
          öncesinde yürürlükteki 6698 sayılı KVKK ve ilgili mevzuat uyarınca şirket
          hukuk danışmanı tarafından nihai onaya tabidir.
        </div>

        <section className={styles.sectionFirst}>
          <h2>1. veri sorumlusu</h2>
          <p>
            Zuulab Tasarım ve Üretim Teknolojileri ("Zuulab" veya "Şirket"), web sitemiz
            üzerinden sunduğumuz hizmetlerden faydalanan müşterilerimizin ve
            ziyaretçilerimizin kişisel verilerinin güvenliğine ve gizliliğine azami
            önem vermektedir.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. işlenen kişisel veriler</h2>
          <ul>
            <li>
              <strong>Kimlik ve İletişim:</strong> Ad, soyad, e-posta adresi, telefon numarası.
            </li>
            <li>
              <strong>Teslimat ve Fatura:</strong> Teslimat adresi, il/ilçe, posta kodu,
              şirket vergi bilgileri (kurumsal fatura taleplerinde).
            </li>
            <li>
              <strong>İşlem ve Sipariş:</strong> Satın alınan ürünler, sepet detayları,
              kargo takip bilgileri, destek yazışmaları.
            </li>
            <li>
              <strong>Ödeme Güvenliği:</strong> Kredi kartı bilgileri sistemlerimizde asla
              saklanmaz; doğrudan BDDK lisanslı ödeme sağlayıcımız (PayTR) üzerinden
              256-bit SSL şifrelemeyle işlenir.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>3. kişisel verilerin aktarımı</h2>
          <p>
            Kişisel verileriniz yalnızca siparişinizin teslimini sağlamak amacıyla
            yetkili kargo sağlayıcılarına (Sürat Kargo, Yurtiçi Kargo), yasal
            faturalandırma için e-Fatura entegratörüne (Uyumsoft) ve yasal zorunluluk
            halinde yetkili kamu kurumlarına aktarılır.
          </p>
        </section>

        <section className={styles.section}>
          <h2>4. ilgili kişi hakları (kvkk madde 11)</h2>
          <p>
            Veri sahibi olarak, kişisel verilerinizin işlenip işlenmediğini öğrenme,
            silinmesini veya düzeltilmesini talep etme haklarına sahipsiniz. Taleplerinizi{' '}
            <a href="mailto:info@zuulab.com">info@zuulab.com</a> adresine iletebilirsiniz.
          </p>
        </section>
      </article>
    </div>
  )
}
