import crypto from 'crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
process.env.CLOUDINARY_CLOUD_NAME = 'testcloud'
process.env.CLOUDINARY_API_KEY = '999888777'
process.env.CLOUDINARY_API_SECRET = 'shh'

const { CloudinaryService, STORED_IMAGE_MAX_SIDE } = await import('@/lib/services/media/cloudinary.service')
const service = new CloudinaryService()

const expected = (params: Record<string, string>) =>
  crypto
    .createHash('sha1')
    .update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&') + 'shh')
    .digest('hex')

describe('signed direct uploads', () => {
  it('stores photos as WebP, scaled to the max side, with every parameter signed', () => {
    const s = service.signUpload('zuulab-products', { optimize: true })!
    expect(s.format).toBe('webp')
    expect(s.transformation).toBe(`c_limit,h_${STORED_IMAGE_MAX_SIDE},w_${STORED_IMAGE_MAX_SIDE},q_auto:best,f_webp`)
    expect(s.signature).toBe(
      expected({ allowed_formats: s.allowedFormats, folder: 'zuulab-products', format: 'webp', timestamp: String(s.timestamp), transformation: s.transformation! })
    )
  })

  it('keeps vector and animated files as uploaded', () => {
    const s = service.signUpload('zuulab-products')!
    expect(s.format).toBeUndefined()
    expect(s.transformation).toBeUndefined()
    expect(s.signature).toBe(expected({ allowed_formats: s.allowedFormats, folder: 'zuulab-products', timestamp: String(s.timestamp) }))
  })

  it('accepts only this account\'s Cloudinary images in the media library', () => {
    expect(service.isOwnAssetUrl('https://res.cloudinary.com/testcloud/image/upload/v1/a.webp')).toBe(true)
    expect(service.isOwnAssetUrl('https://res.cloudinary.com/other/image/upload/v1/a.webp')).toBe(false)
    expect(service.isOwnAssetUrl('https://evil.test/testcloud/image/upload/a.webp')).toBe(false)
  })
})
