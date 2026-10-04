import 'server-only'
import { cloudinaryCardLoader } from '@/lib/images/cloudinary-loader'

/**
 * Cloudinary renders each size/format of a photo the first time someone asks for
 * it, and the product photos' trim + smart crop + AVIF take ~1–2 s that first time
 * (then ~0.1 s from cache). Right after a product photo is uploaded we ask for the
 * sizes the shop actually uses, so no customer waits for that first rendering.
 */

/** Widths next/image picks for product cards, the gallery and its thumbnails (phones to 2x desktops) */
const PRODUCT_WIDTHS = [256, 384, 640, 750, 828, 1080, 1200, 1920, 2048]

/** f_auto renders AVIF or WebP depending on the browser, so both are prepared */
const ACCEPT_HEADERS = ['image/avif,image/webp,image/*,*/*;q=0.8', 'image/webp,image/*,*/*;q=0.8']

const CONCURRENCY = 4

export async function warmProductImage(url: string): Promise<{ warmed: number; failed: number }> {
  const jobs = PRODUCT_WIDTHS.flatMap((width) =>
    ACCEPT_HEADERS.map((accept) => ({ url: cloudinaryCardLoader({ src: url, width }), accept }))
  )
  let warmed = 0
  let failed = 0
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      try {
        const res = await fetch(job.url, { headers: { Accept: job.accept }, signal: AbortSignal.timeout(30_000) })
        await res.arrayBuffer()
        if (res.ok) warmed++
        else failed++
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return { warmed, failed }
}
