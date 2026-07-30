import { createClient } from '@/lib/supabase/server';

const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
const ML_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || 'https://strawberry-trejo.vercel.app'}/api/auth/mercadolibre/callback`;

export function getMlAuthUrl() {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: ML_CLIENT_ID,
        redirect_uri: ML_REDIRECT_URI,
    });
    return `https://auth.mercadolibre.com.ar/authorization?${params}`;
}

export async function exchangeCodeForTokens(code) {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: ML_CLIENT_ID,
            client_secret: ML_CLIENT_SECRET,
            code,
            redirect_uri: ML_REDIRECT_URI,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`ML token exchange failed: ${err}`);
    }
    return res.json();
}

async function refreshAccessToken(refreshToken) {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: ML_CLIENT_ID,
            client_secret: ML_CLIENT_SECRET,
            refresh_token: refreshToken,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`ML token refresh failed: ${err}`);
    }
    return res.json();
}

export async function saveTokens({ access_token, refresh_token, expires_in, user_id }) {
    const supabase = createClient();
    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();
    const { error } = await supabase
        .from('mercadolibre_tokens')
        .upsert({ id: 1, access_token, refresh_token, expires_at, user_id, updated_at: new Date().toISOString() });
    if (error) throw error;
}

// Returns a valid access token, refreshing if necessary
export async function getValidAccessToken() {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('mercadolibre_tokens')
        .select('*')
        .eq('id', 1)
        .single();

    if (error || !data) throw new Error('MercadoLibre no está conectado. Autorizá la app desde Gestionar.');

    // Refresh if expires in less than 10 minutes
    const expiresAt = new Date(data.expires_at).getTime();
    if (Date.now() > expiresAt - 10 * 60 * 1000) {
        const tokens = await refreshAccessToken(data.refresh_token);
        await saveTokens({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            user_id: data.user_id,
        });
        return tokens.access_token;
    }

    return data.access_token;
}

export async function mlFetch(path, options = {}) {
    const token = await getValidAccessToken();
    // Some endpoints (e.g. /pictures) require the token as a query param
    const url = options.useQueryToken
        ? `https://api.mercadolibre.com${path}?access_token=${token}`
        : `https://api.mercadolibre.com${path}`;
    const { useQueryToken, ...fetchOptions } = options;
    const res = await fetch(url, {
        ...fetchOptions,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(fetchOptions.headers || {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`ML API error ${res.status} on ${path}: ${err}`);
    }
    return res.json();
}
