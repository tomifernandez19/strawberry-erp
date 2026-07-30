import { NextResponse } from 'next/server';
import { publishModeloToML } from '@/lib/actions';

export async function POST(req) {
    try {
        const { modeloId } = await req.json();
        if (!modeloId) return NextResponse.json({ error: 'modeloId required' }, { status: 400 });
        const result = await publishModeloToML(modeloId);
        return NextResponse.json(result);
    } catch (e) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
