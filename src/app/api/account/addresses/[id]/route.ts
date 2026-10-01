import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { updateAddress, deleteAddress } from '@/lib/services/address.service'
import { z } from 'zod'

const updateAddressSchema = z.object({
  title: z.string().min(1).max(50).optional(),
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  phone: z
    .string()
    .regex(/^(?:\+?90|0)?5[0-9]{9}$/, 'Geçerli bir telefon numarası giriniz.')
    .optional(),
  addressLine1: z.string().min(10).max(250).optional(),
  addressLine2: z.string().max(100).optional().nullable(),
  city: z.string().min(2).max(50).optional(),
  district: z.string().min(2).max(50).optional(),
  postalCode: z.string().min(3).max(10).optional(),
  country: z.string().optional(),
  isDefault: z.boolean().optional(),
})

interface RouteProps {
  params: Promise<{ id: string }>
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const user = await requireAuth(request)
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const parsed = updateAddressSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Geçersiz adres güncelleme verisi.' },
        { status: 400 }
      )
    }

    const updated = await updateAddress(user.id, id, parsed.data)

    return NextResponse.json({
      success: true,
      address: updated,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.message?.includes('NOT_FOUND')
    return NextResponse.json(
      { success: false, error: error.message || 'Adres güncellenemedi.' },
      { status: isAuth ? 401 : isNotFound ? 404 : 500 }
    )
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    await deleteAddress(user.id, id)

    return NextResponse.json({
      success: true,
      message: 'Adres başarıyla silindi.',
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.message?.includes('NOT_FOUND')
    return NextResponse.json(
      { success: false, error: error.message || 'Adres silinemedi.' },
      { status: isAuth ? 401 : isNotFound ? 404 : 500 }
    )
  }
}
