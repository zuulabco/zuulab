import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import { getCollectionViews } from '@/lib/services/catalog/collection-presentation'
import { COMPANY } from '@/config/company'
import { Block, CorporatePage, CtaBand, Facts, Features, Hero, Prose } from '@/components/content/Corporate'
import cards from '../ContentPage.module.css'

export const metadata: Metadata = pageMetadata({
  title: 'Hakkımızda',
  description:
    'zuulab, 2026’da Bolu’da kurulan bir 3D baskı tasarım atölyesi: lambalar, eğitici oyuncaklar, masaüstü objeleri ve kişiye özel üretim. Hikayemiz ve ilkelerimiz.',
  path: '/hakkimizda',
})

/** Brand worlds shown here, in this order, with this page's own one-line pitch */
const COLLECTIONS: Array<{ slug: string; desc: string; meta: string }> = [
  { slug: 'zuukids', desc: 'Çocuk odaları ve yaratıcı alanlar için oyuncak, dekor ve düzenleyiciler.', meta: 'çocuk · eğitim' },
  { slug: 'zuulife', desc: 'Çalışma masası, günlük kullanım ve ev için işlevsel nesneler.', meta: 'masaüstü · ev' },
  { slug: 'zuulight', desc: 'Katman katman basılan özgün masa lambaları ve aydınlatmalar.', meta: 'aydınlatma' },
  { slug: 'zuutoptan', desc: 'İşletmelere toplu sipariş ve kişiye özel üretim.', meta: 'toptan · kurumsal' },
]

const printerCount = COMPANY.printers.reduce((n, p) => n + p.count, 0)

export default async function AboutPage() {
  // Names, photos and colours as set in the admin; only live collections are shown
  const views = new Map((await getCollectionViews()).map((v) => [v.slug, v]))
  const collections = COLLECTIONS.flatMap((c) => {
    const view = views.get(c.slug)
    return view ? [{ ...c, view }] : []
  })

  return (
    <CorporatePage slug="hakkimizda">
      <Hero
        eyebrow="zuulab / hakkımızda"
        title="bolu’da küçük bir atölye,"
        muted="katman katman büyüyen fikirler."
        lead="zuulab; lambalar, eğitici oyuncaklar, masaüstü objeleri ve kişiye özel parçalar tasarlayıp 3D baskıyla kendi atölyesinde üreten bir tasarım markası."
      >
        <Facts
          items={[
            { value: String(COMPANY.founded), label: 'kuruluş' },
            { value: `${COMPANY.city}`, label: 'atölye' },
            { value: String(printerCount), label: '3d yazıcı' },
            { value: '7/24', label: 'online sipariş' },
          ]}
        />
      </Hero>

      <Block label="hikayemiz" title="bir yazıcıyla başladı," muted="bir atölyeye dönüştü.">
        <Prose>
          <p>
            zuulab, {COMPANY.founded} yılında {COMPANY.owner} tarafından Bolu’da kuruldu. Çıkış noktası basit bir fikirdi: her
            gün kullandığımız nesneler hem daha özgün hem de ihtiyaca göre üretilebilir. 3D baskı, bunu küçük bir atölyede
            mümkün kılan en iyi araçtı.
          </p>
          <p>
            Masa lambalarıyla başlayan yolculuk; çocuklar için eğitici oyuncaklara, masaüstü düzenleyicilere, ev objelerine ve
            kişiye özel hediyelere uzandı. Bugün {COMPANY.team}le, {printerCount} Bambu Lab yazıcının çalıştığı atölyemizde her
            ürünü kendimiz tasarlıyor, basıyor, elden geçiriyor ve paketliyoruz.
          </p>
          <p>
            Siparişinizi verdiğinizde ürününüz bir depodan değil, doğrudan atölyemizden çıkar. Sorularınıza da bir çağrı
            merkezi değil, ürünü üreten ekip yanıt verir.
          </p>
        </Prose>
      </Block>

      <Block label="ilkelerimiz" title="nasıl çalışıyoruz?" tone="tinted">
        <Features
          items={[
            {
              title: 'önce işlev',
              text: 'Bir objenin güzel görünmesi yetmez; masada, rafta ya da çocuğun elinde her gün işini yapmalı. Tasarımlarımızı kullanarak test ediyoruz.',
            },
            {
              title: 'talep üzerine üretim',
              text: 'Ürünlerimizin çoğunu sipariş geldikçe üretiyoruz. Böylece büyük stoklar yığmadan, gereksiz üretimi azaltarak çalışıyoruz.',
            },
            {
              title: 'elden geçen kalite',
              text: 'Her parça paketlenmeden önce kontrol edilir; destek izleri temizlenir, ölçü ve montaj denenir. Kusurlu parça gönderilmez.',
            },
            {
              title: 'açık iletişim',
              text: 'Hazırlık süresini, malzemeyi ve iade koşullarını açıkça yazıyoruz. Bir sorun olursa çözümü birlikte buluyoruz.',
            },
          ]}
        />
      </Block>

      {collections.length > 0 && (
        <Block label="koleksiyonlar" title="dört dünya," muted="tek atölye." intro="Her koleksiyon farklı bir ihtiyaç için tasarlandı.">
          <nav className={cards.collectionCards} aria-label="zuulab koleksiyonları">
            {collections.map(({ slug, desc, meta, view }) => (
              <Link key={slug} href={`/koleksiyon/${slug}`} className={cards.collectionCard}>
                <span className={`${cards.collectionMedia} img-frame`}>
                  <Image
                    src={view.heroImage}
                    alt={`${view.name} koleksiyonu`}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 420px"
                    className={cards.collectionImg}
                  />
                </span>
                <span className={cards.collectionScrim} aria-hidden />
                <span className={cards.collectionBody}>
                  <span className={cards.collectionTag}>
                    <span className={cards.collectionDot} style={{ backgroundColor: view.accentColor }} aria-hidden />
                    {meta}
                    {view.productCount > 0 && <> · {view.productCount} ürün</>}
                  </span>
                  <span className={cards.collectionName}>{view.name.toLocaleLowerCase('tr-TR')}</span>
                  <span className={cards.collectionDesc}>{desc}</span>
                  <span className={cards.collectionCta}>
                    keşfet <span aria-hidden>→</span>
                  </span>
                </span>
              </Link>
            ))}
          </nav>
        </Block>
      )}

      <CtaBand title="aklınızda bir model mi var?" muted="biz basalım." text="Kendi STL veya 3MF dosyanızı gönderin ya da işletmeniz için toplu sipariş verin.">
        <Link href="/ozel-uretim" className="btn btn-primary">
          özel üretim
        </Link>
        <Link href="/uretim-sureci" className="btn btn-secondary">
          üretim sürecimiz
        </Link>
      </CtaBand>
    </CorporatePage>
  )
}
