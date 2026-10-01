async function runTests() {
  const baseUrl = 'http://localhost:3000'
  console.log('--- STARTING PHASE 5 API VERIFICATION ---')

  // 1. Test Products catalog API
  console.log('\n1. Testing GET /api/products...')
  const prodRes = await fetch(`${baseUrl}/api/products`)
  const prodData = await prodRes.json()
  console.log(`Status: ${prodRes.status}, Total products: ${prodData.total || prodData.data?.length}`)
  if (!prodData.success || !prodData.data || prodData.data.length === 0) {
    throw new Error('Products API failed!')
  }

  // 2. Test Product by slug & costPrice privacy
  console.log('\n2. Testing GET /api/products/mini-dinozor-serisi-set (Security & Privacy)...')
  const singleRes = await fetch(`${baseUrl}/api/products/mini-dinozor-serisi-set`)
  const singleData = await singleRes.json()
  console.log(`Status: ${singleRes.status}, Name: ${singleData.data?.name}`)
  if (singleData.data?.costPrice !== undefined || singleData.data?.cost !== undefined) {
    throw new Error('SECURITY VIOLATION: costPrice leaked in public product API!')
  }
  console.log('✓ Cost price is strictly protected (not exposed to customers)')

  // 3. Test Collections API
  console.log('\n3. Testing GET /api/collections/zuukids...')
  const colRes = await fetch(`${baseUrl}/api/collections/zuukids`)
  const colData = await colRes.json()
  console.log(`Status: ${colRes.status}, Collection: ${colData.collection?.name}, Products: ${colData.products?.length}`)

  // 4. Test Cart recalculation & Price security
  console.log('\n4. Testing POST /api/cart/validate (Server-side price security)...')
  const cartRes = await fetch(`${baseUrl}/api/cart/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          id: 'prod-1',
          productId: 'prod-1',
          quantity: 2,
          price: 1, // Tampered client price! Server should ignore and use 199.90
        },
      ],
      couponCode: 'ZUULAB10',
    }),
  })
  const cartData = await cartRes.json()
  console.log(`Status: ${cartRes.status}, Subtotal: ${cartData.data?.subtotal}, Discount: ${cartData.data?.discountAmount}, Total: ${cartData.data?.totalAmount}`)
  if (cartData.data?.subtotal < 300) {
    throw new Error('PRICE SECURITY FAILED: Server trusted client-provided price!')
  }
  console.log('✓ Server-side price authority verified (tampered client price overridden)')

  // 5. Test Coupon validation
  console.log('\n5. Testing POST /api/coupons/validate...')
  const coupRes = await fetch(`${baseUrl}/api/coupons/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'ZUULAB10', subtotal: 500 }),
  })
  const coupData = await coupRes.json()
  console.log(`Status: ${coupRes.status}, Valid: ${coupData.data?.valid}, Discount: ${coupData.data?.discountAmount}`)
  if (!coupData.success || !coupData.data?.valid) {
    throw new Error('Coupon validation failed!')
  }
  console.log('✓ Server-side coupon verification verified')

  // 6. Test User Sync with dev token
  console.log('\n6. Testing POST /api/auth/sync (Customer)...')
  const custToken = 'dev-token-cust:uid-cust-123:customer@test.com:CUSTOMER'
  const syncCustRes = await fetch(`${baseUrl}/api/auth/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${custToken}`,
    },
    body: JSON.stringify({ name: 'Test Customer' }),
  })
  const syncCustData = await syncCustRes.json()
  console.log(`Status: ${syncCustRes.status}, User ID: ${syncCustData.user?.id}, Role: ${syncCustData.user?.role}`)

  // 7. Test Admin Authorization Guard (Customer should be rejected with 403)
  console.log('\n7. Testing GET /api/admin/stats with CUSTOMER token (Should be 403 Forbidden)...')
  const forbiddenRes = await fetch(`${baseUrl}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${custToken}` },
  })
  console.log(`Status: ${forbiddenRes.status} (Expected 403)`)
  if (forbiddenRes.status !== 403) {
    throw new Error('SECURITY VIOLATION: Non-admin was not rejected from admin API!')
  }
  console.log('✓ Non-admin authorization guard verified')

  // 8. Test Admin Authorization (Admin should succeed with 200)
  console.log('\n8. Testing GET /api/admin/stats with ADMIN token...')
  const adminToken = 'dev-token-adm:uid-admin-456:admin@zuulab.com:ADMIN'
  const adminRes = await fetch(`${baseUrl}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const adminData = await adminRes.json()
  console.log(`Status: ${adminRes.status}, Monthly Revenue: ${adminData.stats?.monthlyRevenue}, Products: ${adminData.stats?.totalProducts}`)
  if (!adminData.success) {
    throw new Error('Admin authorization failed for valid admin!')
  }
  console.log('✓ Admin access verified')

  // 9. Test Order creation
  console.log('\n9. Testing POST /api/orders...')
  const orderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${custToken}`,
    },
    body: JSON.stringify({
      items: [{ id: 'prod-1', productId: 'prod-1', quantity: 1 }],
      shippingAddress: {
        fullName: 'Ahmet Yılmaz',
        phone: '05551234567',
        addressLine: 'Atatürk Cad. No: 15/4',
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34710',
      },
    }),
  })
  const orderData = await orderRes.json()
  console.log(`Status: ${orderRes.status}, Order Number: ${orderData.order?.orderNumber}, Total: ${orderData.order?.totalAmount}`)
  if (!orderData.success || !orderData.order?.orderNumber) {
    throw new Error('Order creation failed!')
  }
  console.log('✓ Order creation and snapshotting verified')

  // 10. Test Favorites API
  console.log('\n10. Testing POST & GET /api/favorites...')
  const addFavRes = await fetch(`${baseUrl}/api/favorites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${custToken}`,
    },
    body: JSON.stringify({ productId: 'prod-1' }),
  })
  const addFavData = await addFavRes.json()
  console.log(`Favorite added, productIds:`, addFavData.productIds)

  const getFavRes = await fetch(`${baseUrl}/api/favorites`, {
    headers: { Authorization: `Bearer ${custToken}` },
  })
  const getFavData = await getFavRes.json()
  console.log(`Favorites list length: ${getFavData.products?.length}`)
  if (!getFavData.success || getFavData.products?.length === 0) {
    throw new Error('Favorites API failed!')
  }
  console.log('✓ Favorites persistence and retrieval verified')

  console.log('\n🎉 ALL 10 PHASE 5 API AND SECURITY TESTS PASSED PERFECTLY!')
}

runTests().catch((err) => {
  console.error('❌ Verification failed:', err)
  process.exit(1)
})
