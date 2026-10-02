import { NextResponse } from 'next/server'
import { authenticateRequest, getOrCreateGuestUser } from '@/lib/services/auth.service'
import { checkoutInitiateSchema } from '@/lib/validations/checkout.schema'
import { createOrder } from '@/lib/services/orders.service'
import { initiatePayment } from '@/lib/services/payment/payment.service'
import { getClientIp } from '@/lib/config/maintenance'
import {
  createOrderAccessToken,
  ORDER_ACCESS_COOKIE_NAME,
  ORDER_ACCESS_MAX_AGE,
} from '@/lib/services/session.service'

export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request)
    const body = await request.json().catch(() => ({}))

    // 1. Zod validation
    const parsed = checkoutInitiateSchema.safeParse(body)
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Geçersiz ödeme bilgileri.'
      return NextResponse.json(
        { success: false, error: firstError, issues: parsed.error.issues },
        { status: 400 }
      )
    }

    const {
      shippingAddress,
      billingSameAsShipping,
      billingAddress,
      shippingMethod,
      couponCode,
      customerNote,
      expectedTotal,
      savedAddressId,
      items,
      email,
    } = parsed.data

    let effectiveShippingAddress = {
      ...shippingAddress,
      email,
    }
    let verifiedAddressId: string | null = null

    // If client supplied savedAddressId, strictly verify ownership
    if (savedAddressId) {
      if (!user) {
        return NextResponse.json(
          { success: false, error: 'Kayıtlı adres kullanmak için giriş yapmalısınız.' },
          { status: 401 }
        )
      }

      const { getAddressById } = await import('@/lib/services/address.service')
      const saved = await getAddressById(user.id, savedAddressId)
      if (!saved) {
        return NextResponse.json(
          { success: false, error: 'Seçilen kayıtlı adres bulunamadı veya bu hesaba ait değil.' },
          { status: 403 }
        )
      }

      verifiedAddressId = saved.id
      effectiveShippingAddress = {
        fullName: `${saved.firstName} ${saved.lastName}`,
        phone: saved.phone,
        addressLine: saved.addressLine1 + (saved.addressLine2 ? ` ${saved.addressLine2}` : ''),
        city: saved.city,
        district: saved.district,
        postalCode: saved.postalCode,
        country: saved.country || 'TR',
        email,
      }
    }

    let effectiveUserId: string
    if (user) {
      effectiveUserId = user.id
    } else {
      const guestCustomer = await getOrCreateGuestUser({
        email,
        fullName: effectiveShippingAddress.fullName,
        phone: effectiveShippingAddress.phone,
      })
      effectiveUserId = guestCustomer.id
    }

    // 2. Create Order (calculates prices & shipping authoritatively, reserves inventory)
    const order = await createOrder({
      userId: effectiveUserId,
      items,
      couponCode,
      shippingMethod,
      shippingAddress: effectiveShippingAddress,
      billingSameAsShipping,
      billingAddress,
      addressId: verifiedAddressId,
      customerNote: customerNote || undefined,
    })

    // 3. Initiate Payment session with provider
    const clientIp = getClientIp(new Headers(request.headers))
    const paymentSession = await initiatePayment({
      orderNumber: order.orderNumber,
      customer: {
        fullName: shippingAddress.fullName,
        email,
        phone: shippingAddress.phone,
      },
      ipAddress: clientIp,
      clientExpectedTotal: expectedTotal,
    })

    const response = NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      shippingAmount: order.shippingAmount,
      paymentId: paymentSession.paymentId,
      sessionToken: paymentSession.sessionToken,
      checkoutUrl: paymentSession.checkoutUrl,
      iframeUrl: paymentSession.iframeUrl,
      provider: paymentSession.provider,
    })

    // Lets this browser (including guests) retry payment for the order it created.
    response.cookies.set({
      name: ORDER_ACCESS_COOKIE_NAME,
      value: createOrderAccessToken(order.orderNumber),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ORDER_ACCESS_MAX_AGE,
    })

    return response
  } catch (error: any) {
    console.error('[checkout/initiate] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Ödeme oturumu başlatılamadı.' },
      { status: 400 }
    )
  }
}
