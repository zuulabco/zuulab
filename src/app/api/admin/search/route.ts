import { NextResponse } from 'next/server'
import { db } from '@/prisma/db'
import { requireAuth } from '@/lib/services/auth.service'
import { adminGetProducts } from '@/lib/services/catalog-admin.service'
import { formatPrice } from '@/lib/utils'
import { rankMatches, searchTokens } from '@/lib/admin-search'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/types/order'

/**
 * Admin quick search: one query across orders (number, customer, e-mail, phone,
 * tracking number, coupon), products (name, SKU, barcode, variant SKU, category,
 * material), returns, customers, support tickets, marketplace orders, coupons,
 * campaigns, categories and collections. Page names are matched in the browser.
 *
 * Big tables are narrowed in SQL by the longest word (Turkish letters folded the
 * same way as foldText); every word must then match, scored by rankMatches.
 */

interface SearchItem {
  title: string
  subtitle?: string
  href: string
}

interface SearchGroup {
  key: string
  label: string
  items: SearchItem[]
}

const PER_GROUP = 5

/** Text column shape for raw queries: every column is selected as non-null text */
function textRow<K extends string>(...columns: K[]) {
  return Object.fromEntries(columns.map((c) => [c, 'pg/text@1'])) as never
}

async function queryRows<K extends string>(
  query: { returnsRow: (shape: never) => { build: () => unknown } },
  ...columns: K[]
): Promise<Array<Record<K, string>>> {
  return (await db.runtime().query(query.returnsRow(textRow(...columns)).build() as never)) as unknown as Array<
    Record<K, string>
  >
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    if (user.role === 'CUSTOMER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100)
    const tokens = searchTokens(q)
    if (q.length < 2 || tokens.length === 0) {
      return NextResponse.json({ success: true, groups: [] })
    }

    // SQL pre-filter on the longest word, folded like foldText (LIKE wildcards escaped)
    const longest = [...tokens].sort((a, b) => b.length - a.length)[0]
    const like = `%${longest.replace(/[%_\\]/g, (c) => `\\${c}`)}%`

    const [orders, products, returns, customers, tickets, marketOrders, coupons, campaigns, categories, collections] =
      await Promise.all([
        queryRows(
          db.raw.sql`
            SELECT o.order_number, o.ship_to_name, o.ship_to_phone, COALESCE(o.email, '') AS email,
                   o.status::text AS status, o.total::text AS total, COALESCE(o.coupon_code, '') AS coupon,
                   COALESCE(string_agg(s.tracking_number, ' '), '') AS tracking
            FROM orders o
            LEFT JOIN shipments s ON s.order_id = o.id
            GROUP BY o.id
            HAVING lower(translate(
              o.order_number || ' ' || o.ship_to_name || ' ' || COALESCE(o.email, '') || ' ' || o.ship_to_phone || ' ' ||
              regexp_replace(o.ship_to_phone, '[^0-9]', '', 'g') || ' ' || COALESCE(o.coupon_code, '') || ' ' ||
              COALESCE(string_agg(s.tracking_number, ' '), ''),
              'ÇĞİIÖŞÜçğıöşüÂÎÛâîû', 'cgiiosucgiosuaiuaiu')) LIKE ${like}
            ORDER BY max(o.created_at) DESC
            LIMIT 200` as never,
          'order_number', 'ship_to_name', 'ship_to_phone', 'email', 'status', 'total', 'coupon', 'tracking'
        ),
        adminGetProducts({ limit: 100000 }),
        queryRows(
          db.raw.sql`
            SELECT r.return_number, r.status::text AS status, o.order_number, o.ship_to_name, COALESCE(o.email, '') AS email
            FROM return_requests r
            JOIN orders o ON o.id = r.order_id
            WHERE lower(translate(
              r.return_number || ' ' || o.order_number || ' ' || o.ship_to_name || ' ' || COALESCE(o.email, ''),
              'ÇĞİIÖŞÜçğıöşüÂÎÛâîû', 'cgiiosucgiosuaiuaiu')) LIKE ${like}
            ORDER BY r.created_at DESC
            LIMIT 200` as never,
          'return_number', 'status', 'order_number', 'ship_to_name', 'email'
        ),
        queryRows(
          db.raw.sql`
            SELECT u.email, u.role::text AS role, COALESCE(u.phone, '') AS phone,
                   COALESCE(NULLIF(u.name, ''), trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))) AS name
            FROM users u
            WHERE lower(translate(
              u.email || ' ' || COALESCE(u.name, '') || ' ' || COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') || ' ' ||
              COALESCE(u.phone, '') || ' ' || regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g'),
              'ÇĞİIÖŞÜçğıöşüÂÎÛâîû', 'cgiiosucgiosuaiuaiu')) LIKE ${like}
            ORDER BY u.created_at DESC
            LIMIT 200` as never,
          'email', 'role', 'phone', 'name'
        ),
        queryRows(
          db.raw.sql`
            SELECT t.id, t.subject, t.status::text AS status, COALESCE(u.email, '') AS email,
                   COALESCE(u.name, '') AS name, COALESCE(o.order_number, '') AS order_number
            FROM support_tickets t
            LEFT JOIN users u ON u.id = t.user_id
            LEFT JOIN orders o ON o.id = t.order_id
            WHERE lower(translate(
              t.id || ' ' || t.subject || ' ' || COALESCE(u.email, '') || ' ' || COALESCE(u.name, '') || ' ' || COALESCE(o.order_number, ''),
              'ÇĞİIÖŞÜçğıöşüÂÎÛâîû', 'cgiiosucgiosuaiuaiu')) LIKE ${like}
            ORDER BY t.updated_at DESC
            LIMIT 200` as never,
          'id', 'subject', 'status', 'email', 'name', 'order_number'
        ),
        queryRows(
          db.raw.sql`
            SELECT m.id, m.external_order_number, m.package_id, m.status, m.total_amount::text AS total,
                   COALESCE(m.customer_name, '') AS customer_name, COALESCE(m.tracking_number, '') AS tracking,
                   COALESCE(s.name, '') AS store
            FROM marketplace_orders m
            LEFT JOIN marketplace_stores s ON s.id = m.store_id
            WHERE lower(translate(
              m.external_order_number || ' ' || m.package_id || ' ' || COALESCE(m.customer_name, '') || ' ' || COALESCE(m.tracking_number, ''),
              'ÇĞİIÖŞÜçğıöşüÂÎÛâîû', 'cgiiosucgiosuaiuaiu')) LIKE ${like}
            ORDER BY m.order_date DESC
            LIMIT 200` as never,
          'id', 'external_order_number', 'package_id', 'status', 'total', 'customer_name', 'tracking', 'store'
        ),
        db.orm.public.Coupon.select('code', 'description', 'isActive').all(),
        db.orm.public.Campaign.select('name', 'description', 'isActive').all(),
        db.orm.public.Category.select('name', 'slug', 'isActive').all(),
        db.orm.public.Collection.select('name', 'slug').all(),
      ])

    const groups: SearchGroup[] = [
      {
        key: 'orders',
        label: 'Siparişler',
        items: rankMatches(
          orders,
          tokens,
          (o) => [o.order_number, o.ship_to_name, o.email, o.ship_to_phone, o.coupon, ...o.tracking.split(' ')],
          PER_GROUP
        ).map((o) => ({
          title: `#${o.order_number} · ${o.ship_to_name}`,
          subtitle: `${ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status} · ${formatPrice(Number(o.total))}`,
          href: `/orders/${o.order_number}`,
        })),
      },
      {
        key: 'products',
        label: 'Ürünler',
        items: rankMatches(
          products.items,
          tokens,
          (p) => [
            p.name,
            p.sku,
            p.slug,
            p.barcode,
            p.categoryName,
            p.material,
            ...(p.variants ?? []).flatMap((v) => [v.sku, v.value]),
          ],
          PER_GROUP + 1
        ).map((p) => ({
          title: p.name,
          subtitle: `${p.sku} · ${formatPrice(p.price)} · Stok ${p.stock}${p.status === 'ARCHIVED' ? ' · Arşivde' : ''}`,
          href: `/products/${p.id}`,
        })),
      },
      {
        key: 'returns',
        label: 'İadeler',
        items: rankMatches(returns, tokens, (r) => [r.return_number, r.order_number, r.ship_to_name, r.email], PER_GROUP).map(
          (r) => ({
            title: `${r.return_number} · ${r.ship_to_name}`,
            subtitle: `Sipariş #${r.order_number} · ${r.status}`,
            href: `/returns/${r.return_number}`,
          })
        ),
      },
      {
        key: 'customers',
        label: 'Müşteriler ve kullanıcılar',
        items: rankMatches(customers, tokens, (u) => [u.name, u.email, u.phone], PER_GROUP).map((u) => {
          const isCustomer = u.role === 'CUSTOMER'
          return {
            title: u.name || u.email,
            subtitle: isCustomer ? `${u.email} · siparişlerini gör` : `${u.email} · ${u.role}`,
            href: isCustomer ? `/orders?search=${encodeURIComponent(u.email)}` : '/users',
          }
        }),
      },
      {
        key: 'tickets',
        label: 'Destek talepleri',
        items: rankMatches(tickets, tokens, (t) => [t.subject, t.id, t.email, t.name, t.order_number], PER_GROUP).map((t) => ({
          title: t.subject,
          subtitle: `${t.name || t.email} · ${t.status}`,
          href: '/support',
        })),
      },
      {
        key: 'marketplaceOrders',
        label: 'Pazaryeri siparişleri',
        items: rankMatches(
          marketOrders,
          tokens,
          (m) => [m.external_order_number, m.package_id, m.customer_name, m.tracking],
          PER_GROUP
        ).map((m) => ({
          title: `${m.external_order_number}${m.customer_name ? ` · ${m.customer_name}` : ''}`,
          subtitle: `${m.store || 'Pazaryeri'} · ${m.status} · ${formatPrice(Number(m.total))}`,
          href: `/marketplaces/orders/${m.id}`,
        })),
      },
      {
        key: 'coupons',
        label: 'Kuponlar',
        items: rankMatches(coupons, tokens, (c) => [c.code, c.description], PER_GROUP).map((c) => ({
          title: c.code,
          subtitle: `${c.description || 'Kupon'}${c.isActive ? '' : ' · Pasif'}`,
          href: '/coupons',
        })),
      },
      {
        key: 'campaigns',
        label: 'Kampanyalar',
        items: rankMatches(campaigns, tokens, (c) => [c.name, c.description], PER_GROUP).map((c) => ({
          title: c.name,
          subtitle: c.isActive ? 'Kampanya' : 'Kampanya · Pasif',
          href: '/campaigns',
        })),
      },
      {
        key: 'categories',
        label: 'Kategoriler ve koleksiyonlar',
        items: [
          ...rankMatches(categories, tokens, (c) => [c.name, c.slug], PER_GROUP).map((c) => ({
            title: c.name,
            subtitle: c.isActive ? 'Kategori' : 'Kategori · Gizli',
            href: '/categories',
          })),
          ...rankMatches(collections, tokens, (c) => [c.name, c.slug], PER_GROUP).map((c) => ({
            title: c.name,
            subtitle: 'Koleksiyon',
            href: '/collections',
          })),
        ].slice(0, PER_GROUP),
      },
    ].filter((g) => g.items.length > 0)

    return NextResponse.json({ success: true, groups })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: isAuth ? error.message : 'Arama yapılamadı.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
