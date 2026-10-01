import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { MOCK_PRODUCTS } from '@/lib/mock-data'
import { WarehouseScanError } from './warehouse-error'

export interface ResolvedProduct {
  productId: string
  sku: string
  barcode: string | null
  name: string
}

// In-memory registry for mock & custom test products
const inMemoryBarcodeRegistry: Map<
  string,
  { productId: string; sku: string; barcode: string | null; name: string }
> = new Map()

// In-memory marketplace product barcode mappings
const inMemoryMarketplaceMappings: Map<
  string, // barcode
  { storeId: string; productId: string; sku: string; barcode: string; name: string }[]
> = new Map()

// Preload mock products
for (const p of MOCK_PRODUCTS) {
  inMemoryBarcodeRegistry.set(p.id, {
    productId: p.id,
    sku: p.sku,
    barcode: (p as any).barcode || null,
    name: p.name,
  })
}

export class WarehouseScanService {
  /**
   * Normalizes barcode string: strips extra whitespace, handles uppercase comparisons
   */
  public static normalizeBarcode(raw: string): string {
    if (!raw) return ''
    return raw.trim()
  }

  /**
   * Register custom product for testing/runtime memory
   */
  public static registerProduct(product: {
    productId: string
    sku: string
    barcode?: string | null
    name: string
  }): void {
    inMemoryBarcodeRegistry.set(product.productId, {
      productId: product.productId,
      sku: product.sku,
      barcode: product.barcode || null,
      name: product.name,
    })
  }

  /**
   * Register marketplace mapping for barcode resolution
   */
  public static registerMarketplaceMapping(mapping: {
    storeId: string
    productId: string
    sku: string
    barcode: string
    name: string
  }): void {
    const existing = inMemoryMarketplaceMappings.get(mapping.barcode) || []
    existing.push(mapping)
    inMemoryMarketplaceMappings.set(mapping.barcode, existing)
  }

  /**
   * Resolves canonical product identity according to strict hierarchy:
   * 1. Exact internal SKU
   * 2. Exact product barcode
   * 3. Marketplace mapping barcode
   *
   * Rejects fuzzy matching. Exactly 1 match required; otherwise 0 -> PRODUCT_NOT_FOUND, >1 -> AMBIGUOUS_BARCODE.
   */
  public static async resolveProductIdentity(
    scannedCode: string,
    storeId?: string | null
  ): Promise<ResolvedProduct> {
    const normalized = this.normalizeBarcode(scannedCode)
    if (!normalized) {
      throw new WarehouseScanError('Geçersiz veya boş barkod okutuldu.', 'PRODUCT_NOT_FOUND')
    }

    // Try database if configured
    if (isDatabaseConfigured) {
      try {
        // Step 1: Exact SKU lookup
        const pSku = await db.orm.public.Product.where({ sku: normalized }).first()
        if (pSku) {
          return { productId: pSku.id, sku: pSku.sku, barcode: pSku.barcode, name: pSku.name }
        }

        // Step 2: Exact Barcode lookup
        if (normalized.length >= 4) {
          const pBarcode = await db.orm.public.Product.where({ barcode: normalized }).first()
          if (pBarcode) {
            return { productId: pBarcode.id, sku: pBarcode.sku, barcode: pBarcode.barcode, name: pBarcode.name }
          }
        }
      } catch (err: any) {
        if (err instanceof WarehouseScanError) throw err
        console.warn('[WarehouseScanService] DB lookup fallback to memory:', err)
      }
    }

    // In-memory hierarchy resolution
    const allProducts = Array.from(inMemoryBarcodeRegistry.values())

    // 1. Exact SKU
    const skuMatches = allProducts.filter(
      (p) => p.sku.toUpperCase() === normalized.toUpperCase()
    )
    if (skuMatches.length === 1) {
      return skuMatches[0]
    }
    if (skuMatches.length > 1) {
      throw new WarehouseScanError(
        `Aynı SKU'ya sahip birden fazla ürün bulundu: ${normalized}`,
        'AMBIGUOUS_BARCODE'
      )
    }

    // 2. Exact Barcode
    const barcodeMatches = allProducts.filter(
      (p) => p.barcode && p.barcode.trim() === normalized
    )
    if (barcodeMatches.length === 1) {
      return barcodeMatches[0]
    }
    if (barcodeMatches.length > 1) {
      throw new WarehouseScanError(
        `Aynı barkoda sahip birden fazla ürün bulundu: ${normalized}`,
        'AMBIGUOUS_BARCODE'
      )
    }

    // 3. Marketplace mapping barcode
    const mktList = inMemoryMarketplaceMappings.get(normalized) || []
    const filteredMkt = storeId ? mktList.filter((m) => m.storeId === storeId) : mktList
    if (filteredMkt.length === 1) {
      const match = filteredMkt[0]
      return {
        productId: match.productId,
        sku: match.sku,
        barcode: match.barcode,
        name: match.name,
      }
    }
    if (filteredMkt.length > 1) {
      throw new WarehouseScanError(
        `Pazaryeri barkod eşleştirmesinde birden fazla ürün bulundu: ${normalized}`,
        'AMBIGUOUS_BARCODE'
      )
    }

    // If 0 matches
    throw new WarehouseScanError(
      `Ürün bulunamadı (Barkod / SKU: ${normalized})`,
      'PRODUCT_NOT_FOUND'
    )
  }
}
