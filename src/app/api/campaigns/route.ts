import { NextResponse } from 'next/server'
import { getPublicCampaigns } from '@/lib/services/campaigns.service'

export const dynamic = 'force-dynamic'

/** Campaigns the storefront announces (pop-up or ribbon) right now */
export async function GET() {
  try {
    const campaigns = await getPublicCampaigns()
    return NextResponse.json(
      { success: true, campaigns },
      { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('[campaigns] public list failed:', error)
    return NextResponse.json({ success: true, campaigns: [] })
  }
}
