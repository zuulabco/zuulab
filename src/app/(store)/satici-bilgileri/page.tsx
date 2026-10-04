import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument, { KeyValue, SellerTable } from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { COMPANY } from '@/config/company'

const doc = legalDoc('satici-bilgileri')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

export default function SellerInfoPage() {
  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun kapsamında hizmet sağlayıcı bilgileri. Tebligat adresi{' '}
          <Link href="/mesafeli-satis-sozlesmesi#taraflar">mesafeli satış sözleşmesinde</Link> yer alır.
        </p>
      }
      sections={[
        { id: 'isletme', title: 'İşletme bilgileri', body: <SellerTable withAddress={false} /> },
        {
          id: 'konum',
          title: 'Konum ve çalışma saatleri',
          body: (
            <KeyValue
              rows={[
                ['Atölye', `${COMPANY.district} / ${COMPANY.city} (ziyaretçi kabul edilmemektedir)`],
                ['Sipariş', '7 gün 24 saat, www.zuulab.com üzerinden'],
                ['Canlı destek', COMPANY.supportHours],
              ]}
            />
          ),
        },
      ]}
    />
  )
}
