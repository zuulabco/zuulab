import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo/metadata'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import styles from '../ContentPage.module.css'

export const metadata: Metadata = pageMetadata({
  title: 'Gizlilik ve güvenlik politikası',
  description:
    'zuulab gizlilik politikası: kişisel verilerin KVKK kapsamında işlenmesi, veri aktarımı, çerez kullanımı ve KVKK madde 11 kapsamındaki haklarınız.',
  path: '/gizlilik-politikasi',
})

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
            Zuulab Tasarım ve Üretim Teknolojileri (“Zuulab” veya “Şirket”), web sitemiz
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
          <p>
            Çerez bandında &quot;tümünü kabul et&quot; seçeneğini işaretlerseniz, site kullanımınıza ilişkin
            istatistiksel veriler (aşağıda 5. bölümde açıklanan) Google Analytics hizmeti aracılığıyla Google&apos;a
            aktarılır. Google bu verileri yurt dışındaki sunucularında işleyebilir; bu aktarım yalnızca açık
            onayınızla yapılır ve onayınızı dilediğiniz zaman geri alabilirsiniz.
          </p>
        </section>

        <section className={styles.section}>
          <h2>4. ilgili kişi hakları (kvkk madde 11)</h2>
          <p>
            Veri sahibi olarak, kişisel verilerinizin işlenip işlenmediğini öğrenme,
            silinmesini veya düzeltilmesini talep etme haklarına sahipsiniz. Taleplerinizi{' '}
            <a href="mailto:zuulab.co@gmail.com">zuulab.co@gmail.com</a> adresine iletebilirsiniz.
          </p>
        </section>

        <section id="cerezler" className={styles.section}>
          <h2>5. çerezler</h2>
          <p>
            Sitemizin çalışması için gerekli olan çerezler ve tarayıcı depolaması her zaman kullanılır:
          </p>
          <ul>
            <li>
              <strong>Oturum:</strong> Hesabınıza giriş yaptığınızda oturumunuzu güvenle açık tutar.
            </li>
            <li>
              <strong>Sepet ve favoriler:</strong> Sepetinizdeki ve favorilerinizdeki ürünleri sayfalar arasında hatırlar.
            </li>
            <li>
              <strong>Tercihler:</strong> Çerez tercihinizi ve gördüğünüz kampanya duyurularını hatırlar.
            </li>
          </ul>
          <p>
            <strong>Analiz çerezleri (yalnızca izin verirseniz):</strong> Çerez bandında &quot;tümünü kabul et&quot;
            seçeneğini işaretlerseniz Google Analytics çerezlerini kullanırız. Bu çerezler hangi sayfaların
            görüntülendiğini, ziyaretin süresini, sitemize nereden ulaşıldığını, cihaz türünü, yaklaşık konumu (şehir
            düzeyinde), hangi ürünlerin incelendiğini ya da sepete eklendiğini ve sayfadaki tıklamaları ölçer. IP
            adresiniz kısaltılarak işlenir; ad, e-posta, adres veya ödeme bilgisi Google&apos;a gönderilmez. Bu
            verileri yalnızca sitemizi ve ürünlerimizi geliştirmek için toplu istatistik olarak kullanırız. Reklam
            veya kişiselleştirilmiş reklam çerezi kullanmıyoruz.
          </p>
          <p>
            &quot;Yalnızca gerekli&quot; seçeneğini işaretlerseniz analiz çerezleri hiç yüklenmez. Tercihinizi
            değiştirmek için tarayıcınızdan bu sitenin verilerini (çerezler ve site verileri) silmeniz yeterlidir; bir
            sonraki ziyaretinizde size yeniden sorulur.
          </p>
        </section>
      </article>
    </div>
  )
}
