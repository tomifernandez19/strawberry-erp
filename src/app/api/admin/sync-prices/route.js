export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

const TO_RENAME = [
    { id: 338013478, name: 'TAIPEI ECOCUERO' },
    { id: 343276278, name: 'TORONTO ECOCUERO' },
    { id: 368209391, name: 'URSULA ECOCUERO' },
];

const TO_DELETE = [368338628, 368338669, 368338682, 368209392, 368338703];

export async function GET() {
    const storeId = process.env.TIENDANUBE_STORE_ID;
    const token = process.env.TIENDANUBE_ACCESS_TOKEN;
    const headers = { 'Authentication': `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'StrawberryERP/1.0' };

    const results = { renamed: [], deleted: [] };

    for (const { id, name } of TO_RENAME) {
        const res = await fetch(`https://api.tiendanube.com/v1/${storeId}/products/${id}`, {
            method: 'PUT', headers,
            body: JSON.stringify({ name: { es: name } })
        });
        results.renamed.push({ id, name, ok: res.ok, status: res.status });
    }

    for (const id of TO_DELETE) {
        const res = await fetch(`https://api.tiendanube.com/v1/${storeId}/products/${id}`, {
            method: 'DELETE', headers
        });
        results.deleted.push({ id, ok: res.ok, status: res.status });
    }

    return NextResponse.json(results);
}
