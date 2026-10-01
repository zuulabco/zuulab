import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth.service'
import { getOrderByNumber } from '@/lib/services/orders.service'
import {
  getShipmentByOrderNumber,
  getTrackingInfo,
} from '@/lib/services/shipping/fulfillment.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Oturum açmanız gerekmektedir.' },
        { status: 401 }
      )
    }

    const { orderNumber } = await params
    const order = await getOrderByNumber(orderNumber, undefined, true)
    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Sipariş bulunamadı.' },
        { status: 404 }
      )
    }

    // Customer ownership verification: Customer A cannot see Customer B's shipment
    if (order.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Bu siparişin kargo bilgilerine erişim yetkiniz bulunmamaktadır.' },
        { status: 403 }
      )
    }

    const shipment = await getShipmentByOrderNumber(orderNumber)
    if (!shipment) {
      return NextResponse.json({
        success: true,
        hasShipment: false,
        shipping: null,
      })
    }

    // Try to get updated tracking details
    const trackingData = await getTrackingInfo({
      orderNumber,
      userId: user.id,
      isAdmin: false,
    }).catch(() => null)

    const activeShipment = trackingData?.shipment || shipment
    const tracking = trackingData?.tracking

    // Return sanitized information for the customer
    return NextResponse.json({
      success: true,
      hasShipment: true,
      shipping: {
        provider: activeShipment.provider,
        trackingNumber: activeShipment.trackingNumber,
        trackingUrl: activeShipment.trackingUrl,
        status: activeShipment.status,
        statusText: tracking?.carrierStatusText || getFriendlyStatus(activeShipment.status),
        shippedAt: activeShipment.shippedAt,
        deliveredAt: activeShipment.deliveredAt,
        events: activeShipment.events.map((e) => ({
          status: e.status,
          description: e.description,
          location: e.location,
          eventAt: e.eventAt,
        })),
      },
    })
  } catch (error: any) {
    console.error('[orders/shipping] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo bilgisi alınamadı.' },
      { status: 500 }
    )
  }
}

function getFriendlyStatus(status: string): string {
  switch (status) {
    case 'LABEL_CREATED':
    case 'CREATED':
      return 'Kargo Barkodu Oluşturuldu'
    case 'READY_TO_SHIP':
      return 'Paket Hazırlandı, Kurye Bekleniyor'
    case 'SHIPPED':
      return 'Kargo Firmasına Teslim Edildi'
    case 'IN_TRANSIT':
      return 'Yolda / Transfer Merkezinde'
    case 'OUT_FOR_DELIVERY':
      return 'Dağıtıma Çıktı'
    case 'DELIVERED':
      return 'Teslim Edildi'
    case 'DELIVERY_FAILED':
      return 'Teslim Edilemedi'
    case 'RETURNED':
      return 'İade Edildi'
    case 'CANCELLED':
      return 'İptal Edildi'
    default:
      return 'İşlem Görüyor'
  }
}
