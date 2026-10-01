import { NextResponse } from 'next/server'

export async function GET(request) {
    const { searchParams } = new URL(request.url)
    const cuenta = searchParams.get('cuenta') || 'TOMI'

    const clientId = process.env.ML_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://strawberry-erp.vercel.app'}/api/mp-callback`

    const authUrl = `https://auth.mercadopago.com.ar/authorization?client_id=${clientId}&response_type=code&platform_id=mp&redirect_uri=${encodeURIComponent(redirectUri)}&state=${cuenta}`

    return NextResponse.redirect(authUrl)
}
