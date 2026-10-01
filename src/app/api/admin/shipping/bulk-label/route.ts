import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { BulkShippingService } from '@/lib/services/shipping/bulk-shipping.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'SHIPPING_LABEL')
    const body = await request.json()
    const shipmentIds: string[] = body.shipmentIds || []
    const printerId: string | null = body.printerId || null

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'En az bir gönderi kimliği (shipmentIds) belirtilmelidir.' },
        { status: 400 }
      )
    }

    const result = await BulkShippingService.bulkGenerateLabels({
      shipmentIds,
      storeId: (user as any).storeId || null,
      printerId,
      adminUserId: user.id,
    })

    // Return combined result with backward compatibility fields (data, mimeType, totalPages)
    return NextResponse.json({
      success: result.success,
      totalRequested: result.totalRequested,
      successCount: result.successCount,
      failedCount: result.failedCount,
      results: result.results,
      totalPages: result.combinedPdf?.totalPages || 0,
      mimeType: result.combinedPdf?.mimeType || 'application/pdf',
      data: result.combinedPdf?.data || null,
      filename: result.combinedPdf?.filename || `toplu-etiket-${Date.now()}.pdf`,
      printJobId: result.printJobId,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Toplu etiket oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
