export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

const NAMES = ['TAIPEI', 'TAIPEI ECOCUERO', 'TORONTO', 'TORONTO ECOCUERO', 'URSULA', 'URSULA ECOCUERO'];

export async function GET() {
    const storeId = process.env.TIENDANUBE_STORE_ID;
    const token = process.env.TIENDANUBE_ACCESS_TOKEN;
    const headers = { 'Authentication': `bearer ${token}`, 'User-Agent': 'StrawberryERP/1.0' };

    const results = [];
    for (const name of NAMES) {
        const res = await fetch(`https://api.tiendanube.com/v1/${storeId}/products?q=${encodeURIComponent(name)}&per_page=10`, { headers });
        const data = await res.json();
        const matches = Array.isArray(data) ? data.filter(p => p.name?.es?.toUpperCase().includes(name)) : [];
        results.push({ search: name, matches: matches.map(p => ({ id: p.id, name: p.name?.es, images: p.images?.length, description: !!p.description?.es })) });
    }

    return NextResponse.json(results);
}
