import 'server-only'

// Re-export the Prisma 8 database client.
// Usage: import { db } from '@/lib/db'
// Then: const users = await db.orm.public.User.where({ isActive: true }).all()
export { db } from '@/prisma/db'
