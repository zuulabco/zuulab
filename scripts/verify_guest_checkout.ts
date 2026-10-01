import 'dotenv/config';
import pg from 'pg';
import { db, isDatabaseConfigured } from '../src/prisma/db';
import { getOrCreateGuestUser, syncOrCreateUser } from '../src/lib/services/auth.service';
import { createOrder, getAllOrders, getOrderByNumber } from '../src/lib/services/orders.service';

const { Client } = pg;

async function runTests() {
  console.log('========================================================');
  console.log('ZUULAB PROD-02 Faz 1: Guest Checkout & DB FK Verification');
  console.log('========================================================\n');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const testTimestamp = Date.now();
  const guestEmail = `guest.test.${testTimestamp}@example.com`;
  const guestName = 'Ayşe Test Guest';
  const guestPhone = '0532 999 1122';

  let guestUserId = '';
  let guestOrderNumber = '';
  let testItems = [
    { productId: 'prod-zk1', quantity: 1 }
  ];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Guest User Creation in DB (firebaseUid is NULL)
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Testing getOrCreateGuestUser for new guest...');
    const guestResult1 = await getOrCreateGuestUser({
      email: guestEmail,
      fullName: guestName,
      phone: guestPhone,
    });
    console.log('  Result:', guestResult1);
    if (!guestResult1.id || !guestResult1.isNew) {
      throw new Error('TEST 1 FAILED: Expected new guest user to be created');
    }
    guestUserId = guestResult1.id;

    // Verify in real PostgreSQL
    const dbUserRes = await client.query(
      'SELECT id, email, firebase_uid, role, status, is_active, email_verified FROM users WHERE id = $1;',
      [guestUserId]
    );
    const dbUser = dbUserRes.rows[0];
    console.log('  DB User record:', dbUser);
    if (!dbUser) throw new Error('TEST 1 FAILED: User not found in PostgreSQL');
    if (dbUser.firebase_uid !== null) throw new Error('TEST 1 FAILED: firebase_uid should be null');
    if (dbUser.email !== guestEmail.toLowerCase()) throw new Error('TEST 1 FAILED: email mismatch');
    if (dbUser.role !== 'CUSTOMER') throw new Error('TEST 1 FAILED: role should be CUSTOMER');
    console.log('  -> TEST 1 PASSED: Guest user successfully created with NULL firebase_uid in PostgreSQL.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Idempotent Guest User Lookup (same email re-used)
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Testing getOrCreateGuestUser idempotency for existing email...');
    const guestResult2 = await getOrCreateGuestUser({
      email: guestEmail,
      fullName: guestName,
      phone: guestPhone,
    });
    console.log('  Result:', guestResult2);
    if (guestResult2.id !== guestUserId || guestResult2.isNew !== false) {
      throw new Error('TEST 2 FAILED: Expected existing guest user to be reused');
    }
    console.log('  -> TEST 2 PASSED: Existing user retrieved without duplicate creation.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Guest Checkout -> Order Creation & PostgreSQL Foreign Key
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Testing guest order creation and PostgreSQL FK persistence...');
    const orderPayload = {
      userId: guestUserId,
      items: testItems,
      shippingAddress: {
        fullName: guestName,
        phone: guestPhone,
        addressLine: 'Nispetiye Cad. No: 12',
        city: 'İstanbul',
        district: 'Beşiktaş',
        postalCode: '34340',
        country: 'TR',
        email: guestEmail,
      },
      shippingMethod: 'STANDARD' as const,
      billingSameAsShipping: true,
      customerNote: 'PROD-02 Guest Order Test',
    };

    const order = await createOrder(orderPayload);
    guestOrderNumber = order.orderNumber;
    console.log('  Order created:', {
      orderNumber: order.orderNumber,
      userId: order.userId,
      totalAmount: order.totalAmount,
      status: order.status,
    });

    // Verify in real PostgreSQL `orders` table
    const dbOrderRes = await client.query(
      'SELECT id, order_number, user_id, status, total, ship_to_name, ship_to_city FROM orders WHERE order_number = $1;',
      [guestOrderNumber]
    );
    const dbOrder = dbOrderRes.rows[0];
    console.log('  DB Order row in PostgreSQL:', dbOrder);
    if (!dbOrder) {
      throw new Error('TEST 3 FAILED: Order was NOT persisted in PostgreSQL orders table (FK failure)!');
    }
    if (dbOrder.user_id !== guestUserId) {
      throw new Error(`TEST 3 FAILED: DB order.user_id (${dbOrder.user_id}) does not match guestUserId (${guestUserId})`);
    }
    console.log('  -> TEST 3 PASSED: Guest order successfully persisted to PostgreSQL referencing valid User.id.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Guest User Account Linking upon subsequent Firebase Auth
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Testing guest account linking when user later logs in with Firebase...');
    const fakeFirebaseUid = `firebase-uid-test-${testTimestamp}`;
    const syncedUser = await syncOrCreateUser({
      firebaseUid: fakeFirebaseUid,
      email: guestEmail,
      name: 'Ayşe Linked Name',
    });
    console.log('  Synced user:', {
      id: syncedUser.id,
      email: syncedUser.email,
      firebaseUid: syncedUser.firebaseUid,
    });

    if (syncedUser.id !== guestUserId) {
      throw new Error('TEST 4 FAILED: syncOrCreateUser did not link to existing guest user ID');
    }
    if (syncedUser.firebaseUid !== fakeFirebaseUid) {
      throw new Error('TEST 4 FAILED: firebaseUid was not updated');
    }

    // Verify PostgreSQL row is updated
    const dbUpdatedRes = await client.query(
      'SELECT id, email, firebase_uid, email_verified FROM users WHERE id = $1;',
      [guestUserId]
    );
    const dbUpdatedUser = dbUpdatedRes.rows[0];
    console.log('  DB User row after Firebase linking:', dbUpdatedUser);
    if (dbUpdatedUser.firebase_uid !== fakeFirebaseUid || !dbUpdatedUser.email_verified) {
      throw new Error('TEST 4 FAILED: DB row was not updated with firebaseUid and email_verified=true');
    }
    console.log('  -> TEST 4 PASSED: Guest account seamlessly linked to Firebase account without losing orders.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Authenticated Checkout Order Creation
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Testing authenticated user checkout flow...');
    const authOrderPayload = {
      userId: guestUserId, // now an authenticated user
      items: testItems,
      shippingAddress: {
        fullName: 'Ayşe Linked Name',
        phone: guestPhone,
        addressLine: 'Nispetiye Cad. No: 12',
        city: 'İstanbul',
        district: 'Beşiktaş',
        postalCode: '34340',
        country: 'TR',
        email: guestEmail,
      },
      shippingMethod: 'STANDARD' as const,
      billingSameAsShipping: true,
    };
    const authOrder = await createOrder(authOrderPayload);
    console.log('  Auth order created:', {
      orderNumber: authOrder.orderNumber,
      userId: authOrder.userId,
    });

    const dbAuthOrderRes = await client.query(
      'SELECT id, order_number, user_id FROM orders WHERE order_number = $1;',
      [authOrder.orderNumber]
    );
    if (!dbAuthOrderRes.rows[0]) {
      throw new Error('TEST 5 FAILED: Authenticated order not found in PostgreSQL');
    }
    console.log('  -> TEST 5 PASSED: Authenticated user checkout works and persists to PostgreSQL.\n');

    // -------------------------------------------------------------------------
    // TEST 6: Admin Order List Visibility
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Testing Admin Order List includes guest/created orders...');
    const allOrders = await getAllOrders();
    const foundGuestOrder = allOrders.find(o => o.orderNumber === guestOrderNumber);
    if (!foundGuestOrder) {
      throw new Error('TEST 6 FAILED: Guest order not visible in admin order list');
    }
    console.log('  Found order in admin list:', {
      orderNumber: foundGuestOrder.orderNumber,
      customerEmail: foundGuestOrder.customerEmail,
      totalAmount: foundGuestOrder.totalAmount,
    });
    console.log('  -> TEST 6 PASSED: Guest order is visible in Admin Order List.\n');

    // -------------------------------------------------------------------------
    // TEST 7: Guest Order Security / IDOR Protection
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Testing Guest Order access control (IDOR protection)...');
    
    // Non-admin with matching email can view
    const orderForCustomer = await getOrderByNumber(guestOrderNumber, guestUserId, false);
    if (!orderForCustomer || orderForCustomer.orderNumber !== guestOrderNumber) {
      throw new Error('TEST 7 FAILED: Owner was unable to retrieve their order');
    }

    // Non-admin with DIFFERENT userId cannot view
    const orderForStranger = await getOrderByNumber(guestOrderNumber, 'stranger-user-id', false);
    if (orderForStranger !== null) {
      throw new Error('TEST 7 FAILED: Stranger was able to retrieve another user order (IDOR vulnerability)!');
    }

    console.log('  -> TEST 7 PASSED: IDOR protection verified. Stranger access correctly blocked.\n');

    console.log('ALL 7 INTEGRATION TESTS PASSED SUCCESSFULLY! 🚀');

  } finally {
    // Clean up test records from PostgreSQL
    console.log('\nCleaning up test records from database...');
    if (guestOrderNumber) {
      await client.query('DELETE FROM orders WHERE user_id = $1;', [guestUserId]);
    }
    if (guestUserId) {
      await client.query('DELETE FROM users WHERE id = $1;', [guestUserId]);
    }
    await client.end();
    console.log('Database cleanup completed.');
  }
}

runTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('TEST SUITE ERROR:', err);
    process.exit(1);
  });
