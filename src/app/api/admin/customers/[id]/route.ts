import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { CustomerError, adminDeleteCustomer, adminGetCustomerDetail } from '@/lib/services/customers-admin.service'

interface Context {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: Context) {
  try {
    await requirePermission(request, 'CUSTOMER_VIEW')
    const { id } = await params

    const customer = await adminGetCustomerDetail(id)
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Müşteri bulunamadı.' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      customer,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

/**
 * DELETE { mode: "delete" | "anonymize", confirmEmail } → removes a member (Super Admin only).
 * "delete" is refused while the member has orders, returns, reviews or tickets; "anonymize" keeps those records without the person.
 */
export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'CUSTOMER_DELETE')
    const { id } = await params
    const body = (await request.json().catch(() => null)) as { mode?: unknown; confirmEmail?: unknown } | null
    const mode = body?.mode === 'anonymize' ? 'anonymize' : body?.mode === 'delete' ? 'delete' : null
    if (!mode) return NextResponse.json({ success: false, error: 'Silme türü seçilmedi.' }, { status: 400 })
    const result = await adminDeleteCustomer({
      customerId: id,
      mode,
      confirmEmail: typeof body?.confirmEmail === 'string' ? body.confirmEmail : '',
      actor: { id: user.id, email: user.email },
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    if (error instanceof CustomerError) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    const isForbidden = error.message?.includes('FORBIDDEN')
    if (!isForbidden) console.error('[admin/customers DELETE]', error)
    return NextResponse.json({ success: false, error: isForbidden ? error.message : 'Üye silinemedi.' }, { status: isForbidden ? 403 : 500 })
  }
}
