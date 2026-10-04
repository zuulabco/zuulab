import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import AnnouncementBar from '@/components/layout/AnnouncementBar'
import ScrollToTop from '@/components/layout/ScrollToTop'
import CampaignModal from '@/components/layout/CampaignModal'
import CookieBanner from '@/components/layout/CookieBanner'
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics'
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
      <CookieBanner />
      <GoogleAnalytics />
    </div>
  )
}
