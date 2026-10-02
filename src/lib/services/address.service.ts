import 'server-only'
import { db } from '@/prisma/db'
import { dbTimestampToIso } from '@/lib/db/time'

/**
 * Customer address book, stored in Postgres only. Each user has at most one
 * default address; changes to the default happen in one transaction.
 */

export interface AddressData {
  id?: string
  userId: string
  title: string
  firstName: string
  lastName: string
  phone: string
  addressLine1: string
  addressLine2?: string | null
  city: string
  district: string
  postalCode: string
  country?: string
  isDefault?: boolean
}

export interface StoredAddress {
  id: string
  userId: string
  title: string
  firstName: string
  lastName: string
  phone: string
  addressLine1: string
  addressLine2: string | null
  city: string
  district: string
  postalCode: string
  country: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

const MAX_ADDRESSES = 20

type AddressRow = NonNullable<Awaited<ReturnType<ReturnType<typeof db.orm.public.Address.where>['first']>>>

function toStored(r: AddressRow): StoredAddress {
  return {
    id: r.id,
    userId: r.userId,
    title: r.title,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2 || null,
    city: r.city,
    district: r.district,
    postalCode: r.postalCode,
    country: r.country || 'TR',
    isDefault: Boolean(r.isDefault),
    createdAt: dbTimestampToIso(r.createdAt) ?? '',
    updatedAt: dbTimestampToIso(r.updatedAt) ?? '',
  }
}

/**
 * Returns all addresses of the user, default first, then newest
 */
export async function getUserAddresses(userId: string): Promise<StoredAddress[]> {
  const rows = await db.orm.public.Address.where({ userId }).orderBy((a) => a.createdAt.desc()).all()
  return rows.map(toStored).sort((x, y) => Number(y.isDefault) - Number(x.isDefault))
}

/**
 * Retrieves a single address only if it belongs to the user
 */
export async function getAddressById(userId: string, addressId: string): Promise<StoredAddress | null> {
  const row = await db.orm.public.Address.where({ id: addressId, userId }).first()
  return row ? toStored(row) : null
}

/**
 * Creates a new address; the first address, or one marked default, becomes default
 */
export async function createAddress(
  userId: string,
  data: Omit<AddressData, 'id' | 'userId'>
): Promise<StoredAddress> {
  const count = await db.orm.public.Address.where({ userId }).aggregate((a) => ({ n: a.count() }))
  if (count.n >= MAX_ADDRESSES) {
    throw new Error(`VALIDATION_ERROR: En fazla ${MAX_ADDRESSES} adres kaydedebilirsiniz.`)
  }
  const makeDefault = Boolean(data.isDefault) || count.n === 0

  const id = await db.transaction(async (tx) => {
    if (makeDefault) {
      await tx.execute(db.raw.sql`UPDATE addresses SET is_default = false WHERE user_id = ${userId} AND is_default`.affectedCount().build())
    }
    const created = await tx.orm.public.Address.create({
      userId,
      title: data.title,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 || null,
      city: data.city,
      district: data.district,
      postalCode: data.postalCode,
      country: data.country || 'TR',
      isDefault: makeDefault,
    })
    return created.id
  })

  return (await getAddressById(userId, id))!
}

/**
 * Updates an address the user owns
 */
export async function updateAddress(
  userId: string,
  addressId: string,
  data: Partial<Omit<AddressData, 'id' | 'userId'>>
): Promise<StoredAddress> {
  const existing = await getAddressById(userId, addressId)
  if (!existing) {
    throw new Error('NOT_FOUND: Adres bulunamadı veya bu hesaba ait değil.')
  }

  const fields: Record<string, unknown> = {}
  for (const key of ['title', 'firstName', 'lastName', 'phone', 'addressLine1', 'addressLine2', 'city', 'district', 'postalCode', 'country'] as const) {
    if (data[key] !== undefined) fields[key] = data[key]
  }

  await db.transaction(async (tx) => {
    if (data.isDefault === true) {
      await tx.execute(
        db.raw.sql`UPDATE addresses SET is_default = (id = ${addressId}) WHERE user_id = ${userId}`.affectedCount().build()
      )
    }
    // Unsetting the only default is ignored: the user always keeps a default.
    if (Object.keys(fields).length > 0) {
      await tx.orm.public.Address.where({ id: addressId, userId }).update(fields as never)
    }
  })

  return (await getAddressById(userId, addressId))!
}

/**
 * Makes one of the user's addresses the default
 */
export async function setDefaultAddress(userId: string, addressId: string): Promise<StoredAddress> {
  return updateAddress(userId, addressId, { isDefault: true })
}

/**
 * Deletes an address the user owns. Past orders keep their own address snapshot
 * and only lose the link; if the default was deleted, the newest remaining
 * address becomes the default.
 */
export async function deleteAddress(userId: string, addressId: string): Promise<boolean> {
  const existing = await getAddressById(userId, addressId)
  if (!existing) {
    throw new Error('NOT_FOUND: Adres bulunamadı veya bu hesaba ait değil.')
  }

  await db.transaction(async (tx) => {
    await tx.execute(db.raw.sql`UPDATE orders SET address_id = NULL WHERE address_id = ${addressId}`.affectedCount().build())
    await tx.execute(db.raw.sql`DELETE FROM addresses WHERE id = ${addressId} AND user_id = ${userId}`.affectedCount().build())
    if (existing.isDefault) {
      await tx.execute(
        db.raw.sql`UPDATE addresses SET is_default = true WHERE id = (
          SELECT id FROM addresses WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
        )`.affectedCount().build()
      )
    }
  })
  return true
}
