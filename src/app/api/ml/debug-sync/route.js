import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mlFetch } from '@/lib/mercadolibre';

const ML_COLOR_MAP = {
    'NEGRO':     { colorId: '2450295' },
    'CHOCOLATE': { colorId: '2450291' },
    'MARRON':    { colorId: '2450291' },
    'CAMEL':     { colorId: '52001' },
    'BEIGE':     { colorId: '52001' },
    'VISON':     { colorId: '52001' },
    'SUELA':     { colorId: '52001' },
};

const ML_COLOR_ID_TO_ERP_LIST = Object.entries(ML_COLOR_MAP).reduce((acc, [erpColor, { colorId }]) => {
    if (!acc[colorId]) acc[colorId] = [];
    acc[colorId].push(erpColor);
    return acc;
}, {});

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const modeloId = searchParams.get('modeloId');
    if (!modeloId) return NextResponse.json({ error: 'modeloId required' });

    const supabase = createClient();

    const { data: mlItems } = await supabase
        .from('mercadolibre_items')
        .select('ml_item_id, color')
        .eq('modelo_id', modeloId);

    const { data: variantes } = await supabase
        .from('variantes')
        .select('id, precio_lista, color, talle, unidades(estado)')
        .eq('modelo_id', modeloId);

    const stockByColorTalle = {};
    const priceByColor = {};
    for (const v of variantes || []) {
        const c = (v.color || '').toUpperCase();
        const t = (v.talle || '').toUpperCase();
        const key = `${c}-${t}`;
        stockByColorTalle[key] = v.unidades?.filter(u => u.estado === 'DISPONIBLE').length || 0;
        priceByColor[c] = parseFloat(v.precio_lista) || priceByColor[c] || 0;
    }

    const debug = [];
    for (const mlItem of mlItems || []) {
        const itemColor = (mlItem.color || '').toUpperCase();
        const current = await mlFetch(`/items/${mlItem.ml_item_id}?attributes=variations,available_quantity`);

        const variationDebug = (current.variations || []).map(v => {
            const sizeAttr = v.attribute_combinations?.find(a => a.id === 'SIZE');
            const colorAttr = v.attribute_combinations?.find(a => a.id === 'COLOR');
            const talleNum = sizeAttr?.value_name?.replace(/\s*AR$/i, '').trim() || '';
            const mlColorId = colorAttr?.value_id?.toString() || '';
            let erpColor = itemColor;
            if (!erpColor) {
                const candidates = ML_COLOR_ID_TO_ERP_LIST[mlColorId] || [];
                erpColor = candidates.find(c => stockByColorTalle[`${c}-${talleNum}`] !== undefined)
                    || candidates[0] || '';
            }
            const erpKey = `${erpColor}-${talleNum}`;
            return {
                ml_variation_id: v.id,
                ml_color_id: mlColorId,
                ml_color_name: colorAttr?.value_name,
                ml_size: sizeAttr?.value_name,
                ml_current_qty: v.available_quantity,
                resolved_erp_color: erpColor,
                erp_key: erpKey,
                erp_stock: stockByColorTalle[erpKey] ?? 'NOT FOUND',
            };
        });

        debug.push({ ml_item_id: mlItem.ml_item_id, item_color: itemColor, variations: variationDebug });
    }

    return NextResponse.json({ stockByColorTalle, priceByColor, mlItems, debug });
}
