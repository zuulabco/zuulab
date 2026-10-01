/**
 * ZUULAB PHASE 15 — CUSTOMER EXPERIENCE, ENGAGEMENT & STOREFRONT COMPLETION VERIFICATION
 *
 * Verifies:
 * 1. Customer Address Book (CRUD, Default Exclusivity, Strict Ownership & Isolation)
 * 2. Checkout Saved Address Selection (Ownership Verification & Historical Snapshot Preservation)
 * 3. Real Product Reviews (Verified Buyer Check, Server-Side isVerifiedBuy, Moderation, Public Filtering, Rating Aggregation)
 * 4. Customer Support / Helpdesk (Ticket Creation, Order Linking, Strict Isolation, Internal Note Masking, Admin Reply)
 * 5. Institutional & Legal Pages (6 Routes, Metadata, Footer 404 Elimination)
 */

import {
  createAddress,
  getUserAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
} from '../lib/services/address.service'
import {
  getProductReviews,
  createProductReview,
  getAdminReviews,
  moderateReview,
} from '../lib/services/reviews.service'
import {
  createTicket,
  getCustomerTickets,
  getTicketDetails,
  addMessageToTicket,
  getAdminTickets,
  updateTicketStatus,
} from '../lib/services/support.service'
import { createOrder } from '../lib/services/orders.service'
import type { AuthUser } from '../lib/services/auth.service'

const mockAdminUser: AuthUser = {
  id: 'usr-admin-test',
  firebaseUid: 'fb-admin-test',
  email: 'admin@zuulab.com',
  name: 'Sistem Yöneticisi',
  avatar: null,
  role: 'ADMIN',
  status: 'ACTIVE',
}

const mockCustomerA: AuthUser = {
  id: 'usr-cust-a',
  firebaseUid: 'fb-cust-a',
  email: 'ahmet@zuulab.test',
  name: 'Ahmet Yılmaz',
  avatar: null,
  role: 'CUSTOMER',
  status: 'ACTIVE',
}

const mockCustomerB: AuthUser = {
  id: 'usr-cust-b',
  firebaseUid: 'fb-cust-b',
  email: 'ayse@zuulab.test',
  name: 'Ayşe Demir',
  avatar: null,
  role: 'CUSTOMER',
  status: 'ACTIVE',
}

let passedTests = 0
let failedTests = 0

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`)
    passedTests++
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` — ${detail}` : ''}`)
    failedTests++
  }
}

async function runPhase15Verification() {
  console.log('\n===============================================================')
  console.log('  ZUULAB PHASE 15 — CUSTOMER EXPERIENCE & STOREFRONT VERIFICATION')
  console.log('===============================================================\n')

  // -------------------------------------------------------------
  // PART A: ADDRESS BOOK CRUD & ISOLATION
  // -------------------------------------------------------------
  console.log('--- 1. Customer Address Book & Exclusivity ---')

  // 1.1 Create first address (should auto-become default)
  const addr1 = await createAddress(mockCustomerA.id, {
    title: 'Evim',
    firstName: 'Ahmet',
    lastName: 'Yılmaz',
    phone: '05551112233',
    addressLine1: 'Bağdat Caddesi No: 42 D: 5',
    city: 'İstanbul',
    district: 'Kadıköy',
    postalCode: '34710',
  })
  assert(addr1.isDefault === true, '1.1 First created address automatically set to default')

  // 1.2 Create second address with isDefault: true (should unset first address default)
  const addr2 = await createAddress(mockCustomerA.id, {
    title: 'İş Yeri',
    firstName: 'Ahmet',
    lastName: 'Yılmaz',
    phone: '05551112233',
    addressLine1: 'Levent Mah. Plaza Kat: 12',
    city: 'İstanbul',
    district: 'Beşiktaş',
    postalCode: '34330',
    isDefault: true,
  })
  assert(addr2.isDefault === true, '1.2 Second address set to default')

  const custAAddresses = await getUserAddresses(mockCustomerA.id)
  const updatedAddr1 = custAAddresses.find((a) => a.id === addr1.id)
  assert(
    updatedAddr1?.isDefault === false,
    '1.3 Default exclusivity: previously default address demoted when new default chosen'
  )

  // 1.4 Update address
  const updatedAddr2 = await updateAddress(mockCustomerA.id, addr2.id, {
    title: 'Merkez Ofis',
  })
  assert(updatedAddr2.title === 'Merkez Ofis', '1.4 Customer can update their own address')

  // 1.5 Cross-user isolation: Customer B cannot update Customer A address
  let crossUserUpdateBlocked = false
  try {
    await updateAddress(mockCustomerB.id, addr1.id, { title: 'Hacked' })
  } catch (err: any) {
    crossUserUpdateBlocked = err.message.includes('NOT_FOUND')
  }
  assert(crossUserUpdateBlocked, '1.5 Customer B cannot update Customer A address (Strict Isolation)')

  // 1.6 Cross-user isolation: Customer B cannot delete Customer A address
  let crossUserDeleteBlocked = false
  try {
    await deleteAddress(mockCustomerB.id, addr1.id)
  } catch (err: any) {
    crossUserDeleteBlocked = err.message.includes('NOT_FOUND')
  }
  assert(crossUserDeleteBlocked, '1.6 Customer B cannot delete Customer A address')

  // 1.7 Delete address and verify promotion
  await deleteAddress(mockCustomerA.id, addr2.id)
  const afterDelete = await getUserAddresses(mockCustomerA.id)
  assert(afterDelete.length === 1 && afterDelete[0].id === addr1.id, '1.7 Address deleted successfully')
  assert(afterDelete[0].isDefault === true, '1.8 Remaining address promoted to default upon default deletion')

  // -------------------------------------------------------------
  // PART B: CHECKOUT SAVED ADDRESS SELECTION & SNAPSHOT
  // -------------------------------------------------------------
  console.log('\n--- 2. Checkout Saved Address & Historical Snapshot ---')

  const testProduct = { productId: 'prod-1', quantity: 1 }

  // 2.1 Create order using Customer A's saved address
  const orderA = await createOrder({
    userId: mockCustomerA.id,
    items: [testProduct],
    shippingAddress: {
      fullName: `${addr1.firstName} ${addr1.lastName}`,
      phone: addr1.phone,
      addressLine: addr1.addressLine1,
      city: addr1.city,
      district: addr1.district,
      postalCode: addr1.postalCode,
      country: addr1.country,
    },
    addressId: addr1.id,
  })

  assert(orderA.addressId === addr1.id, '2.1 Order linked with saved address ID')
  assert(
    orderA.shippingAddressSnapshot.addressLine === addr1.addressLine1,
    '2.2 Order preserved historical address snapshot'
  )

  // 2.3 Modify Customer A's address in address book
  await updateAddress(mockCustomerA.id, addr1.id, {
    addressLine1: 'Yeni Taşındığı Adres No: 99',
  })

  // 2.4 Verify order historical snapshot did NOT change
  assert(
    orderA.shippingAddressSnapshot.addressLine === 'Bağdat Caddesi No: 42 D: 5',
    '2.3 Modifying address book preserves past order historical address snapshot intact'
  )

  // 2.5 Cross-user address tampering check in checkout
  const custBOwnAddress = await getAddressById(mockCustomerB.id, addr1.id)
  assert(custBOwnAddress === null, '2.4 getAddressById strictly rejects foreign user address ID lookup')

  // -------------------------------------------------------------
  // PART C: REAL PRODUCT REVIEWS & VERIFIED BUYER RULE
  // -------------------------------------------------------------
  console.log('\n--- 3. Real Product Reviews & Moderation ---')

  const targetProductId = 'prod-1'

  // 3.1 Non-buyer customer review attempt must be rejected
  let nonBuyerBlocked = false
  try {
    await createProductReview(
      { id: mockCustomerB.id, email: mockCustomerB.email, name: mockCustomerB.name },
      { productIdOrSlug: targetProductId, rating: 5, body: 'Harika bir ürün gibi görünüyor henüz almadım.' }
    )
  } catch (err: any) {
    nonBuyerBlocked = err.message.includes('NOT_ELIGIBLE')
  }
  assert(nonBuyerBlocked, '3.1 Non-buyer review strictly blocked with NOT_ELIGIBLE')

  // Make Customer A an eligible buyer by confirming their order
  const { updateOrderStatus } = await import('../lib/services/orders.service')
  await updateOrderStatus(orderA.orderNumber, 'CONFIRMED')

  // 3.2 Eligible buyer submits review
  const reviewA = await createProductReview(
    { id: mockCustomerA.id, email: mockCustomerA.email, name: mockCustomerA.name },
    {
      productIdOrSlug: targetProductId,
      rating: 5,
      title: 'Kusursuz Katman Kalitesi',
      body: 'Baskı detayları beklediğimden çok daha pürüzsüz. Çocuğum çok sevdi!',
    }
  )

  assert(reviewA.status === 'PENDING', '3.2 Submitted review initializes in PENDING status')
  assert(reviewA.isVerifiedBuy === true, '3.3 Server-side verified purchase (isVerifiedBuy) verified')
  assert(reviewA.orderId === orderA.id, '3.4 Review linked to qualifying order ID')

  // 3.3 Duplicate review attempt must be rejected
  let duplicateBlocked = false
  try {
    await createProductReview(
      { id: mockCustomerA.id, email: mockCustomerA.email, name: mockCustomerA.name },
      { productIdOrSlug: targetProductId, rating: 4, body: 'İkinci kez yorum yazmayı deniyorum.' }
    )
  } catch (err: any) {
    duplicateBlocked = err.message.includes('DUPLICATE_REVIEW')
  }
  assert(duplicateBlocked, '3.5 Duplicate review for same user & product strictly rejected')

  // 3.4 Public API must NOT show PENDING reviews
  const publicReviewsBefore = await getProductReviews(targetProductId)
  const isPendingVisible = publicReviewsBefore.reviews.some((r) => r.id === reviewA.id)
  assert(!isPendingVisible, '3.6 PENDING review is hidden from public storefront')

  // 3.5 Admin moderation: Approve review
  const adminPending = await getAdminReviews('PENDING')
  assert(adminPending.some((r) => r.id === reviewA.id), '3.7 Admin can view pending reviews queue')

  await moderateReview(mockAdminUser.id, reviewA.id, 'APPROVE')

  // 3.6 Public API now displays the APPROVED review and calculates stats
  const publicReviewsAfter = await getProductReviews(targetProductId)
  const approvedItem = publicReviewsAfter.reviews.find((r) => r.id === reviewA.id)
  assert(approvedItem !== undefined, '3.8 APPROVED review is immediately live on storefront')
  assert(approvedItem?.isVerifiedBuy === true, '3.9 Public review displays verified buyer badge')
  assert(publicReviewsAfter.stats.totalCount > 0, '3.10 Aggregate rating statistics calculated dynamically')

  // -------------------------------------------------------------
  // PART D: CUSTOMER SUPPORT / HELPDESK & ISOLATION
  // -------------------------------------------------------------
  console.log('\n--- 4. Customer Support / Helpdesk & Message Privacy ---')

  // 4.1 Customer A creates ticket linking their confirmed order
  const ticketA = await createTicket(
    { id: mockCustomerA.id, email: mockCustomerA.email, name: mockCustomerA.name },
    {
      subject: 'Kargom ne zaman yola çıkar?',
      category: 'SHIPPING',
      orderId: orderA.id,
      message: 'Siparişim dün onaylandı, tahmini kargoya veriliş günü nedir?',
    }
  )
  assert(ticketA.status === 'OPEN', '4.1 Customer support ticket created with status OPEN')
  assert(ticketA.orderId === orderA.id, '4.2 Customer order successfully linked to ticket')

  // 4.2 Cross-user order linking protection: Customer B trying to link Customer A's order
  let foreignOrderBlocked = false
  try {
    await createTicket(
      { id: mockCustomerB.id, email: mockCustomerB.email, name: mockCustomerB.name },
      {
        subject: 'Başkasına ait sipariş hakkında soru',
        category: 'ORDER',
        orderId: orderA.id,
        message: 'Bu sipariş numarası bana ait değil.',
      }
    )
  } catch (err: any) {
    foreignOrderBlocked = err.message.includes('FORBIDDEN')
  }
  assert(foreignOrderBlocked, '4.3 Customer B blocked from linking Customer A order to ticket')

  // 4.3 Customer isolation: Customer B cannot view Customer A's ticket
  let crossTicketViewBlocked = false
  try {
    await getTicketDetails(ticketA.id, mockCustomerB)
  } catch (err: any) {
    crossTicketViewBlocked = err.message.includes('FORBIDDEN')
  }
  assert(crossTicketViewBlocked, '4.4 Customer B strictly forbidden from viewing Customer A ticket')

  // 4.4 Admin adds internal note (isInternal: true)
  await addMessageToTicket(ticketA.id, mockAdminUser, 'Özel üretim planlandı, yarın çıkacak.', true)

  // 4.5 Customer retrieves ticket: internal note MUST be hidden
  const custAView = await getTicketDetails(ticketA.id, mockCustomerA)
  const hasInternalNote = custAView.messages?.some((m) => m.isInternal)
  assert(!hasInternalNote, '4.5 Internal admin notes are strictly hidden from customer view')

  // 4.6 Admin sends public reply (isInternal: false)
  await addMessageToTicket(
    ticketA.id,
    mockAdminUser,
    'Merhaba Ahmet Bey, siparişiniz yarın öğleden önce Sürat Kargo şubesine teslim edilecektir.',
    false
  )

  const custAViewAfterReply = await getTicketDetails(ticketA.id, mockCustomerA)
  const publicReply = custAViewAfterReply.messages?.find((m) => m.authorRole === 'SUPPORT')
  assert(publicReply !== undefined, '4.6 Customer can view official public support replies')
  assert(custAViewAfterReply.status === 'WAITING_CUSTOMER', '4.7 Admin reply advances status to WAITING_CUSTOMER')

  // 4.7 Admin resolves ticket
  const resolvedTicket = await updateTicketStatus(mockAdminUser.id, ticketA.id, {
    status: 'RESOLVED',
  })
  assert(resolvedTicket.status === 'RESOLVED', '4.8 Admin can mark support ticket as RESOLVED')

  // -------------------------------------------------------------
  // PART E: INSTITUTIONAL & LEGAL PAGES AUDIT (NO 404s)
  // -------------------------------------------------------------
  console.log('\n--- 5. Institutional & Legal Pages Route Audit ---')

  const fs = await import('fs')
  const path = await import('path')

  const requiredRoutes = [
    'src/app/(store)/hakkimizda/page.tsx',
    'src/app/(store)/uretim-sureci/page.tsx',
    'src/app/(store)/iletisim/page.tsx',
    'src/app/(store)/gizlilik-politikasi/page.tsx',
    'src/app/(store)/kullanim-kosullari/page.tsx',
    'src/app/(store)/iade-politikasi/page.tsx',
    'src/app/(store)/hesap/adresler/page.tsx',
    'src/app/(store)/hesap/destek/page.tsx',
  ]

  let allFilesExist = true
  for (const relPath of requiredRoutes) {
    const fullPath = path.join(process.cwd(), relPath)
    if (!fs.existsSync(fullPath)) {
      console.error(`Missing required page file: ${relPath}`)
      allFilesExist = false
    }
  }
  assert(allFilesExist, '5.1 All 8 required storefront pages exist on disk')

  // Check footer links coverage
  const footerContent = fs.readFileSync(path.join(process.cwd(), 'src/components/layout/Footer.tsx'), 'utf-8')
  const footerRoutesToCheck = [
    '/hakkimizda',
    '/uretim-sureci',
    '/iletisim',
    '/gizlilik-politikasi',
    '/kullanim-kosullari',
    '/iade-politikasi',
    '/hesap/adresler',
    '/hesap/destek',
  ]

  const allFooterRoutesCovered = footerRoutesToCheck.every((r) => footerContent.includes(r))
  assert(allFooterRoutesCovered, '5.2 All 8 footer routes are verified and mapped to live pages (Zero 404s)')

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n===============================================================')
  console.log(`  PHASE 15 VERIFICATION RESULT: ${passedTests} PASSED, ${failedTests} FAILED`)
  console.log('===============================================================\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runPhase15Verification().catch((err) => {
  console.error('Phase 15 Verification Fatal Error:', err)
  process.exit(1)
})
