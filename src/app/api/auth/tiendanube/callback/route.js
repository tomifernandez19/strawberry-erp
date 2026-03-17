import { NextResponse } from 'next/server';

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    try {
        const response = await fetch('https://www.tiendanube.com/apps/authorize/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: process.env.TIENDANUBE_CLIENT_ID,
                client_secret: process.env.TIENDANUBE_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code
            })
        });

        const data = await response.json();

        return new NextResponse(`
            <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #000; color: #fff;">
                    <h1 style="color: #4ade80;">TOKEN GENERADO CON ÉXITO 🍓</h1>
                    <p>Copiá este código y pegalo en Vercel:</p>
                    <div style="background: #222; padding: 20px; border: 2px dashed #4ade80; font-family: monospace; font-size: 1.2rem; margin: 20px auto; max-width: 600px; word-break: break-all;">
                        ${data.access_token}
                    </div>
                </body>
            </html>
        `, { headers: { 'Content-Type': 'text/html' } });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
