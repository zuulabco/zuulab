import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { DailyOperationsService } from '@/lib/services/daily-operations.service'

export async function GET(request: Request) {
  try {
    // 1. Authoritative RBAC check: ADMIN, SUPER_ADMIN, ORDER_MANAGER, STAFF all have ORDER_VIEW
    // CUSTOMER does not have ORDER_VIEW -> throws FORBIDDEN error
    const user = await requirePermission(request, 'ORDER_VIEW')

    // 2. Strict Store Isolation:
    // CRITICAL: NEVER trust query params for store scoping. Use authoritative user.storeId only.
    const storeId = user.storeId || null

    // 3. Orchestration query (pure read model, zero mutations)
    const operationsData = await DailyOperationsService.getTodayOperations(storeId)

    return NextResponse.json({
      success: true,
      ...operationsData,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Günlük operasyon verisi yüklenirken bir hata oluştu.',
      },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
