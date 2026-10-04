import 'server-only'
import crypto from 'crypto'

export interface MediaUploadOptions {
  fileName: string
  fileType: string
  fileSize: number // bytes
  fileBuffer?: Buffer
  folder?: string
}

export interface MediaUploadResult {
  success: boolean
  url?: string
  publicId?: string
  width?: number
  height?: number
  format?: string
  sizeBytes?: number
  error?: string
  isSimulated?: boolean
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB, for uploads that pass through our server

/**
 * Direct browser uploads (signUpload) skip our server, so Vercel's ~4.5 MB request
 * limit does not apply. The browser shrinks anything over Cloudinary's 10 MB image
 * limit first (lib/media/admin-upload); this is the ceiling for what it may send.
 */
export const MAX_DIRECT_UPLOAD_BYTES = 20 * 1024 * 1024

/** Formats Cloudinary accepts for a signed direct upload */
const DIRECT_UPLOAD_FORMATS = 'jpg,jpeg,png,webp,gif,svg,avif'

/**
 * Longest side a stored photo keeps. The site's largest images (product page main
 * photo at 55vw, full-width banners) need about this much on retina screens; the
 * many-megapixel originals cameras and design tools export only made Cloudinary's
 * first rendering of every size slow (≈1–2 s on a 17 MP PNG vs ≈0.3 s at this size).
 */
export const STORED_IMAGE_MAX_SIDE = 2560

/**
 * Applied by Cloudinary while it stores a raster upload (an incoming
 * transformation): scaled down to STORED_IMAGE_MAX_SIDE, never up, at a visually
 * lossless quality, then saved as WebP. One lossy encode, from the original.
 */
const STORED_IMAGE_TRANSFORMATION = `c_limit,h_${STORED_IMAGE_MAX_SIDE},w_${STORED_IMAGE_MAX_SIDE},q_auto:best,f_webp`

export interface SignedUpload {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  allowedFormats: string
  /** Set for raster images: stored as WebP, scaled by `transformation` */
  format?: 'webp'
  transformation?: string
  signature: string
}

export class CloudinaryService {
  private cloudName: string
  private apiKey: string
  private apiSecret: string
  private isConfigured: boolean

  constructor() {
    this.cloudName = process.env.CLOUDINARY_CLOUD_NAME || ''
    this.apiKey = process.env.CLOUDINARY_API_KEY || ''
    this.apiSecret = process.env.CLOUDINARY_API_SECRET || ''

    this.isConfigured = Boolean(
      this.cloudName &&
      this.apiKey &&
      this.apiSecret &&
      !this.apiKey.includes('12345')
    )
  }

  get isLiveConfigured(): boolean {
    return this.isConfigured
  }

  /** Makes an authenticated read, so wrong keys are caught before any upload. */
  async checkConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured) return { ok: false, error: 'Cloudinary yapılandırılmamış (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET).' }
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/usage`, {
        headers: { Authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) return { ok: true }
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      return { ok: false, error: `Cloudinary bilgileri geçersiz (${res.status}${data.error?.message ? `: ${data.error.message}` : ''}).` }
    } catch (err) {
      return { ok: false, error: `Cloudinary'ye ulaşılamadı: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  /**
   * Copies an image from a public URL into Cloudinary (Cloudinary fetches it). Never
   * simulated: without live credentials it fails, so callers can tell.
   */
  async uploadRemoteImage(sourceUrl: string, folder = 'zuulab-products'): Promise<MediaUploadResult> {
    if (!this.isConfigured) return { success: false, error: 'Cloudinary yapılandırılmamış.' }
    const timestamp = Math.round(Date.now() / 1000)
    const signature = crypto
      .createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${this.apiSecret}`)
      .digest('hex')
    const form = new FormData()
    form.append('file', sourceUrl)
    form.append('api_key', this.apiKey)
    form.append('timestamp', String(timestamp))
    form.append('folder', folder)
    form.append('signature', signature)
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30_000),
      })
      const data = (await res.json()) as { secure_url?: string; public_id?: string; error?: { message?: string } }
      if (res.ok && data.secure_url) return { success: true, url: data.secure_url, publicId: data.public_id }
      return { success: false, error: data.error?.message || `Cloudinary hatası (${res.status}).` }
    } catch (err) {
      return { success: false, error: `Cloudinary bağlantı hatası: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  /**
   * Signature for one direct upload from the admin's browser to Cloudinary: the file
   * never passes through our server. Valid for Cloudinary's one-hour window, only for
   * this folder and image formats. With `optimize` (every raster image) Cloudinary
   * stores it as WebP scaled to STORED_IMAGE_MAX_SIDE; SVG and GIF (vector,
   * animation) are kept as they are. Null when Cloudinary is not configured.
   */
  signUpload(folder = 'zuulab-products', options: { optimize?: boolean } = {}): SignedUpload | null {
    if (!this.isConfigured) return null
    const timestamp = Math.round(Date.now() / 1000)
    const params: Record<string, string> = {
      allowed_formats: DIRECT_UPLOAD_FORMATS,
      folder,
      timestamp: String(timestamp),
      ...(options.optimize ? { format: 'webp', transformation: STORED_IMAGE_TRANSFORMATION } : {}),
    }
    // Cloudinary signs the parameters sorted by name, joined with &, plus the secret
    const toSign = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&')
    const signature = crypto.createHash('sha1').update(toSign + this.apiSecret).digest('hex')
    return {
      cloudName: this.cloudName,
      apiKey: this.apiKey,
      timestamp,
      folder,
      allowedFormats: DIRECT_UPLOAD_FORMATS,
      ...(options.optimize ? { format: 'webp' as const, transformation: STORED_IMAGE_TRANSFORMATION } : {}),
      signature,
    }
  }

  /** True for an image this account serves: res.cloudinary.com/<our cloud>/image/upload/… */
  isOwnAssetUrl(url: string): boolean {
    return Boolean(this.cloudName) && url.startsWith(`https://res.cloudinary.com/${this.cloudName}/image/upload/`)
  }

  /**
   * Validates file upload parameters (MIME type and size limit)
   */
  validateFile(fileType: string, sizeBytes: number, maxBytes = MAX_FILE_SIZE_BYTES): { valid: boolean; error?: string } {
    if (!fileType || !ALLOWED_MIME_TYPES.includes(fileType.toLowerCase())) {
      return {
        valid: false,
        error: `INVALID_FILE_TYPE: Desteklenmeyen dosya türü (${fileType}). Yalnızca JPEG, PNG, WebP, GIF veya SVG kabul edilir.`,
      }
    }

    if (sizeBytes > maxBytes) {
      return {
        valid: false,
        error: `Dosya çok büyük (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB). En fazla ${Math.round(maxBytes / (1024 * 1024))} MB yüklenebilir.`,
      }
    }

    return { valid: true }
  }

  /**
   * Uploads an image to Cloudinary (or returns simulated CDN asset if credentials not set)
   */
  async uploadImage(options: MediaUploadOptions): Promise<MediaUploadResult> {
    const validation = this.validateFile(options.fileType, options.fileSize)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      }
    }

    // If live Cloudinary credentials are set and fileBuffer exists, call real Cloudinary API
    if (this.isConfigured && options.fileBuffer) {
      try {
        const timestamp = Math.round(Date.now() / 1000)
        const folder = options.folder || 'zuulab-products'
        const signaturePayload = `folder=${folder}&timestamp=${timestamp}${this.apiSecret}`
        const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex')

        const formData = new FormData()
        const blob = new Blob([new Uint8Array(options.fileBuffer)], { type: options.fileType })
        formData.append('file', blob, options.fileName)
        formData.append('api_key', this.apiKey)
        formData.append('timestamp', String(timestamp))
        formData.append('folder', folder)
        formData.append('signature', signature)

        const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`, {
          method: 'POST',
          body: formData,
        })

        const data = (await res.json()) as any
        if (res.ok && data.secure_url) {
          return {
            success: true,
            url: data.secure_url,
            publicId: data.public_id,
            width: data.width,
            height: data.height,
            format: data.format,
            sizeBytes: data.bytes,
            isSimulated: false,
          }
        } else {
          return {
            success: false,
            error: data.error?.message || 'Cloudinary API yükleme hatası.',
          }
        }
      } catch (err: any) {
        return {
          success: false,
          error: `Cloudinary bağlantı hatası: ${err.message}`,
        }
      }
    }

    // No fake URLs: an image that was not stored must not look uploaded.
    return {
      success: false,
      error: this.isConfigured
        ? 'Dosya içeriği alınamadı.'
        : 'Görsel depolama (Cloudinary) yapılandırılmamış; görsel yüklenemedi.',
    }
  }
}

export const cloudinaryService = new CloudinaryService()
