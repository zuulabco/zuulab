import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'
import { getAllShipments } from '@/lib/services/shipping/fulfillment.service'
import { BulkShippingService } from '@/lib/services/shipping/bulk-shipping.service'
import type { ShippingShipmentStatus, CarrierProviderType } from '@/lib/services/shipping/shipping-types'

export async function GET(request: Request) {
  try {
    const user = await requirePermission(request, 'SHIPPING_VIEW')
    const { searchParams } = new URL(request.url)

    const status = (searchParams.get('status') || undefined) as ShippingShipmentStatus | undefined
    const provider = (searchParams.get('provider') || undefined) as CarrierProviderType | undefined
    const channel = (searchParams.get('channel') || undefined) as 'DIRECT' | 'MARKETPLACE' | undefined
    const search = searchParams.get('search') || undefined
    const quickFilter = searchParams.get('quickFilter') || undefined

    // 1. Fetch unified shipments
    let shipments = await ShippingService.listShipments({
      status,
      provider,
      channel,
      search,
      storeId: (user as any).storeId || undefined,
    })

    // 2. Fetch direct legacy shipments from Phase 9 if needed for backward-compat
    let legacyList: any[] = []
    try {
      legacyList = await getAllShipments({
        status: status as any,
        provider,
        search,
      })
    } catch {}

    // Merge and deduplicate by trackingNumber or orderNumber
    const trackingSet = new Set(shipments.map((s) => s.trackingNumber).filter(Boolean))
    const mappedLegacy = legacyList
      .filter((l) => !trackingSet.has(l.trackingNumber))
      .map((l) => ({
        id: l.id,
        orderId: l.orderId,
        orderNumber: l.orderNumber,
        marketplaceOrderId: null,
        marketplaceOrderNumber: null,
        channel: 'DIRECT' as const,
        storeId: null,
        provider: l.provider as CarrierProviderType,
        carrier: l.provider === 'SURAT' ? 'Sürat Kargo' : l.provider === 'YURTICI' ? 'Yurtiçi Kargo' : 'Mock Carrier',
        externalShipmentId: l.providerShipmentId,
        trackingNumber: l.trackingNumber,
        trackingUrl: l.trackingUrl,
        status: l.status,
        serviceType: 'STANDARD',
        recipientName: 'Müşteri',
        recipientPhone: '',
        shippingAddress: {},
        packageCount: 1,
        totalWeightKg: null,
        notes: l.notes,
        currentLabelId: null,
        shippedAt: l.shippedAt,
        deliveredAt: l.deliveredAt,
        cancelledAt: l.cancelledAt,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      }))

    let combined = [...shipments, ...mappedLegacy]

    // 3. Apply Quick Filters if specified
    if (quickFilter) {
      const qf = quickFilter.toLowerCase()
      const todayStr = new Date().toISOString().slice(0, 10)

      if (qf === 'ready' || qf === 'kargoya_hazir') {
        combined = combined.filter(
          (s) =>
            s.status === 'PENDING' ||
            s.status === 'READY_TO_SHIP' ||
            s.status === 'SHIPMENT_CREATED' ||
            s.status === 'LABEL_READY'
        )
      } else if (qf === 'awaiting_label' || qf === 'etiket_bekliyor') {
        combined = combined.filter(
          (s) => s.status === 'LABEL_REQUESTED' || (['PENDING', 'READY_TO_SHIP'].includes(s.status) && !s.currentLabelId)
        )
      } else if (qf === 'label_ready' || qf === 'etiketi_hazir') {
        combined = combined.filter((s) => s.status === 'LABEL_READY' || Boolean(s.currentLabelId))
      } else if (qf === 'has_tracking' || qf === 'takip_no_var') {
        combined = combined.filter((s) => Boolean(s.trackingNumber && s.trackingNumber.trim() !== ''))
      } else if (qf === 'today' || qf === 'bugun') {
        combined = combined.filter((s) => {
          const cDate = s.createdAt ? s.createdAt.slice(0, 10) : ''
          const sDate = s.shippedAt ? s.shippedAt.slice(0, 10) : ''
          return cDate === todayStr || sDate === todayStr
        })
      } else if (qf === 'shipped' || qf === 'kargoya_verildi') {
        combined = combined.filter((s) => s.status === 'SHIPPED')
      }
    }

    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // 4. Retrieve daily operational stats
    const stats = await BulkShippingService.getDailyShippingStats((user as any).storeId || null)

    return NextResponse.json({
      success: true,
      count: combined.length,
      shipments: combined,
      stats,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo listesi alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission(request, 'SHIPPING_MANAGE')
    const body = await request.json()

    const result = await ShippingService.createShipment(body)

    return NextResponse.json({
      success: true,
      shipment: result,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo kaydı oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
