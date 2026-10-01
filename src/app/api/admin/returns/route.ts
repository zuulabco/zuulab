import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getAllReturns } from '@/lib/services/returns/returns.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as any
    const type = searchParams.get('type') || undefined
    const search = searchParams.get('search') || undefined

    const returns = await getAllReturns({
      status,
      type,
      search,
    })

    return NextResponse.json({
      success: true,
      returns,
      total: returns.length,
    })
  } catch (error: any) {
    console.error('[api/admin/returns] Error:', error)
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İadeler listelenemedi.' },
      { status: isAuth ? 401 : 403 }
    )
  }
}
