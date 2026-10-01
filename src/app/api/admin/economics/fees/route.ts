import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getChannelFeeConfigs, saveChannelFeeConfig } from '@/lib/services/product-economics.service'

export async function GET(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_ECONOMICS_VIEW')
    const storeId = user.storeId || null
    const configs = await getChannelFeeConfigs(storeId)

    return NextResponse.json({
      success: true,
      configs,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_ECONOMICS_MANAGE')
    const body = await request.json().catch(() => ({}))
    const storeId = user.storeId || null

    const result = await saveChannelFeeConfig(body, user.email, storeId)
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Kanal komisyon ve masraf profili güncellendi.',
      config: result.config,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
