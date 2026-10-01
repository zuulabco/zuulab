import { NextResponse } from 'next/server'
import { getPublishedAnnouncements } from '@/lib/services/cms.service'

export async function GET() {
  try {
    const announcements = await getPublishedAnnouncements()
    return NextResponse.json({
      success: true,
      announcements,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, announcements: [] },
      { status: 200 }
    )
  }
}
