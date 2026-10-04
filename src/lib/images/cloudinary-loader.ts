import type { ImageLoaderProps } from 'next/image'

/**
 * next/image loaders for photos stored on Cloudinary. Cloudinary resizes and picks
 * WebP/AVIF itself, so these images skip Vercel's optimizer.
 */

const UPLOAD = '/image/upload/'

export function isCloudinaryUrl(src: string | undefined | null): src is string {
  return Boolean(src && src.startsWith('https://res.cloudinary.com/') && src.includes(UPLOAD))
}

function withTransformation(src: string, transformation: string): string {
  const at = src.indexOf(UPLOAD) + UPLOAD.length
  return `${src.slice(0, at)}${transformation}/${src.slice(at)}`
}

/**
 * Product cards (3:4). Many marketplace photos come with a white frame baked in;
 * e_trim cuts uniform borders first, so every card is filled edge to edge, then
 * the image is cropped to the card around its most important area.
 */
export function cloudinaryCardLoader({ src, width, quality }: ImageLoaderProps): string {
  return withTransformation(src, `e_trim:10/c_fill,g_auto,ar_3:4,w_${width},q_${quality ?? 'auto'},f_auto`)
}

/** Any other photo: resize only, never crop or upscale. */
export function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  return withTransformation(src, `c_limit,w_${width},q_${quality ?? 'auto'},f_auto`)
}

/** Featured product photo (4:5): trims a baked-in white frame, then fills the frame */
export function cloudinaryFeatureLoader({ src, width, quality }: ImageLoaderProps): string {
  return withTransformation(src, `e_trim:10/c_fill,g_auto,ar_4:5,w_${width},q_${quality ?? 'auto'},f_auto`)
}

/**
 * Full-width banners: Cloudinary picks the format and a good automatic quality
 * (visually lossless at banner sizes, much lighter than :best); never upscaled
 * and never re-encoded a second time by the Next image optimizer.
 */
export function cloudinaryHeroLoader({ src, width }: ImageLoaderProps): string {
  return withTransformation(src, `c_limit,w_${width},q_auto:good,f_auto`)
}
