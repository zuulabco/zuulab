import 'server-only'
import { isCloudinaryUrl } from './cloudinary-loader'

/**
 * Tiny inline previews for blur-up image loading. The server fetches a ~16px copy
 * of the photo and embeds it in the HTML as a data URL, so the first paint shows
 * a blurred version of the real picture instead of an empty (or darkened) frame,
 * and the full image fades in over it.
 */

const UPLOAD = '/image/upload/'

/** A ~16px JPEG of the photo, from hosts that resize on the fly; null elsewhere. */
function tinyUrl(src: string): string | null {
  if (isCloudinaryUrl(src)) {
    const at = src.indexOf(UPLOAD) + UPLOAD.length
    return `${src.slice(0, at)}c_limit,w_16,q_30,f_jpg/${src.slice(at)}`
  }
  try {
    const url = new URL(src)
    if (url.hostname === 'images.unsplash.com') {
      url.searchParams.delete('auto')
      url.searchParams.set('w', '16')
      url.searchParams.set('q', '30')
      url.searchParams.set('fm', 'jpg')
      return url.toString()
    }
  } catch {
    // not an absolute URL
  }
  return null
}

/** data: URL of the tiny preview, or undefined when it cannot be made quickly. */
export async function blurDataUrl(src: string | null | undefined): Promise<string | undefined> {
  const tiny = src ? tinyUrl(src) : null
  if (!tiny) return undefined
  try {
    const res = await fetch(tiny, { signal: AbortSignal.timeout(3000), next: { revalidate: 86400 } })
    if (!res.ok) return undefined
    const type = res.headers.get('content-type') || 'image/jpeg'
    const bytes = Buffer.from(await res.arrayBuffer())
    // A preview is a few hundred bytes; anything big is not worth inlining.
    if (bytes.length > 6000) return undefined
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    return undefined
  }
}
