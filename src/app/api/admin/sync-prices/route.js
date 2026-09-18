export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { syncProductToTiendanube } from '@/lib/actions';

const MODEL_IDS = [
    'b480384f-096e-4f63-a806-49df43ebb28e', // TAIPEI ECOCUERO (nueva temporada)
    '9891ab15-1877-4ff4-bc71-10c9b358cc13', // TORONTO ECOCUERO (nueva temporada)
    '33a6e18e-2053-4105-ba6d-141424dbf15f', // VARSOVIA GZA (429 pendiente)
    '13d87812-5f9b-4a1d-953c-981ca95339f7', // VERACRUZ (429 pendiente)
];

export async function GET() {
    const results = [];
    for (const modelId of MODEL_IDS) {
        try {
            const res = await syncProductToTiendanube(modelId);
            results.push({ modelId, success: res.success, msg: res.message });
        } catch (e) {
            results.push({ modelId, success: false, msg: e.message });
        }
    }
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    return NextResponse.json({ ok, fail, results });
}
