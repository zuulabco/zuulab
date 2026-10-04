import { SITE_URL } from '@/lib/config/urls'
import { COMPANY } from '@/config/company'
import type { CatalogProduct } from '@/types/catalog'
import type { SocialLink } from '@/lib/social/platforms'
import { absoluteUrl, metaDescription } from './metadata'
import { BRAND } from './title'

/**
 * schema.org structured data. Every node carries a stable @id on the canonical
 * host, so the organization, website and products link up into one graph.
 */

/** Public business facts. Keep in sync with the contact page and footer. */
export const BUSINESS = {
  name: BRAND,
  legalName: COMPANY.tradeName,
  email: COMPANY.email,
  /** E.164, as schema.org and tel: links expect */
  telephone: COMPANY.phoneE164,
  /** As printed on the contact page */
  phoneDisplay: COMPANY.phoneDisplay,
  locality: 'Bolu',
  country: 'TR',
  description:
    'zuulab, Bolu’da tasarlayıp ürettiği 3D baskı aydınlatma, ev ve masaüstü objeleri, çocuk oyuncakları ve kişiye özel ürünler satan bir tasarım markasıdır.',
} as const

export const ORGANIZATION_ID = `${SITE_URL}/#organization`
export const WEBSITE_ID = `${SITE_URL}/#website`

/** Renders a JSON-LD block; "<" is escaped so text from the catalog cannot close the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

/** 14-day withdrawal, free return label (src/app/(store)/iade-politikasi). */
export const RETURN_POLICY = {
  '@type': 'MerchantReturnPolicy',
  applicableCountry: 'TR',
  returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
  merchantReturnDays: 14,
  returnMethod: 'https://schema.org/ReturnByMail',
  returnFees: 'https://schema.org/FreeReturn',
  merchantReturnLink: absoluteUrl('/iade-politikasi'),
}

export function organizationJsonLd(socials: SocialLink[]) {
  const sameAs = socials.filter((s) => s.active && s.platform !== 'whatsapp').map((s) => s.url)
  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': ORGANIZATION_ID,
    name: BUSINESS.name,
    legalName: BUSINESS.legalName,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/apple-icon.png'),
      width: 180,
      height: 180,
    },
    image: absoluteUrl('/og'),
    description: BUSINESS.description,
    email: BUSINESS.email,
    telephone: BUSINESS.telephone,
    address: {
      '@type': 'PostalAddress',
      addressLocality: BUSINESS.locality,
      addressCountry: BUSINESS.country,
    },
    areaServed: { '@type': 'Country', name: 'Türkiye' },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: BUSINESS.email,
      telephone: BUSINESS.telephone,
      availableLanguage: ['Turkish'],
      url: absoluteUrl('/iletisim'),
    },
    hasMerchantReturnPolicy: RETURN_POLICY,
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE_URL,
    name: BRAND,
    inLanguage: 'tr-TR',
    publisher: { '@id': ORGANIZATION_ID },
  }
}

/** Breadcrumb trail; the home crumb is added first. */
export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  const all = [{ name: 'Ana sayfa', path: '/' }, ...items]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

/** A category or collection page with the products it lists. */
export function collectionPageJsonLd(input: {
  name: string
  description: string
  path: string
  products: Array<Pick<CatalogProduct, 'slug' | 'name'>>
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${absoluteUrl(input.path)}#page`,
    url: absoluteUrl(input.path),
    name: input.name,
    description: metaDescription(input.description, 300),
    inLanguage: 'tr-TR',
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: input.products.length,
      itemListElement: input.products.slice(0, 100).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: absoluteUrl(`/urun/${p.slug}`),
        name: p.name,
      })),
    },
  }
}

/** "3-5 iş günü" → { min: 3, max: 5 }; anything unreadable gives the default. */
function dayRange(text: string | undefined, fallback: { min: number; max: number }) {
  const nums = (text ?? '').match(/\d+/g)?.map(Number) ?? []
  if (nums.length === 0) return fallback
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

interface ShippingInput {
  fee: number
  freeShippingThreshold: number
  estimatedDelivery: string
}

export function productJsonLd(product: CatalogProduct, shipping: ShippingInput) {
  const url = absoluteUrl(`/urun/${product.slug}`)
  const images = product.images.map((img) => absoluteUrl(img.url)).filter((u) => !u.endsWith('/placeholder.png'))
  const transit = dayRange(shipping.estimatedDelivery, { min: 2, max: 3 })
  const handling = dayRange(product.productionTime, { min: 1, max: 2 })

  const offerFor = (price: number, inStock: boolean, sku: string) => ({
    '@type': 'Offer',
    url,
    sku,
    price: price.toFixed(2),
    priceCurrency: 'TRY',
    availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@id': ORGANIZATION_ID },
    hasMerchantReturnPolicy: RETURN_POLICY,
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: {
        '@type': 'MonetaryAmount',
        // A single unit already over the threshold ships free.
        value: price >= shipping.freeShippingThreshold ? 0 : shipping.fee,
        currency: 'TRY',
      },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'TR' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: handling.min, maxValue: handling.max, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: transit.min, maxValue: transit.max, unitCode: 'DAY' },
      },
    },
  })

  const variants = product.variants ?? []
  const offers =
    variants.length > 1
      ? {
          '@type': 'AggregateOffer',
          priceCurrency: 'TRY',
          lowPrice: Math.min(...variants.map((v) => v.price ?? product.price)).toFixed(2),
          highPrice: Math.max(...variants.map((v) => v.price ?? product.price)).toFixed(2),
          offerCount: variants.length,
          availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          offers: variants.map((v) => ({
            ...offerFor(v.price ?? product.price, v.stock > 0, v.sku),
            name: `${product.name} · ${v.value}`,
          })),
        }
      : offerFor(product.price, product.stock > 0, product.sku)

  const gtin = product.barcode && /^\d{8,14}$/.test(product.barcode) ? product.barcode : undefined
  const size = product.dimensions
  const props = [
    ...product.specifications.map((s) => ({ '@type': 'PropertyValue', name: s.name, value: s.value })),
    ...(product.productionTime ? [{ '@type': 'PropertyValue', name: 'Hazırlık süresi', value: product.productionTime }] : []),
  ]

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    url,
    name: product.name,
    description: metaDescription(product.description || product.shortDescription, 5000),
    image: images.length > 0 ? images : undefined,
    sku: product.sku,
    mpn: product.sku,
    ...(gtin ? { gtin } : {}),
    brand: { '@type': 'Brand', name: BRAND },
    manufacturer: { '@id': ORGANIZATION_ID },
    category: product.categoryName,
    ...(product.material ? { material: product.material } : {}),
    ...(product.colors && product.colors.length > 0 ? { color: product.colors.join(', ') } : {}),
    ...(size?.lengthMm ? { depth: { '@type': 'QuantitativeValue', value: size.lengthMm, unitCode: 'MMT' } } : {}),
    ...(size?.widthMm ? { width: { '@type': 'QuantitativeValue', value: size.widthMm, unitCode: 'MMT' } } : {}),
    ...(size?.heightMm ? { height: { '@type': 'QuantitativeValue', value: size.heightMm, unitCode: 'MMT' } } : {}),
    ...(product.weight > 0 ? { weight: { '@type': 'QuantitativeValue', value: product.weight, unitCode: 'GRM' } } : {}),
    ...(props.length > 0 ? { additionalProperty: props } : {}),
    offers,
    ...(product.reviewCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  }
}
