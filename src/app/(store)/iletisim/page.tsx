import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import { COMPANY } from '@/config/company'
import { Block, CorporatePage, Hero } from '@/components/content/Corporate'
import s from '@/components/content/Corporate.module.css'
import IletisimClient from './IletisimClient'

export const metadata: Metadata = pageMetadata({
  title: 'İletişim',
  description:
    'zuulab ile iletişime geçin: e-posta, telefon ve WhatsApp, Instagram, destek talebi. Canlı destek hafta içi 09:00–18:00, sipariş 7/24.',
  path: '/iletisim',
})

const WHATSAPP = `https://wa.me/${COMPANY.phoneE164.replace(/\D/g, '')}`

export default function ContactPage() {
  return (
    <CorporatePage slug="iletisim">
      <Hero
        eyebrow="zuulab / iletişim"
        title="bize yazın,"
        muted="atölyeden yanıtlayalım."
        lead={`Sipariş, özel üretim veya toptan talepleriniz için aşağıdaki kanallardan ulaşabilirsiniz. Canlı destek ${COMPANY.supportHours.toLocaleLowerCase('tr-TR')} arasında; siparişlerinizi ise 7 gün 24 saat verebilirsiniz.`}
      />

      <Block label="kanallar" title="size en uygun" muted="yoldan.">
        <div className={s.channels}>
          <a className={s.channel} href={`mailto:${COMPANY.email}`}>
            <span className={s.channelLabel}>e-posta</span>
            <span className={s.channelValue}>{COMPANY.email}</span>
            <span className={s.channelNote}>Sipariş, özel üretim ve toptan talepleri</span>
          </a>
          <a className={s.channel} href={`tel:${COMPANY.phoneE164}`}>
            <span className={s.channelLabel}>telefon</span>
            <span className={s.channelValue}>{COMPANY.phoneDisplay}</span>
            <span className={s.channelNote}>{COMPANY.supportHours}</span>
          </a>
          <a className={s.channel} href={WHATSAPP} target="_blank" rel="noopener noreferrer">
            <span className={s.channelLabel}>whatsapp</span>
            <span className={s.channelValue}>mesaj gönder →</span>
            <span className={s.channelNote}>En hızlı yanıt için</span>
          </a>
          <a className={s.channel} href={COMPANY.instagram} target="_blank" rel="noopener noreferrer">
            <span className={s.channelLabel}>instagram</span>
            <span className={s.channelValue}>@zuu.lab</span>
            <span className={s.channelNote}>Yeni ürünler ve atölyeden kareler</span>
          </a>
          <Link className={s.channel} href="/hesap/destek">
            <span className={s.channelLabel}>destek talebi</span>
            <span className={s.channelValue}>hesabım / destek →</span>
            <span className={s.channelNote}>Mevcut siparişinizle ilgili talepler</span>
          </Link>
          <div className={s.channel}>
            <span className={s.channelLabel}>atölye</span>
            <span className={s.channelValue}>
              {COMPANY.district} / {COMPANY.city}
            </span>
            <span className={s.channelNote}>Atölyemiz ziyaretçi kabul etmemektedir</span>
          </div>
        </div>
      </Block>

      <Block label="mesaj" title="formla" muted="ulaşın." intro="Mesajınız destek ekibimize iletilir; e-posta adresinizden yanıt veririz." tone="tinted">
        <IletisimClient />
      </Block>

      <Block label="resmi yazışma" title="yasal" muted="bildirimler.">
        <p className={s.note}>
          Resmi bildirimler için KEP adresimiz: <strong>{COMPANY.kep}</strong>. İşletme bilgilerimiz{' '}
          <Link href="/satici-bilgileri">satıcı bilgileri</Link> sayfasında, kişisel veri talepleri için başvuru yolları{' '}
          <Link href="/kvkk-basvuru-formu">KVKK başvuru formunda</Link> yer alır.
        </p>
      </Block>
    </CorporatePage>
  )
}
