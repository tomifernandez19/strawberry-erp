import { NextResponse } from 'next/server';
import { recordMLOrder } from '@/lib/actions';
import { mlFetch } from '@/lib/mercadolibre';

export async function POST(req) {
    try {
        const body = await req.json();
        console.log('[ML Webhook] Received:', JSON.stringify(body));

        // ML sends notifications for different topics
        const { topic, resource } = body;

        if (topic === 'orders_v2' && resource) {
            // Fetch full order from ML API
            const orderId = resource.replace('/orders/', '').split('/')[0];
            const order = await mlFetch(`/orders/${orderId}`);

            console.log('[ML Webhook] Order status:', order.status);

            // Only process paid orders
            if (order.status === 'paid') {
                await recordMLOrder(order);
            }
        }

        return NextResponse.json({ status: 'ok' });
    } catch (e) {
        console.error('[ML Webhook] Error:', e.message);
        // Always return 200 to ML so it doesn't retry indefinitely
        return NextResponse.json({ status: 'ok' });
    }
}
