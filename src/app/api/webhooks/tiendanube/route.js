import { NextResponse } from 'next/server';
import { recordOnlineOrder } from '@/lib/actions';

export async function POST(req) {
    try {
        const body = await req.json();
        console.log('Tiendanube Webhook received:', body);

        // 1. Verify it's an order creation event
        if (body.event === 'order/created') {
            const orderId = body.id;
            const storeId = body.store_id;

            // 2. Fetch full order details from Tiendanube
            // Note: In production, these should be environment variables
            const accessToken = process.env.TIENDANUBE_ACCESS_TOKEN;

            const response = await fetch(`https://api.tiendanube.com/v1/${storeId}/orders/${orderId}`, {
                headers: {
                    'Authentication': `bearer ${accessToken}`,
                    'User-Agent': 'Strawberry ERP (tomas@example.com)' // Replace with real email
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch order from Tiendanube: ${response.statusText}`);
            }

            const orderData = await response.json();

            // 3. Process the order in our ERP
            // We map Tiendanube structure to our internal structure
            const internalOrder = {
                id: orderData.id,
                number: orderData.number,
                customer: {
                    name: `${orderData.customer.name}`,
                    email: orderData.customer.email
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
