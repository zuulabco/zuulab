import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import AnnouncementBar from '@/components/layout/AnnouncementBar'
import ScrollToTop from '@/components/layout/ScrollToTop'
import CampaignModal from '@/components/layout/CampaignModal'
import CookieBanner from '@/components/layout/CookieBanner'
import { Suspense } from 'react'
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics'
import MarketingTracker from '@/components/analytics/MarketingTracker'
import MetaPixel from '@/components/analytics/MetaPixel'
import EmailConsentModal from '@/components/account/EmailConsentModal'
import { getMetaPixelId } from '@/lib/marketing/meta-config'
import WhatsAppButton from '@/components/common/WhatsAppButton'
import { getStoreNavigation } from '@/lib/services/catalog/navigation.service'

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Categories and collections in the menu come from the database (cached catalog).
  const navigation = await getStoreNavigation()

  return (
    <div className="store-layout">
      <ScrollToTop />
      <AnnouncementBar />
      <Header navigation={navigation} />
      <main className="store-main">{children}</main>
      <Footer />
      <CampaignModal />
      <WhatsAppButton />
      <CookieBanner />
      <EmailConsentModal />
      <GoogleAnalytics />
      <MetaPixel pixelId={getMetaPixelId()} />
      <Suspense fallback={null}>
        <MarketingTracker />
      </Suspense>
    </div>
  )
}
