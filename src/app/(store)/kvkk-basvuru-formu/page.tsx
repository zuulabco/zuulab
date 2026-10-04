import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument, { KeyValue } from '@/components/legal/LegalDocument'
import PrintButton from '@/components/legal/PrintButton'
import { legalDoc } from '@/lib/legal/documents'
import { COMPANY } from '@/config/company'
import styles from '@/components/legal/Legal.module.css'

const doc = legalDoc('kvkk-basvuru-formu')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

const REQUESTS = [
  'Kişisel verilerimin işlenip işlenmediğini öğrenmek istiyorum.',
  'İşlenen kişisel verilerim hakkında bilgi talep ediyorum.',
  'Kişisel verilerimin işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenmek istiyorum.',
  'Kişisel verilerimin aktarıldığı üçüncü kişileri öğrenmek istiyorum.',
  'Eksik veya yanlış işlenen kişisel verilerimin düzeltilmesini istiyorum.',
  'Kişisel verilerimin silinmesini veya yok edilmesini istiyorum.',
  'Düzeltme / silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini istiyorum.',
  'Otomatik sistemlerle analiz sonucu aleyhime çıkan bir sonuca itiraz ediyorum.',
  'Kanuna aykırı işleme nedeniyle uğradığım zararın giderilmesini talep ediyorum.',
]

export default function KvkkApplicationPage() {
  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          KVKK’nın 11. maddesindeki haklarınızı kullanmak için aşağıdaki formu doldurup imzalayarak bize iletebilirsiniz.
          Başvurunuz en geç 30 gün içinde ücretsiz olarak yanıtlanır.
        </p>
      }
      sections={[
        {
          id: 'yollar',
          title: 'Başvuru yolları',
          body: (
            <>
              <KeyValue
                rows={[
                  ['Posta / elden', `${COMPANY.tradeName}, ${COMPANY.address} (ıslak imzalı)`],
                  ['KEP', `${COMPANY.kep} (güvenli elektronik imzalı)`],
                  ['E-posta', `${COMPANY.email} (sistemimizde kayıtlı e-posta adresinizden)`],
                ]}
              />
              <p>Zarfın veya e-postanın konu kısmına &quot;KVKK Bilgi Talebi&quot; yazmanız işlemi hızlandırır.</p>
            </>
          ),
        },
        {
          id: 'form',
          title: 'Başvuru formu',
          body: (
            <div className={styles.form}>
              <h3>1. Başvuru sahibinin bilgileri</h3>
              <FormLines labels={['Ad soyad', 'T.C. kimlik no (yabancılar için pasaport no)', 'Telefon', 'E-posta', 'Adres']} />
              <h3>2. Bizimle ilişkiniz</h3>
              <Checks items={['Müşteri', 'Ziyaretçi', 'Bülten abonesi', 'Diğer: ………………………']} />
              <h3>3. Talebiniz</h3>
              <Checks items={REQUESTS} />
              <h3>4. Açıklama</h3>
              <div className={styles.formBox} />
              <h3>5. Yanıtın iletilme yolu</h3>
              <Checks items={['Adresime gönderilsin', 'E-posta adresime gönderilsin', 'Elden teslim almak istiyorum']} />
              <FormLines labels={['Tarih', 'İmza']} />
              <PrintButton />
            </div>
          ),
        },
        {
          id: 'not',
          title: 'Bilgilendirme',
          body: (
            <p>
              Kimliğinizi doğrulayamadığımız başvurular için ek bilgi isteyebiliriz. Başvurunuzda verdiğiniz bilgiler yalnızca
              talebinizin yanıtlanması için kullanılır. Ayrıntılar <Link href="/kvkk-aydinlatma-metni">KVKK aydınlatma metnindedir</Link>.
            </p>
          ),
        },
      ]}
    />
  )
}

function FormLines({ labels }: { labels: string[] }) {
  return (
    <div className={styles.formLines}>
      {labels.map((l) => (
        <div key={l} className={styles.formLine}>
          <span>{l}</span>
        </div>
      ))}
    </div>
  )
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className={styles.formChecks}>
      {items.map((t) => (
        <li key={t}>
          <span className={styles.formBox16} aria-hidden /> {t}
        </li>
      ))}
    </ul>
  )
}
