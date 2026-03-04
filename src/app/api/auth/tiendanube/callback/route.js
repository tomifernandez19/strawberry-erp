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

        // En una app multi-tienda, aquí guardaríamos el data.access_token en la DB.
        // Como esta es para vos solo, te voy a mostrar el token en pantalla para que lo guardes en Vercel.

        return new NextResponse(`
            <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #121212; color: white;">
                    <h1 style="color: #4ade80;">¡Conexión Exitosa con Tiendanube! 🍓</h1>
                    <p>Copiá este Access Token y pegalo en Vercel como <b>TIENDANUBE_ACCESS_TOKEN</b>:</p>
                    <code style="background: #333; padding: 10px; border-radius: 5px; display: block; word-break: break-all; margin: 20px 0;">
                        ${data.access_token}
                    </code>
                    <p style="opacity: 0.6;">Una vez que lo guardes en Vercel, el ERP ya podrá recibir tus pedidos.</p>
                </body>
            </html>
        `, { headers: { 'Content-Type': 'text/html' } });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
