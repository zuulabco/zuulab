import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { getUserAddresses, createAddress } from '@/lib/services/address.service'
import { addressSchema } from '@/lib/validations/checkout.schema'
import { z } from 'zod'
import { trMobilePhone } from '@/lib/validations/phone'

const createAddressSchema = z.object({
  title: z.string().min(1, 'Adres başlığı zorunludur.').max(50),
  firstName: z.string().min(2, 'Ad en az 2 karakter olmalıdır.').max(50),
  lastName: z.string().min(2, 'Soyad en az 2 karakter olmalıdır.').max(50),
  phone: trMobilePhone(),
  addressLine1: z.string().min(10, 'Açık adres en az 10 karakter olmalıdır.').max(250),
  addressLine2: z.string().max(100).optional().nullable(),
  city: z.string().min(2, 'İl seçilmelidir.').max(50),
  district: z.string().min(2, 'İlçe girilmelidir.').max(50),
  postalCode: z.string().min(3).max(10),
  country: z.string().default('TR'),
  isDefault: z.boolean().default(false),
})

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const addresses = await getUserAddresses(user.id)

    return NextResponse.json({
      success: true,
      addresses,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Adresler alınamadı.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request)
    const body = await request.json().catch(() => ({}))

    const parsed = createAddressSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Geçersiz adres bilgisi.' },
        { status: 400 }
      )
    }

    const address = await createAddress(user.id, {
      title: parsed.data.title,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
      addressLine1: parsed.data.addressLine1,
      addressLine2: parsed.data.addressLine2,
      city: parsed.data.city,
      district: parsed.data.district,
      postalCode: parsed.data.postalCode,
      country: parsed.data.country,
      isDefault: parsed.data.isDefault,
    })

    return NextResponse.json({
      success: true,
      address,
    }, { status: 201 })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Adres kaydedilemedi.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
