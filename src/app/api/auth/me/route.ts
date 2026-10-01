import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth.service'

export async function GET(request: Request) {
  try {
    const user = await authenticateRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Oturum açılmamış.' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      user,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Kullanıcı bilgisi alınamadı.' },
      { status: 500 }
    )
  }
}
