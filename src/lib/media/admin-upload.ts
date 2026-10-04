'use client'

/**
 * Uploads one image from the admin panel. The file goes straight from the browser
 * to Cloudinary with a signature from /api/admin/media/sign, because Vercel rejects
 * requests to our own server above ~4.5 MB (413). Photos above Cloudinary's 10 MB
 * image limit are first scaled down in the browser (WebP keeps transparency), and
 * Cloudinary stores every photo as WebP, at most 2560 px on its longest side.
 * Without Cloudinary credentials (local development) the old server upload is used.
 *
 * Throws an Error with a Turkish message the caller can show as is.
 */

export interface UploadedImage {
  url: string
  width: number | null
  height: number | null
  bytes: number
}

/** Cloudinary's per-image limit on the free plan is 10 MB; stay safely under it */
const CLOUDINARY_SAFE_BYTES = 9.5 * 1024 * 1024
/** Longest side after shrinking: far above what any page shows */
const SHRINK_MAX_SIDE = 4000

export interface UploadOptions {
  /** Product photos: the shop's sizes are rendered right after upload, so pages open fast */
  usage?: 'product'
}

export async function uploadAdminImage(file: File, token: string | null, options: UploadOptions = {}): Promise<UploadedImage> {
  const auth = { Authorization: `Bearer ${token}` }
  const upload = file.size > CLOUDINARY_SAFE_BYTES ? await shrink(file) : file

  const signRes = await fetch('/api/admin/media/sign', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileType: upload.type, fileSize: upload.size }),
  })
  const sign = await signRes.json().catch(() => ({}))
  if (!signRes.ok || !sign.success) throw new Error(sign.error || 'Yükleme izni alınamadı.')

  if (!sign.direct) return uploadThroughServer(upload, token)

  const form = new FormData()
  form.append('file', upload)
  form.append('api_key', sign.apiKey)
  form.append('timestamp', String(sign.timestamp))
  form.append('folder', sign.folder)
  form.append('allowed_formats', sign.allowedFormats)
  // Signed: Cloudinary stores photos as WebP, scaled down (see /api/admin/media/sign)
  if (sign.format) form.append('format', sign.format)
  if (sign.transformation) form.append('transformation', sign.transformation)
  form.append('signature', sign.signature)
  let res: Response
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, { method: 'POST', body: form })
  } catch {
    throw new Error(`${file.name} yüklenirken bağlantı hatası oluştu.`)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.secure_url) {
    throw new Error(`${file.name} yüklenemedi: ${data.error?.message || `Cloudinary hatası (${res.status})`}`)
  }

  const result: UploadedImage = {
    url: data.secure_url,
    width: data.width ?? null,
    height: data.height ?? null,
    bytes: data.bytes ?? upload.size,
  }
  // Media library entry; the upload itself already succeeded, so a failure here is not fatal
  await fetch('/api/admin/media/register', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: result.url, name: file.name, bytes: result.bytes, type: data.format ? `image/${data.format}` : upload.type, width: result.width, height: result.height, usage: options.usage }),
  }).catch(() => {})
  return result
}

async function uploadThroughServer(file: File, token: string | null): Promise<UploadedImage> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/admin/media/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  const d = await res.json().catch(() => ({}))
  if (!d.success || !d.url) throw new Error(d.error || `${file.name} yüklenemedi.`)
  return { url: d.url, width: d.width ?? null, height: d.height ?? null, bytes: d.bytes ?? file.size }
}

/**
 * Re-encodes a too-large photo as WebP (transparency kept): first at most
 * SHRINK_MAX_SIDE px on its longest side, then smaller sizes and lower quality
 * until it fits under Cloudinary's limit.
 */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  const longest = Math.max(bitmap.width, bitmap.height)
  try {
    for (const side of [SHRINK_MAX_SIDE, 3000, 2400]) {
      const scale = Math.min(1, side / longest)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.92, 0.85]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
        if (blob && blob.size <= CLOUDINARY_SAFE_BYTES) {
          return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
        }
      }
    }
  } finally {
    bitmap.close()
  }
  throw new Error(`${file.name} çok büyük; küçültülse bile 10 MB altına inmiyor.`)
}
