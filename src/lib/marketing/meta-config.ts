/**
 * Meta settings, read from the server environment. The Pixel ID is not a secret but it
 * is read here (not NEXT_PUBLIC_) and handed to the browser by the store layout, so one
 * variable serves both the Pixel and the Conversions API.
 *
 *   META_PIXEL_ID                 the pixel / dataset id
 *   META_CAPI_ACCESS_TOKEN        Conversions API token (secret, server only)
 *   META_CAPI_TEST_EVENT_CODE     optional; while set, server events show only in Events
 *                                 Manager → Test Events and do not count for ads. Remove it
 *                                 from production once the check is done.
 *   META_GRAPH_VERSION            optional Graph API version (default below)
 */

export const DEFAULT_GRAPH_VERSION = 'v23.0'

function clean(value: string | undefined): string {
  return (value ?? '').trim().replace(/^["']+|["']+$/g, '').trim()
}

export function getMetaPixelId(): string {
  const id = clean(process.env.META_PIXEL_ID)
  return /^\d{5,20}$/.test(id) ? id : ''
}

export interface MetaCapiConfig {
  pixelId: string
  accessToken: string
  testEventCode?: string
  graphVersion: string
}

/** The Conversions API settings, or null when the pixel id or the token is missing */
export function getMetaCapiConfig(): MetaCapiConfig | null {
  const pixelId = getMetaPixelId()
  const accessToken = clean(process.env.META_CAPI_ACCESS_TOKEN)
  if (!pixelId || !accessToken) return null
  const testEventCode = clean(process.env.META_CAPI_TEST_EVENT_CODE)
  return {
    pixelId,
    accessToken,
    ...(testEventCode ? { testEventCode } : {}),
    graphVersion: clean(process.env.META_GRAPH_VERSION) || DEFAULT_GRAPH_VERSION,
  }
}
