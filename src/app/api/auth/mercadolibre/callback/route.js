import { NextResponse } from 'next/server';
import { exchangeCodeForTokens, saveTokens } from '@/lib/mercadolibre';

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error || !code) {
        console.error('[ML OAuth] Error:', error);
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL || 'https://strawberry-trejo.vercel.app'}/gestion?ml_auth=error`
        );
    }

    try {
        const tokens = await exchangeCodeForTokens(code);
        await saveTokens({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            user_id: String(tokens.user_id),
        });
        console.log('[ML OAuth] Tokens saved for user:', tokens.user_id);
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL || 'https://strawberry-trejo.vercel.app'}/gestion?ml_auth=success`
        );
    } catch (e) {
        console.error('[ML OAuth] Token exchange failed:', e.message);
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL || 'https://strawberry-trejo.vercel.app'}/gestion?ml_auth=error`
        );
    }
}
