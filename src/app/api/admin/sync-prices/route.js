export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { syncProductToTiendanube } from '@/lib/actions';

const MODEL_IDS = [
    '5d035886-a01b-40ab-9026-9328676e3d69', // TAIPEI ECOCUERO (viejo)
    'b480384f-096e-4f63-a806-49df43ebb28e', // TAIPEI ECOCUERO (nuevo)
    '954b1e6c-2701-413a-a9a4-be361b442ede', // TAIPEI GZA
    'fc0ea6b3-4739-4bab-a218-9ebb41bbd9bf', // TORONTO ECOCUERO (viejo)
    '9891ab15-1877-4ff4-bc71-10c9b358cc13', // TORONTO ECOCUERO (nuevo)
    'c459eb5c-715a-40cc-a9f7-d3a3edb01b25', // TORONTO GZA
    '6c574f46-1c2b-4e40-9ad8-38de6442bff2', // URSULA ECOCUERO
    'e8b7c04e-608c-440b-a060-3fd77d510145', // URSULA GZA
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
