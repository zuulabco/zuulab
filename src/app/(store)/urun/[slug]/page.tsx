import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { pageMetadata, productSummary } from '@/lib/seo/metadata'
import { JsonLd, breadcrumbJsonLd, productJsonLd } from '@/lib/seo/jsonld'
import { getStoreSettings } from '@/lib/services/settings/store-settings.service'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProductGallery from '@/components/product/ProductGallery'
import ProductDetailsClient from '@/components/product/ProductDetailsClient'
import ProductReviews from '@/components/product/ProductReviews'
import FeaturedProducts from '@/components/home/FeaturedProducts'
import ProductCollectionDiscovery from '@/components/product/ProductCollectionDiscovery'
import {
  getProductBySlug,
  getProducts,
} from '@/lib/services/products.service'
import { toProductListItem } from '@/types/catalog'
import type { ProductListItem } from '@/types/product'
import styles from './ProductPage.module.css'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) return { title: 'Ürün bulunamadı', robots: { index: false } }

  const photos = product.images.filter((img) => !img.url.endsWith('/placeholder.png')).slice(0, 4)
  return pageMetadata({
    title: product.seoTitle || product.name,
    description: productSummary(product),
    path: `/urun/${product.slug}`,
    images: photos.map((img) => ({ url: img.url, alt: img.alt })),
  })
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params
  const product = await getProductBySlug(slug)

  if (!product) {
    notFound()
  }

  const primaryCollectionSlug =
    (product.collections && product.collections[0]) ||
    (product.collectionWorld && product.collectionWorld !== 'general' ? product.collectionWorld : undefined)

  // Related products from same collection / category (4-item grid) from DB
  const [{ items: allCandidates }, settings] = await Promise.all([
    getProducts({
      collectionSlug: primaryCollectionSlug,
      categorySlug: product.categorySlug,
      limit: 8,
    }),
    getStoreSettings(),
  ])

  const relatedProducts: ProductListItem[] = allCandidates
    .filter((p) => p.id !== product.id)
    .slice(0, 4)
    .map(toProductListItem)

  // Shipping terms for the Offer markup, as set in Ayarlar → Kargo
  const shipping = {
    fee: settings.shipping.fee,
    freeShippingThreshold: settings.freeShippingThreshold,
    estimatedDelivery: settings.shipping.estimatedDelivery,
  }

  return (
    <>
      <JsonLd
        data={[
          productJsonLd(product, shipping),
          breadcrumbJsonLd([
            { name: 'Ürünler', path: '/urunler' },
            { name: product.categoryName, path: `/kategori/${product.categorySlug}` },
            { name: product.name, path: `/urun/${product.slug}` },
          ]),
        ]}
      />

      <div className={`container ${styles.pageContainer}`}>
        {/* Breadcrumbs */}
        <Breadcrumbs
          items={[
            { label: 'ürünler', href: '/urunler' },
            { label: product.categoryName.toLocaleLowerCase('tr-TR'), href: `/kategori/${product.categorySlug}` },
            { label: product.name.toLocaleLowerCase('tr-TR') },
          ]}
        />

        {/* Main 2-column Product Section */}
        <div className={styles.mainGrid}>
          {/* Gallery */}
          <ProductGallery
            images={[
              ...product.images,
              // Variant photos join the gallery, each colour's set kept together; choosing
              // that colour selects its first photo and the rest follow it
              ...(product.variants ?? [])
                .flatMap((v) =>
                  (v.images?.length ? v.images : v.imageUrl ? [v.imageUrl] : []).map((url, n) => ({
                    url,
                    alt: n === 0 ? `${product.name} — ${v.value}` : `${product.name} — ${v.value} (${n + 1})`,
                    isPrimary: false,
                  }))
                )
                .filter((img, i, all) => !product.images.some((im) => im.url === img.url) && all.findIndex((x) => x.url === img.url) === i),
            ]}
            productName={product.name}
          />

          {/* Info and Actions */}
          <ProductDetailsClient product={product} />
        </div>

        {/* Reviews Section */}
        <ProductReviews
          productId={product.id}
          productName={product.name}
          productSlug={product.slug}
          rating={product.rating}
          reviewCount={product.reviewCount}
        />

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className={styles.relatedWrap}>
            <FeaturedProducts
              title="benzer tasarımlar"
              subtitle="bu parçayı inceleyenlerin ilgisini çeken diğer zuulab modelleri"
              products={relatedProducts}
              viewAllHref={`/kategori/${product.categorySlug}`}
            />
          </div>
        )}

        {/* Collection Discovery */}
        <ProductCollectionDiscovery
          collectionSlug={primaryCollectionSlug}
          collectionName={primaryCollectionSlug}
          productName={product.name}
        />
      </div>
    </>
  )
}
