import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProductGallery from '@/components/product/ProductGallery'
import ProductDetailsClient from '@/components/product/ProductDetailsClient'
import ProductReviews from '@/components/product/ProductReviews'
import FeaturedProducts from '@/components/home/FeaturedProducts'
import ProductCollectionDiscovery from '@/components/product/ProductCollectionDiscovery'
import {
  MOCK_PRODUCTS,
  getProductBySlug,
  formatMockProductToListItem,
} from '@/lib/mock-data'
import type { ProductListItem } from '@/types/product'
import styles from './ProductPage.module.css'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = getProductBySlug(slug)
  if (!product) return { title: 'ürün bulunamadı — zuulab' }

  return {
    title: `${product.name.toLowerCase()} — zuulab`,
    description: product.shortDescription,
    openGraph: {
      title: `${product.name.toLowerCase()} — zuulab`,
      description: product.shortDescription,
      images: product.images[0] ? [product.images[0].url] : [],
    },
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params
  const product = getProductBySlug(slug)

  if (!product) {
    notFound()
  }

  const primaryCollectionSlug =
    (product.collections && product.collections[0]) ||
    (product.collectionWorld && product.collectionWorld !== 'general' ? product.collectionWorld : undefined)

  // Related products from same collection / category (4-item grid)
  const relatedProducts: ProductListItem[] = MOCK_PRODUCTS.filter(
    (p) =>
      (p.collectionWorld === product.collectionWorld || p.categoryId === product.categoryId) &&
      p.id !== product.id
  )
    .slice(0, 4)
    .map(formatMockProductToListItem)

  // Product structured data JSON-LD
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.images.map((img) => img.url),
    sku: product.sku,
    brand: {
      '@type': 'Brand',
      name: 'zuulab',
    },
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'TRY',
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `https://zuulab.com/urun/${product.slug}`,
    },
    aggregateRating: product.reviewCount > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
    } : undefined,
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'zuulab',
        item: 'https://zuulab.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'ürünler',
        item: 'https://zuulab.com/urunler',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: product.categoryName.toLowerCase(),
        item: `https://zuulab.com/kategori/${product.categorySlug}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: product.name.toLowerCase(),
        item: `https://zuulab.com/urun/${product.slug}`,
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className={`container ${styles.pageContainer}`}>
        {/* Breadcrumbs */}
        <Breadcrumbs
          items={[
            { label: 'ürünler', href: '/urunler' },
            { label: product.categoryName.toLowerCase(), href: `/kategori/${product.categorySlug}` },
            { label: product.name.toLowerCase() },
          ]}
        />

        {/* Main 2-column Product Section */}
        <div className={styles.mainGrid}>
          {/* Gallery */}
          <ProductGallery
            images={product.images}
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
