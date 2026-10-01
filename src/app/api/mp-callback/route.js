import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function GET(request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const cuenta = searchParams.get('state') // we pass cuenta in state param

    if (!code) {
        return NextResponse.redirect(new URL('/gestion?mp_error=no_code', request.url))
    }

    try {
        const clientId = process.env.ML_CLIENT_ID
        const clientSecret = process.env.ML_CLIENT_SECRET
        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://strawberry-erp.vercel.app'}/api/mp-callback`

        const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            })
        })

        const tokenData = await tokenRes.json()

        if (!tokenData.access_token) {
            console.error('[MP OAuth] Token exchange failed:', tokenData)
            return NextResponse.redirect(new URL('/gestion?mp_error=token_failed', request.url))
        }

        const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000)

        await supabaseAdmin.from('mp_tokens').upsert({
            cuenta: cuenta || 'TOMI',
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'cuenta' })

        return NextResponse.redirect(new URL('/gestion?mp_connected=1', request.url))
    } catch (e) {
        console.error('[MP OAuth] Error:', e)
        return NextResponse.redirect(new URL('/gestion?mp_error=exception', request.url))
    }
}
