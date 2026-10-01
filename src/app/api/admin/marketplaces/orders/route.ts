import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  getMarketplaceOrders,
  type GetMarketplaceOrdersFilters,
} from '@/lib/services/marketplace/marketplace.service'
import type {
  MarketplaceProviderType,
  NormalizedMarketplaceStatus,
  OrderReconciliationStatus,
} from '@/lib/services/marketplace/marketplace.interface'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)

    const filters: GetMarketplaceOrdersFilters = {
      provider: (searchParams.get('provider') as MarketplaceProviderType) || undefined,
      storeId: searchParams.get('storeId') || undefined,
      status: (searchParams.get('status') as NormalizedMarketplaceStatus) || undefined,
      reconciliationStatus: (searchParams.get('reconciliationStatus') as OrderReconciliationStatus) || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      orderNumber: searchParams.get('orderNumber') || undefined,
      sku: searchParams.get('sku') || undefined,
    }

    const orders = await getMarketplaceOrders(filters)

    return NextResponse.json({
      success: true,
      orders,
      totalCount: orders.length,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Pazaryeri siparişleri listelenemedi.',
      },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
