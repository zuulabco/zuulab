import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import AnnouncementBar from '@/components/layout/AnnouncementBar'
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
      <AnnouncementBar />
      <Header navigation={navigation} />
      <main className="store-main">{children}</main>
      <Footer />
    </div>
  )
}
