import 'server-only'
import { db } from '@/prisma/db'
import { invalidateCatalog } from '@/lib/cache/catalog-cache'
import { logAuditEvent } from './admin.service'

/**
 * Materials a product can be made of (PLA, PETG…), picked from a list in the product
 * form. Products store the material by name, so renaming a material renames it on
 * every product that uses it.
 */
export interface ProductMaterialItem {
  id: string
  name: string
  description: string | null
  sortOrder: number
  productCount: number
}

export class MaterialValidationError extends Error {
  readonly isValidation = true
}

function cleanName(value: unknown): string {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (name.length < 2) throw new MaterialValidationError('Malzeme adı en az 2 karakter olmalıdır.')
  if (name.length > 60) throw new MaterialValidationError('Malzeme adı en fazla 60 karakter olabilir.')
  return name
}

export async function listProductMaterials(): Promise<ProductMaterialItem[]> {
  const [rows, usage] = await Promise.all([
    db.orm.public.ProductMaterial.orderBy([(m) => m.sortOrder.asc(), (m) => m.name.asc()]).all(),
    db.orm.public.Product.groupBy('material').aggregate((a) => ({ count: a.count() })),
  ])
  const counts = new Map(
    (usage as Array<{ material: string | null; count: number }>).map((u) => [(u.material ?? '').toLocaleLowerCase('tr-TR'), Number(u.count)])
  )
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description ?? null,
    sortOrder: m.sortOrder,
    productCount: counts.get(m.name.toLocaleLowerCase('tr-TR')) ?? 0,
  }))
}

async function findByName(name: string) {
  const all = await db.orm.public.ProductMaterial.select('id', 'name').all()
  return all.find((m) => m.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR')) ?? null
}

export async function createProductMaterial(
  input: { name: string; description?: string | null },
  adminEmail = 'system'
): Promise<ProductMaterialItem> {
  const name = cleanName(input.name)
  if (await findByName(name)) throw new MaterialValidationError(`'${name}' malzemesi zaten var.`)
  const last = await db.orm.public.ProductMaterial.orderBy((m) => m.sortOrder.desc()).first()
  const created = await db.orm.public.ProductMaterial.create({
    name,
    description: input.description?.trim() || null,
    sortOrder: (last?.sortOrder ?? 0) + 1,
  })
  await logAuditEvent({ action: 'MATERIAL_CREATED', entity: 'ProductMaterial', entityId: created.id, metadata: { name, adminEmail } })
  return { id: created.id, name, description: created.description ?? null, sortOrder: created.sortOrder, productCount: 0 }
}

export async function updateProductMaterial(
  id: string,
  input: { name?: string; description?: string | null },
  adminEmail = 'system'
): Promise<void> {
  const existing = await db.orm.public.ProductMaterial.where({ id }).first()
  if (!existing) throw new MaterialValidationError('Malzeme bulunamadı.')

  const fields: Record<string, unknown> = {}
  if (input.description !== undefined) fields.description = input.description?.trim() || null
  let renamedTo: string | null = null
  if (input.name !== undefined) {
    const name = cleanName(input.name)
    const clash = await findByName(name)
    if (clash && clash.id !== id) throw new MaterialValidationError(`'${name}' malzemesi zaten var.`)
    if (name !== existing.name) {
      fields.name = name
      renamedTo = name
    }
  }

  await db.transaction(async (tx) => {
    if (Object.keys(fields).length > 0) await tx.orm.public.ProductMaterial.where({ id }).update(fields as never)
    if (renamedTo) {
      await tx.execute(
        db.raw.sql`UPDATE products SET material = ${renamedTo}, updated_at = now() WHERE lower(material) = lower(${existing.name})`
          .affectedCount()
          .build()
      )
    }
  })
  if (renamedTo) invalidateCatalog()
  await logAuditEvent({ action: 'MATERIAL_UPDATED', entity: 'ProductMaterial', entityId: id, metadata: { ...input, adminEmail } })
}

/** A material still used by products cannot be deleted; move those products first. */
export async function deleteProductMaterial(id: string, adminEmail = 'system'): Promise<void> {
  const existing = await db.orm.public.ProductMaterial.where({ id }).first()
  if (!existing) throw new MaterialValidationError('Malzeme bulunamadı.')
  const used = (await listProductMaterials()).find((m) => m.id === id)?.productCount ?? 0
  if (used > 0) {
    throw new MaterialValidationError(`'${existing.name}' ${used} üründe kullanılıyor. Önce bu ürünlerin malzemesini değiştirin.`)
  }
  await db.orm.public.ProductMaterial.where({ id }).delete()
  await logAuditEvent({ action: 'MATERIAL_DELETED', entity: 'ProductMaterial', entityId: id, metadata: { name: existing.name, adminEmail } })
}
