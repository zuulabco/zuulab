import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import AnnouncementBar from '@/components/layout/AnnouncementBar'

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="store-layout">
      <AnnouncementBar />
      <Header />
      <main className="store-main">{children}</main>
      <Footer />
    </div>
  )
}
