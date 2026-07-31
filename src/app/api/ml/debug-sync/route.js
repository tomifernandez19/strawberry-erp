import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mlFetch } from '@/lib/mercadolibre';

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const modeloId = searchParams.get('modeloId');
    if (!modeloId) return NextResponse.json({ error: 'modeloId required' });

    const supabase = createClient();

    const { data: modelo } = await supabase
        .from('modelos')
        .select('descripcion')
        .eq('id', modeloId)
        .single();

    const { data: modelosIds } = await supabase
        .from('modelos')
        .select('id')
        .eq('descripcion', modelo?.descripcion || '');
    const allModeloIds = (modelosIds || []).map(m => m.id);

    const { data: mlItems } = await supabase
        .from('mercadolibre_items')
        .select('ml_item_id, color')
        .in('modelo_id', allModeloIds);

    const { data: variantes } = await supabase
        .from('variantes')
        .select('id, precio_lista, color')
        .in('modelo_id', allModeloIds);

    const { data: unidadesDisponibles } = await supabase
        .from('unidades')
        .select('talle_especifico, variantes(color)')
        .in('variante_id', (variantes || []).map(v => v.id))
        .eq('estado', 'DISPONIBLE');

    const stockByColorTalle = {};
    const stockTotalByColor = {};
    for (const u of unidadesDisponibles || []) {
        const c = (u.variantes?.color || '').toUpperCase();
        const t = (u.talle_especifico || '').toString().trim();
        stockByColorTalle[`${c}-${t}`] = (stockByColorTalle[`${c}-${t}`] || 0) + 1;
        stockTotalByColor[c] = (stockTotalByColor[c] || 0) + 1;
    }

    const debug = [];
    for (const mlItem of mlItems || []) {
        const full = await mlFetch(`/items/${mlItem.ml_item_id}`);
        debug.push({
            ml_item_id: mlItem.ml_item_id,
            status: full.status,
            item_color_in_db: mlItem.color,
            total_variations: full.variations?.length,
            variations: (full.variations || []).map(v => ({
                id: v.id,
                available_quantity: v.available_quantity,
                attribute_combinations: v.attribute_combinations,
            })),
        });
    }

    return NextResponse.json({
        modelo: modelo?.descripcion,
        stockByColorTalle,
        stockTotalByColor,
        mlItems,
        debug,
    });
}
