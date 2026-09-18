import { NextResponse } from 'next/server';
import { syncProductToTiendanube } from '@/lib/actions';

const MODEL_IDS = [
    'b480384f-096e-4f63-a806-49df43ebb28e', // TAIPEI
    '954b1e6c-2701-413a-a9a4-be361b442ede', // TAIPEI GZA
    '9891ab15-1877-4ff4-bc71-10c9b358cc13', // TORONTO
    'c459eb5c-715a-40cc-a9f7-d3a3edb01b25', // TORONTO GZA
    '6c574f46-1c2b-4e40-9ad8-38de6442bff2', // URSULA
    'e8b7c04e-608c-440b-a060-3fd77d510145', // URSULA GZA
    'a5b99b5d-0c1c-46b3-819a-bd6ddaba40d3', // VANISHA LISA GZA
    '33a6e18e-2053-4105-ba6d-141424dbf15f', // VARSOVIA GZA
    'a364b891-89a5-43f0-a18b-b339059334a3', // VEGAS
    '13d87812-5f9b-4a1d-953c-981ca95339f7', // VERACRUZ
    '36be81fd-240e-4746-b2db-6dff2dca6836', // VIOLETTE
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
