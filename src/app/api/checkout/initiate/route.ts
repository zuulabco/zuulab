import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { authenticateRequest, getOrCreateGuestUser } from '@/lib/services/auth.service'
import { checkoutInitiateSchema } from '@/lib/validations/checkout.schema'
import { CheckoutError, createOrder, updateOrderStatus } from '@/lib/services/orders.service'
import { cleanupExpiredReservations, initiatePayment } from '@/lib/services/payment/payment.service'
import { getClientIp } from '@/lib/config/maintenance'
import { getPublicOrigin } from '@/lib/config/app-url'
import {
  createOrderAccessToken,
  ORDER_ACCESS_COOKIE_NAME,
  ORDER_ACCESS_MAX_AGE,
} from '@/lib/services/session.service'

export async function POST(request: Request) {
  const limited = await rateLimit(request, 'checkout')
  if (limited) return limited

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
      checkoutKey,
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

    // Return stock held by abandoned checkouts before this one competes for it. The
    // scheduled cron does the same; doing it here keeps stock correct even if it lags.
    await cleanupExpiredReservations(20).catch((err) =>
      console.warn('[checkout/initiate] Expired reservation cleanup failed:', err)
    )

    // 2. Create Order (prices, stock hold and expected-total check are authoritative)
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
      email,
      checkoutKey,
      expectedTotal,
    })

    // 3. Initiate Payment session with provider
    const clientIp = getClientIp(new Headers(request.headers))
    let paymentSession: Awaited<ReturnType<typeof initiatePayment>>
    try {
      paymentSession = await initiatePayment({
        orderNumber: order.orderNumber,
        customer: {
          fullName: effectiveShippingAddress.fullName,
          email,
          phone: effectiveShippingAddress.phone,
        },
        ipAddress: clientIp,
        returnOrigin: getPublicOrigin(request),
      })
    } catch (err) {
      // No session means the customer cannot pay; give the stock back right away.
      // The order stays retryable from the payment-failed page.
      if (order.status === 'PAYMENT_PENDING') {
        await updateOrderStatus(order.orderNumber, 'PAYMENT_FAILED', 'Ödeme oturumu açılamadı.', 'system').catch(() => {})
      }
      throw err
    }

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
    if (error instanceof CheckoutError) {
      // 409: the cart, price or stock changed; the client re-renders from `quote`.
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
          issues: error.details?.issues,
          quote: error.details?.quote,
        },
        { status: 409 }
      )
    }
    console.error('[checkout/initiate] Error:', error)
    const isPaymentGateway = String(error?.message || '').startsWith('PAYTR_')
    return NextResponse.json(
      {
        success: false,
        error: isPaymentGateway
          ? 'Ödeme altyapısına şu anda ulaşılamıyor. Lütfen birkaç dakika sonra tekrar deneyin.'
          : error.message || 'Ödeme oturumu başlatılamadı.',
      },
      { status: isPaymentGateway ? 502 : 400 }
    )
  }
}
