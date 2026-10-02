import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { setDefaultAddress } from '@/lib/services/address.service'

interface RouteProps {
  params: Promise<{ id: string }>
}

/** Makes one of the signed-in customer's addresses the default. */
export async function POST(request: Request, { params }: RouteProps) {
  try {
    const user = await requireAuth(request)
    const { id } = await params
    const address = await setDefaultAddress(user.id, id)
    return NextResponse.json({ success: true, address })
  } catch (error: any) {
    const message: string = error?.message || 'Varsayılan adres güncellenemedi.'
    const status = message.includes('UNAUTHORIZED') ? 401 : message.includes('NOT_FOUND') ? 404 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
