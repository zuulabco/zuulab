import type { Metadata } from 'next'
import HomeHero from '@/components/home/HomeHero'
import CategoryStrip from '@/components/home/CategoryStrip'
import EditorialCollectionGrid from '@/components/home/EditorialCollectionGrid'
import BestSellersSection from '@/components/home/BestSellersSection'
import ZuuKidsSpotlight from '@/components/home/ZuuKidsSpotlight'
import CollectionBanner from '@/components/home/CollectionBanner'
import ProcessSection from '@/components/home/ProcessSection'
import LifestyleGrid from '@/components/home/LifestyleGrid'
import HomeFinalDiscovery from '@/components/home/HomeFinalDiscovery'
import HomeNewsletter from '@/components/home/HomeNewsletter'
import ScrollReveal from '@/components/common/ScrollReveal'
import { getBestSellers } from '@/lib/services/products.service'
import { getPublishedHomepageContent } from '@/lib/services/cms.service'

export const metadata: Metadata = {
  title: 'zuulab — tasarlanmış 3d baskı dünyaları',
  description:
    'zuukids çocuk koleksiyonu, zuulife yaşam alanı objeleri, zuulight aydınlatma ve butik işletmelere özel zuutoptan çözümleriyle zuulab tasarım evrenini keşfedin.',
}

export default async function HomePage() {
  const bestSellers = await getBestSellers(4)

  let cmsContent: any = null
  try {
    cmsContent = await getPublishedHomepageContent()
  } catch {
    // Fail-safe fallback to default layout
  }

  const hero = cmsContent?.hero

  /*
   * Homepage 2.0 Editorial Architecture (UI-21):
   *
   * 1. HERO SLIDER             → Visual editorial banner with user-controlled navigation
   * 2. CATEGORY STRIP          → Seamless marquee discovery band linking to collections & key products
   * 3. COLLECTION DISCOVERY    → Asymmetric editorial showcase of 4 core brand worlds (zuukids, zuulife, zuulight, zuutoptan)
   * 4. BEST SELLERS            → Refined product discovery with unified ProductCard
   * 5. ZUUKIDS SPOTLIGHT       → Tactile 3D physical toy & bio-pla narrative with mini dinosaur series
   * 6. COLLECTION BANNER       → Dark atmospheric lithophane lighting showcase (zuulight)
   * 7. 3D PRODUCTION PROCESS   → In-house workshop story, 0.12mm FDM precision and zero-waste transparency
   * 8. LIFESTYLE GRID          → Real customer spaces & ambient composition
   * 9. FINAL DISCOVERY CTA     → Dedicated, elegant gateway back to full catalog (/urunler)
   * 10. NEWSLETTER             → Minimalist community subscription
   */

  return (
    <>
      <HomeHero hero={hero} />

      <CategoryStrip />

      <ScrollReveal delay={40}>
        <EditorialCollectionGrid />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <BestSellersSection products={bestSellers} />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <ZuuKidsSpotlight />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <CollectionBanner
          eyebrow="zuulight aydınlatma serisi"
          title="ışık, farklı yansıtıldı."
          subtitle="lithophane teknolojisi ve parametrik gölge heykelleri."
          description="dijital modelleme ve ışık geçirgenliği optimizasyonuyla tasarlanan ay lambaları ve ambiyans aydınlatma koleksiyonu."
          ctaText="koleksiyonu keşfet"
          ctaHref="/koleksiyon/zuulight"
          imageUrl="https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1400&q=85"
          imageAlt="zuulight ambiyans lambası"
          align="left"
          theme="dark"
        />
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <ProcessSection />
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
