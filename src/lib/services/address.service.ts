import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'

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

// Thread-safe in-memory address repository for local dev / testing
const inMemoryAddresses: Map<string, StoredAddress> = new Map()

/**
 * Returns all addresses belonging to the specified user
 */
export async function getUserAddresses(userId: string): Promise<StoredAddress[]> {
  if (isDatabaseConfigured) {
    try {
      const records = await db.orm.public.Address.where({ userId }).all()
      return records.map((r) => ({
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
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
      }))
    } catch (err) {
      console.warn('[address.service] DB fetch failed, using fallback:', err)
    }
  }

  return Array.from(inMemoryAddresses.values())
    .filter((a) => a.userId === userId)
    .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
}

/**
 * Retrieves a single address with strict server-side ownership verification
 */
export async function getAddressById(userId: string, addressId: string): Promise<StoredAddress | null> {
  const addresses = await getUserAddresses(userId)
  return addresses.find((a) => a.id === addressId) || null
}

/**
 * Creates a new address for the authenticated user
 */
export async function createAddress(
  userId: string,
  data: Omit<AddressData, 'id' | 'userId'>
): Promise<StoredAddress> {
  const existing = await getUserAddresses(userId)
  // If first address or explicitly marked as default, make it default
  const makeDefault = data.isDefault || existing.length === 0

  if (isDatabaseConfigured) {
    try {
      if (makeDefault) {
        // Clear previous defaults for this user
        for (const addr of existing) {
          if (addr.isDefault) {
            await db.orm.public.Address.where({ id: addr.id }).update({ isDefault: false })
          }
        }
      }

      const created = await db.orm.public.Address.create({
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

      return {
        id: created.id,
        userId: created.userId,
        title: created.title,
        firstName: created.firstName,
        lastName: created.lastName,
        phone: created.phone,
        addressLine1: created.addressLine1,
        addressLine2: created.addressLine2 || null,
        city: created.city,
        district: created.district,
        postalCode: created.postalCode,
        country: created.country || 'TR',
        isDefault: created.isDefault,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    } catch (err) {
      console.warn('[address.service] DB create failed, using fallback:', err)
    }
  }

  // Fallback in-memory
  if (makeDefault) {
    for (const [id, addr] of inMemoryAddresses.entries()) {
      if (addr.userId === userId && addr.isDefault) {
        inMemoryAddresses.set(id, { ...addr, isDefault: false, updatedAt: new Date().toISOString() })
      }
    }
  }

  const id = `addr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const newAddress: StoredAddress = {
    id,
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  inMemoryAddresses.set(id, newAddress)
  return newAddress
}

/**
 * Updates an address with strict server-side ownership verification
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

  const allUserAddresses = await getUserAddresses(userId)

  if (isDatabaseConfigured) {
    try {
      if (data.isDefault) {
        // Clear other defaults
        for (const addr of allUserAddresses) {
          if (addr.id !== addressId && addr.isDefault) {
            await db.orm.public.Address.where({ id: addr.id }).update({ isDefault: false })
          }
        }
      }

      await db.orm.public.Address.where({ id: addressId }).update({
        ...(data.title !== undefined && { title: data.title }),
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.addressLine1 !== undefined && { addressLine1: data.addressLine1 }),
        ...(data.addressLine2 !== undefined && { addressLine2: data.addressLine2 }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.district !== undefined && { district: data.district }),
        ...(data.postalCode !== undefined && { postalCode: data.postalCode }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      })

      const updated = await db.orm.public.Address.where({ id: addressId }).first()
      if (updated) {
        return {
          id: updated.id,
          userId: updated.userId,
          title: updated.title,
          firstName: updated.firstName,
          lastName: updated.lastName,
          phone: updated.phone,
          addressLine1: updated.addressLine1,
          addressLine2: updated.addressLine2 || null,
          city: updated.city,
          district: updated.district,
          postalCode: updated.postalCode,
          country: updated.country || 'TR',
          isDefault: updated.isDefault,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        }
      }
    } catch (err) {
      console.warn('[address.service] DB update failed, using fallback:', err)
    }
  }

  // Fallback in-memory
  if (data.isDefault) {
    for (const [id, addr] of inMemoryAddresses.entries()) {
      if (addr.userId === userId && id !== addressId && addr.isDefault) {
        inMemoryAddresses.set(id, { ...addr, isDefault: false, updatedAt: new Date().toISOString() })
      }
    }
  }

  const updatedInMemory: StoredAddress = {
    ...existing,
    ...data,
    updatedAt: new Date().toISOString(),
  }
  inMemoryAddresses.set(addressId, updatedInMemory)
  return updatedInMemory
}

/**
 * Deletes an address with strict server-side ownership verification
 */
export async function deleteAddress(userId: string, addressId: string): Promise<boolean> {
  const existing = await getAddressById(userId, addressId)
  if (!existing) {
    throw new Error('NOT_FOUND: Adres bulunamadı veya bu hesaba ait değil.')
  }

  if (isDatabaseConfigured) {
    try {
      await db.orm.public.Address.where({ id: addressId }).delete()
      
      // If deleted address was default, promote another address to default
      if (existing.isDefault) {
        const remaining = await db.orm.public.Address.where({ userId }).first()
        if (remaining) {
          await db.orm.public.Address.where({ id: remaining.id }).update({ isDefault: true })
        }
      }
      return true
    } catch (err) {
      console.warn('[address.service] DB delete failed, using fallback:', err)
    }
  }

  inMemoryAddresses.delete(addressId)

  // Promote another to default if deleted was default
  if (existing.isDefault) {
    const remaining = Array.from(inMemoryAddresses.values()).find((a) => a.userId === userId)
    if (remaining) {
      inMemoryAddresses.set(remaining.id, {
        ...remaining,
        isDefault: true,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  return true
}
