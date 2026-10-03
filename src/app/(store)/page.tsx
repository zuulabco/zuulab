import type { Metadata } from 'next'
import HomeHero from '@/components/home/HomeHero'
import CategoryStrip, { type StripItem } from '@/components/home/CategoryStrip'
import EditorialCollectionGrid from '@/components/home/EditorialCollectionGrid'
import BestSellersSection from '@/components/home/BestSellersSection'
import ZuuKidsSpotlight from '@/components/home/ZuuKidsSpotlight'
import CollectionBanner from '@/components/home/CollectionBanner'
import ProcessSection from '@/components/home/ProcessSection'
import LifestyleGrid from '@/components/home/LifestyleGrid'
import HomeFinalDiscovery from '@/components/home/HomeFinalDiscovery'
import HomeNewsletter from '@/components/home/HomeNewsletter'
import ScrollReveal from '@/components/common/ScrollReveal'
import { getCategories, getProducts } from '@/lib/services/products.service'
import { toProductListItem, type CatalogProduct } from '@/types/catalog'
import { getPublishedHomepageContent } from '@/lib/services/cms.service'

export const metadata: Metadata = {
  title: 'zuulab — tasarlanmış 3d baskı dünyaları',
  description:
    'zuukids çocuk koleksiyonu, zuulife yaşam alanı objeleri, zuulight aydınlatma ve butik işletmelere özel zuutoptan çözümleriyle zuulab tasarım evrenini keşfedin.',
}

export default async function HomePage() {
  const [{ items: ranked }, categories] = await Promise.all([
    getProducts({ sort: 'bestseller', limit: 1000 }),
    getCategories(),
  ])

  // Every product row draws from the same live catalog; a product shown in one row is
  // left out of the rows below it, so the page never repeats itself.
  const shown = new Set<string>()
  const take = (list: CatalogProduct[], count: number) => {
    const picked = list.filter((p) => !shown.has(p.id)).slice(0, count)
    picked.forEach((p) => shown.add(p.id))
    return picked
  }
  const inCollection = (slug: string) => ranked.filter((p) => p.collections.includes(slug))

  const bestSellers = take(ranked, 4)
  const kidsPick = take(inCollection('zuukids'), 1)[0] ?? inCollection('zuukids')[0] ?? null
  const newest = take(
    [...ranked].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    4
  )
  const lightPicks = take(inCollection('zuulight'), 4)
  const mostFavorited = take(
    [...ranked].sort(
      (a, b) => (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0) || b.rating - a.rating
    ),
    4
  )

  // Until someone favourites a product the row is a plain selection, not a false ranking
  const hasFavorites = mostFavorited.some((p) => (p.favoriteCount ?? 0) > 0)

  // Hero buttons point at each collection's best seller
  const heroPicks = Object.fromEntries(
    ['zuukids', 'zuulife', 'zuulight'].flatMap((slug) => {
      const top = inCollection(slug)[0]
      return top ? [[slug, { name: top.name, slug: top.slug }]] : []
    })
  )

  const stripItems: StripItem[] = [
    { id: 'zuukids', label: 'zuukids', tag: 'çocuk dünyası', href: '/koleksiyon/zuukids' },
    { id: 'zuulife', label: 'zuulife', tag: 'yaşam & masa', href: '/koleksiyon/zuulife' },
    { id: 'zuulight', label: 'zuulight', tag: 'aydınlatma', href: '/koleksiyon/zuulight' },
    { id: 'zuutoptan', label: 'zuutoptan', tag: 'butik üretim', href: '/koleksiyon/zuutoptan' },
    ...categories
      .filter((c) => !c.parentId && c.productCount > 0)
      .map((c) => ({
        id: `cat-${c.slug}`,
        label: c.name.toLocaleLowerCase('tr-TR'),
        tag: `${c.productCount} ürün`,
        href: `/kategori/${c.slug}`,
      })),
    { id: 'tum-urunler', label: 'tüm ürünler', tag: `${ranked.length} tasarım`, href: '/urunler' },
  ]

  let cmsContent: any = null
  try {
    cmsContent = await getPublishedHomepageContent()
  } catch {
    // Fail-safe fallback to default layout
  }

  const hero = cmsContent?.hero

  /*
   * Order: hero → collection band → collections → best sellers → zuukids product →
   * new arrivals → zuulight story → zuulight picks → process → most favourited →
   * lifestyle → final discovery → newsletter. Product rows alternate with editorial
   * sections so the page never shows two grids back to back.
   */

  return (
    <>
      <HomeHero hero={hero} picks={heroPicks} />

      <CategoryStrip items={stripItems} />

      <ScrollReveal delay={40}>
        <EditorialCollectionGrid />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <BestSellersSection products={bestSellers} />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <ZuuKidsSpotlight
          product={kidsPick ? toProductListItem(kidsPick) : null}
          hasVariants={(kidsPick?.variants?.length ?? 0) > 0}
        />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <BestSellersSection
          products={newest}
          title="yeni gelenler"
          eyebrow="atölyeden yeni çıkanlar"
          viewAllHref="/urunler?sort=newest"
          tone="muted"
        />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <CollectionBanner
          eyebrow="zuulight aydınlatma serisi"
          title="ışık, farklı yansıtıldı."
          subtitle="parametrik desenli masa lambaları."
          description="katman katman basılan gövdeler ışığı süzerek duvara desen düşürür; her lamba açıkken de kapalıyken de odanın bir parçası olur."
          ctaText="koleksiyonu keşfet"
          ctaHref="/koleksiyon/zuulight"
          imageUrl="https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1400&q=85"
          imageAlt="zuulight ambiyans lambası"
          align="left"
          theme="dark"
        />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <BestSellersSection
          products={lightPicks}
          title="zuulight seçkisi"
          eyebrow="aydınlatma"
          viewAllHref="/koleksiyon/zuulight"
          viewAllLabel="tüm lambalar"
        />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <ProcessSection />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <BestSellersSection
          products={mostFavorited}
          {...(hasFavorites
            ? { title: 'en çok favorilenenler', eyebrow: 'müşterilerimizin listelerinden', viewAllHref: '/urunler?sort=favorites' }
            : { title: 'keşfedilmeyi bekleyenler', eyebrow: 'zuulab / seçki', viewAllHref: '/urunler' })}
          tone="muted"
        />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <LifestyleGrid />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <HomeFinalDiscovery />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <HomeNewsletter />
      </ScrollReveal>
    </>
  )
}
