import 'server-only'
import type { StoredOrder } from './orders.service'
import type { Product } from '@/lib/mock-data'
import type { AdminCustomerSummary } from './customers-admin.service'

/**
 * Escapes values for safe CSV formatting
 */
function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""'
  const str = String(val).replace(/"/g, '""')
  return `"${str}"`
}

/**
 * Generates CSV string for Orders export
 */
export function generateOrdersCsv(orders: StoredOrder[]): string {
  const headers = [
    'Sipariş No',
    'Müşteri Adı',
    'E-posta',
    'Telefon',
    'Şehir',
    'Sipariş Durumu',
    'Ödeme Durumu',
    'Ara Toplam (TL)',
    'İndirim (TL)',
    'Kargo (TL)',
    'Toplam (TL)',
    'Tarih',
  ]

  const rows = orders.map((o) => [
    escapeCsv(o.orderNumber),
    escapeCsv(o.shippingAddressSnapshot.fullName),
    escapeCsv(o.customerEmail || ''),
    escapeCsv(o.shippingAddressSnapshot.phone),
    escapeCsv(o.shippingAddressSnapshot.city),
    escapeCsv(o.status),
    escapeCsv(o.paymentStatus),
    escapeCsv(o.subtotal),
    escapeCsv(o.discountAmount),
    escapeCsv(o.shippingAmount),
    escapeCsv(o.totalAmount),
    escapeCsv(new Date(o.createdAt).toLocaleString('tr-TR')),
  ])

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

/**
 * Generates CSV string for Products export
 */
export function generateProductsCsv(products: Product[]): string {
  const headers = [
    'SKU',
    'Ürün Adı',
    'Slug',
    'Kategori',
    'Satış Fiyatı (TL)',
    'Eski Fiyat (TL)',
    'Maliyet (TL)',
    'Stok',
    'Durum',
    'Öne Çıkan',
    'Çok Satan',
  ]

  const rows = products.map((p) => [
    escapeCsv(p.sku),
    escapeCsv(p.name),
    escapeCsv(p.slug),
    escapeCsv(p.category),
    escapeCsv(p.price),
    escapeCsv(p.oldPrice || ''),
    escapeCsv((p as any).costPrice || (p as any).cost || ''),
    escapeCsv(p.stock),
    escapeCsv((p as any).status || (p.isActive ? 'ACTIVE' : 'ARCHIVED')),
    escapeCsv(p.isFeatured ? 'EVET' : 'HAYIR'),
    escapeCsv(p.isBestSeller ? 'EVET' : 'HAYIR'),
  ])

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

/**
 * Generates CSV string for Customers export
 */
export function generateCustomersCsv(customers: AdminCustomerSummary[]): string {
  const headers = [
    'Müşteri ID',
    'Ad Soyad',
    'E-posta',
    'Telefon',
    'Toplam Sipariş',
    'Toplam Harcama (TL)',
    'Hesap Durumu',
    'Kayıt Tarihi',
  ]

  const rows = customers.map((c) => [
    escapeCsv(c.id),
    escapeCsv(c.name),
    escapeCsv(c.email),
    escapeCsv(c.phone || ''),
    escapeCsv(c.orderCount),
    escapeCsv(c.totalSpend),
    escapeCsv(c.status),
    escapeCsv(new Date(c.createdAt).toLocaleDateString('tr-TR')),
  ])

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

/**
 * Generates CSV string for Inventory export
 */
export function generateInventoryCsv(
  inventory: Array<{
    sku: string
    productName: string
    stock: number
    reserved: number
    available: number
    lowStockThreshold: number
    status: string
  }>
): string {
  const headers = [
    'SKU',
    'Ürün Adı',
    'Toplam Stok',
    'Rezerve',
    'Satılabilir Stok',
    'Kritik Eşik',
    'Stok Durumu',
  ]

  const rows = inventory.map((i) => [
    escapeCsv(i.sku),
    escapeCsv(i.productName),
    escapeCsv(i.stock),
    escapeCsv(i.reserved),
    escapeCsv(i.available),
    escapeCsv(i.lowStockThreshold),
    escapeCsv(i.status),
  ])

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}
