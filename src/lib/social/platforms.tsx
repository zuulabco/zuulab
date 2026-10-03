/**
 * Social platforms the footer can link to, with their icons. Shared by the footer
 * and the admin page (Vitrin → Sosyal medya).
 */

export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'facebook'
  | 'pinterest'
  | 'linkedin'
  | 'threads'
  | 'whatsapp'

export interface SocialLink {
  id: string
  platform: SocialPlatform
  url: string
  active: boolean
}

export const SOCIAL_PLATFORMS: Record<SocialPlatform, { name: string; placeholder: string }> = {
  instagram: { name: 'Instagram', placeholder: 'https://instagram.com/zuulab' },
  tiktok: { name: 'TikTok', placeholder: 'https://tiktok.com/@zuulab' },
  youtube: { name: 'YouTube', placeholder: 'https://youtube.com/@zuulab' },
  x: { name: 'X (Twitter)', placeholder: 'https://x.com/zuulab' },
  facebook: { name: 'Facebook', placeholder: 'https://facebook.com/zuulab' },
  pinterest: { name: 'Pinterest', placeholder: 'https://pinterest.com/zuulab' },
  linkedin: { name: 'LinkedIn', placeholder: 'https://linkedin.com/company/zuulab' },
  threads: { name: 'Threads', placeholder: 'https://threads.net/@zuulab' },
  whatsapp: { name: 'WhatsApp', placeholder: 'https://wa.me/905xxxxxxxxx' },
}

export const DEFAULT_SOCIAL_LINKS: SocialLink[] = [
  { id: 'soc-instagram', platform: 'instagram', url: 'https://instagram.com/zuulab', active: true },
  { id: 'soc-x', platform: 'x', url: 'https://twitter.com/zuulab', active: true },
  { id: 'soc-youtube', platform: 'youtube', url: 'https://youtube.com/zuulab', active: true },
]

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export function SocialIcon({ platform, size = 18 }: { platform: SocialPlatform; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true }
  switch (platform) {
    case 'instagram':
      return (
        <svg {...common} {...stroke}>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
          <circle cx="12" cy="12" r="4.2" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      )
    case 'youtube':
      return (
        <svg {...common} {...stroke}>
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
          <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" />
        </svg>
      )
    case 'x':
      return (
        <svg {...common} fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      )
    case 'tiktok':
      return (
        <svg {...common} {...stroke}>
          <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 3c.4 2.6 2.2 4.4 5 4.7" />
        </svg>
      )
    case 'facebook':
      return (
        <svg {...common} {...stroke}>
          <path d="M15 3h-2.5A4.5 4.5 0 0 0 8 7.5V10H5.5v3.5H8V21h3.5v-7.5H14l.5-3.5h-3V7.8c0-.7.5-1.3 1.2-1.3H15z" />
        </svg>
      )
    case 'pinterest':
      return (
        <svg {...common} {...stroke}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M10.5 21l1.8-7.4M11 14.5c.5 1 1.4 1.5 2.5 1.5 2.3 0 3.8-2.2 3.8-4.8 0-2.8-2.3-4.7-5.2-4.7-3.3 0-5.3 2.3-5.3 4.8 0 1.2.5 2.3 1.4 2.8" />
        </svg>
      )
    case 'linkedin':
      return (
        <svg {...common} {...stroke}>
          <rect x="2.5" y="2.5" width="19" height="19" rx="3" />
          <path d="M7.5 10.5v6M7.5 7.5v.01M11 16.5v-6M11 13c0-1.6 1-2.6 2.5-2.6s2.5 1 2.5 2.6v3.5" />
        </svg>
      )
    case 'threads':
      return (
        <svg {...common} {...stroke}>
          <path d="M16.8 10.6c-.4-2.6-2.2-4-4.8-4-3.2 0-5.2 2.4-5.2 5.4s2 5.4 5.2 5.4c2.3 0 4-1.1 4.6-3 .7-2.3-.6-4.3-3.4-4.3-1.9 0-3 1-3 2.2 0 1.3 1 2 2.3 2 1.7 0 2.7-1.2 2.7-3.6" />
          <circle cx="12" cy="12" r="9.5" />
        </svg>
      )
    case 'whatsapp':
      return (
        <svg {...common} {...stroke}>
          <path d="M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.6z" />
          <path d="M9 8.8c0 3 2.2 5.6 5.4 6.2.6.1 1.3-.4 1.4-1l.1-.6-1.9-.8-.9.9c-1-.4-1.9-1.3-2.4-2.4l.9-.9-.8-1.9-.6.1c-.7.1-1.2.7-1.2 1.4z" />
        </svg>
      )
  }
}
