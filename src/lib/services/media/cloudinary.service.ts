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

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

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
   * Validates file upload parameters (MIME type and size limit)
   */
  validateFile(fileType: string, sizeBytes: number): { valid: boolean; error?: string } {
    if (!fileType || !ALLOWED_MIME_TYPES.includes(fileType.toLowerCase())) {
      return {
        valid: false,
        error: `INVALID_FILE_TYPE: Desteklenmeyen dosya türü (${fileType}). Yalnızca JPEG, PNG, WebP, GIF veya SVG kabul edilir.`,
      }
    }

    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `FILE_SIZE_EXCEEDED: Dosya boyutu sınırı aşıldı (Azami 5 MB, Yüklenen: ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB).`,
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
