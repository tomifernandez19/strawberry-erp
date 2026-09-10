import { NextResponse } from 'next/server';
import { syncProductToTiendanube } from '@/lib/actions';
import { createClient } from '@/lib/supabase/server';

const MODELS = [
    'SANTANDER','SIMONA','SELENA','SIBYL','QUEILA','PIPPA','SABADELL','SAMOA',
    'SABRINA','SARA','SENKA','SIDNEY','PEKIN','JUSTI','NAIRA','SHIRLEY','SAMI',
    'SASHA','STACEY','SOL','PETRA','SELINE','NORA','ANGELES','DAKAR','PAULETTE',
    'UMA','NORALI','KALI','TELMA','VERA','NOE','AMALIA','IBIZA','PRUN','SINGAPUR',
    'PIPER','SALAMANCA','CLARA','BORNEO','BRUNA','VESTA','IRINA','VIENA','NIZA',
    'ZEUS','BRIK','HERA','APOLO','ATENEA'
];

export async function GET() {
    const supabase = createClient();
    const results = [];

    const { data: modelos } = await supabase
        .from('modelos')
        .select('id, descripcion')
        .in('descripcion', MODELS);

    if (!modelos || modelos.length === 0) {
        return NextResponse.json({ error: 'No se encontraron modelos' }, { status: 404 });
    }

    // Deduplicate by descripcion (sync once per product name)
    const seen = new Set();
    for (const m of modelos) {
        if (seen.has(m.descripcion)) continue;
        seen.add(m.descripcion);

        try {
            const res = await syncProductToTiendanube(m.id);
            results.push({ model: m.descripcion, success: res.success, msg: res.message });
        } catch (e) {
            results.push({ model: m.descripcion, success: false, msg: e.message });
        }
    }

    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    return NextResponse.json({ ok, fail, results });
}
