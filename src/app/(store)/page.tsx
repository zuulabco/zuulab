import type { Metadata } from 'next'
import HomeHero, { type HeroSlideView } from '@/components/home/HomeHero'
import CategoryStrip, { type StripItem } from '@/components/home/CategoryStrip'
import EditorialCollectionGrid from '@/components/home/EditorialCollectionGrid'
import BestSellersSection from '@/components/home/BestSellersSection'
import ZuuKidsSpotlight from '@/components/home/ZuuKidsSpotlight'
import CollectionBanner from '@/components/home/CollectionBanner'
import ProcessSection from '@/components/home/ProcessSection'
import LifestyleGrid from '@/components/home/LifestyleGrid'
import HomeFinalDiscovery from '@/components/home/HomeFinalDiscovery'
import HomeNewsletter from '@/components/home/HomeNewsletter'
import TextCtaSection from '@/components/home/TextCtaSection'
import ScrollReveal from '@/components/common/ScrollReveal'
import { getCategories, getProducts } from '@/lib/services/products.service'
import { toProductListItem, type CatalogProduct } from '@/types/catalog'
import { getPublishedHomepageContent } from '@/lib/services/cms.service'
import type { HeroSlide, HomeSection, ProductRailSettings } from '@/lib/cms/homepage'

export const metadata: Metadata = {
  // Brand first, then what people search for. Absolute: the layout template would add the brand again.
  title: { absolute: 'zuulab · 3D baskı tasarım objeleri, lambalar ve oyuncaklar' },
  description:
    'zuukids çocuk koleksiyonu, zuulife yaşam alanı objeleri, zuulight aydınlatma ve butik işletmelere özel zuutoptan çözümleriyle zuulab tasarım evrenini keşfedin.',
}

/*
 * The homepage is built from the published layout in the admin (Vitrin → Ana sayfa):
 * hero slides, then the sections in the order the admin arranged them. Product rows
 * draw from the live catalog; a product shown in one row is left out of the rows below
 * it, so the page never repeats itself.
 */
export default async function HomePage() {
  const [{ items: ranked }, categories, content] = await Promise.all([
    getProducts({ sort: 'bestseller', limit: 1000 }),
    getCategories(),
    getPublishedHomepageContent(),
  ])

  const bySlug = new Map(ranked.map((p) => [p.slug, p]))
  const inCollection = (slug: string) => ranked.filter((p) => p.collections.includes(slug))
  const inCategory = (slug: string) => ranked.filter((p) => p.categorySlug === slug)

  // ── Hero ─────────────────────────────────────────────
  const slides: HeroSlideView[] = content.hero.active
    ? content.hero.slides.filter((s) => s.enabled && s.imageUrl && s.headline).map((s) => resolveSlide(s, bySlug))
    : []

  // ── Sections ─────────────────────────────────────────
  const shown = new Set<string>()
  const take = (list: CatalogProduct[], count: number) => {
    const picked = list.filter((p) => !shown.has(p.id)).slice(0, count)
    picked.forEach((p) => shown.add(p.id))
    return picked
  }

  const railProducts = (s: ProductRailSettings): CatalogProduct[] => {
    switch (s.source) {
      case 'newest':
        return take([...ranked].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')), s.limit)
      case 'favorites':
        return take(
          [...ranked].sort((a, b) => (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0) || b.rating - a.rating),
          s.limit
        )
      case 'collection':
        return take(inCollection(s.collectionSlug), s.limit)
      case 'category':
        return take(inCategory(s.categorySlug), s.limit)
      case 'manual': {
        // Hand-picked products keep their order and may repeat elsewhere on purpose
        const picked = s.productSlugs.map((slug) => bySlug.get(slug)).filter((p): p is CatalogProduct => Boolean(p))
        picked.forEach((p) => shown.add(p.id))
        return picked.slice(0, s.limit)
      }
      default:
        return take(ranked, s.limit)
    }
  }

  const viewAllFor = (s: ProductRailSettings): string => {
    if (s.viewAllHref) return s.viewAllHref
    switch (s.source) {
      case 'newest':
        return '/urunler?sort=newest'
      case 'favorites':
        return '/urunler?sort=favorites'
      case 'collection':
        return `/koleksiyon/${s.collectionSlug}`
      case 'category':
        return `/kategori/${s.categorySlug}`
      case 'manual':
        return '/urunler'
      default:
        return '/urunler?sort=bestseller'
    }
  }

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

  const renderSection = (section: HomeSection): React.ReactNode => {
    switch (section.type) {
      case 'category_strip':
        return <CategoryStrip items={stripItems} />
      case 'collections_grid':
        return <EditorialCollectionGrid />
      case 'product_rail': {
        const s = section.settings
        const products = railProducts(s)
        // Until someone favourites a product, the favourites row is a plain selection
        const noFavoritesYet = s.source === 'favorites' && !products.some((p) => (p.favoriteCount ?? 0) > 0)
        return (
          <BestSellersSection
            products={products}
            title={noFavoritesYet ? 'keşfedilmeyi bekleyenler' : s.title}
            eyebrow={noFavoritesYet ? 'zuulab / seçki' : s.eyebrow}
            viewAllHref={noFavoritesYet ? '/urunler' : viewAllFor(s)}
            viewAllLabel={s.viewAllLabel || 'tümünü gör'}
            tone={s.tone}
            limit={s.limit}
          />
        )
      }
      case 'product_spotlight': {
        const s = section.settings
        const fromCollection = inCollection(s.collectionSlug)
        const product =
          (s.productSlug && bySlug.get(s.productSlug)) ||
          fromCollection.find((p) => !shown.has(p.id)) ||
          fromCollection[0] ||
          null
        if (product) shown.add(product.id)
        return (
          <ZuuKidsSpotlight
            product={product ? toProductListItem(product) : null}
            hasVariants={(product?.variants?.length ?? 0) > 0}
            settings={s}
          />
        )
      }
      case 'banner':
        return <CollectionBanner {...section.settings} />
      case 'text_cta':
        return <TextCtaSection settings={section.settings} />
      case 'process':
        return <ProcessSection />
      case 'lifestyle':
        return <LifestyleGrid settings={section.settings} />
      case 'final_discovery':
        return <HomeFinalDiscovery />
      case 'newsletter':
        return <HomeNewsletter />
      default:
        return null
    }
  }

  const sections = content.sections.filter((s) => s.enabled)

  return (
    <>
      {slides.length > 0 && <HomeHero slides={slides} autoplay={content.hero.autoplay} interval={content.hero.interval} />}

      {sections.map((section, i) => {
        const node = renderSection(section)
        if (!node) return null
        // The first section right under the hero appears at once; the rest reveal on scroll
        return i === 0 || section.type === 'category_strip' ? (
          <div key={section.id}>{node}</div>
        ) : (
          <ScrollReveal key={section.id} delay={40}>
            {node}
          </ScrollReveal>
        )
      })}
    </>
  )
}

function resolveSlide(s: HeroSlide, bySlug: Map<string, CatalogProduct>): HeroSlideView {
  let secondaryCtaText: string | undefined
  let secondaryCtaHref: string | undefined
  if (s.secondaryMode === 'product') {
    const product = s.secondaryProductSlug ? bySlug.get(s.secondaryProductSlug) : undefined
    if (product) {
      secondaryCtaText = s.secondaryLabel || product.name.toLocaleLowerCase('tr-TR')
      secondaryCtaHref = `/urun/${product.slug}`
    }
  } else if (s.secondaryMode === 'link' && s.secondaryLabel && s.secondaryHref) {
    secondaryCtaText = s.secondaryLabel
    secondaryCtaHref = s.secondaryHref
  }

  return {
    id: s.id,
    chipLabel: s.label || s.headline,
    badgeText: s.badge,
    accent: s.accent,
    headlineMain: s.headline,
    headlineAccent: s.headlineAccent,
    description: s.description,
    primaryCtaText: s.primaryLabel || 'keşfet',
    primaryCtaHref: s.primaryHref || '/urunler',
    secondaryCtaText,
    secondaryCtaHref,
    imageUrl: s.imageUrl,
    mobileImageUrl: s.mobileImageUrl || undefined,
    focus: s.focus,
    theme: s.theme,
  }
}
