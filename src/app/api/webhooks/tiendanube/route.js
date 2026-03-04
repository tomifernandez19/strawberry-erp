import { NextResponse } from 'next/server';
import { recordOnlineOrder } from '@/lib/actions';

export async function POST(req) {
    try {
        const body = await req.json();
        const headers = Object.fromEntries(req.headers);

        console.log('--- Tiendanube Webhook Received ---');
        const event = body.event || headers['x-linkedstore-event'];
        console.log('Event:', event);
        console.log('Body:', JSON.stringify(body, null, 2));

        // 1. Verify it's an order creation event
        if (event === 'order/created') {
            const orderId = body.id;
            const storeId = body.store_id;
            const accessToken = process.env.TIENDANUBE_ACCESS_TOKEN;

            if (!accessToken) {
                console.error('TIENDANUBE_ACCESS_TOKEN is not set');
                return NextResponse.json({ error: 'Config error' }, { status: 500 });
            }

            // 2. Fetch full order details from Tiendanube
            const response = await fetch(`https://api.tiendanube.com/v1/${storeId}/orders/${orderId}`, {
                headers: {
                    'Authentication': `bearer ${accessToken}`,
                    'User-Agent': 'Strawberry ERP (fernandezdemaussiontomas@gmail.com)'
                }
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('Tiendanube API Error:', errText);
                throw new Error(`Failed to fetch order: ${response.statusText}`);
            }

            const orderData = await response.json();

            // 3. Process the order in our ERP
            const internalOrder = {
                id: orderData.id,
                number: orderData.number,
                customer: {
                    name: orderData.customer?.name || 'Cliente Online',
                    email: orderData.customer?.email
                },
                products: orderData.products.map(p => ({
                    name: p.name,
                    variant_values: p.variant_values, // e.g. ["Blanco", "38"]
                    sku: p.sku,
                    price: p.price
                }))
            };

            await recordOnlineOrder(internalOrder);
        }

        return NextResponse.json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
