import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The shared social card (1200×630) for pages without a photo of their own:
 * the home page, listings and the content pages. Built once at deploy time.
 */
export const dynamic = 'force-static'

const fontDir = join(process.cwd(), 'src/assets/fonts')
const [regular, bold] = await Promise.all([
  readFile(join(fontDir, 'DMSans-400.ttf')),
  readFile(join(fontDir, 'DMSans-700.ttf')),
])

const BLUE = '#0080C4'
const YELLOW = '#FEC80F'
const INK = '#141414'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#FAFAF7',
          color: INK,
          fontFamily: 'DM Sans',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 104, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>zuulab</span>
          <span style={{ width: 22, height: 22, borderRadius: 11, background: BLUE, marginLeft: 8, marginBottom: 14 }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 900 }}>
            3D baskı tasarım objeleri, lambalar ve oyuncaklar
          </span>
          <span style={{ fontSize: 30, marginTop: 24, color: '#555' }}>
            zuukids · zuulife · zuulight · zuutoptan
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 28, color: '#555' }}>www.zuulab.com</span>
          <div style={{ display: 'flex' }}>
            <span style={{ width: 120, height: 12, background: BLUE }} />
            <span style={{ width: 60, height: 12, background: YELLOW }} />
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'DM Sans', data: regular, weight: 400, style: 'normal' },
        { name: 'DM Sans', data: bold, weight: 700, style: 'normal' },
      ],
    }
  )
}
