const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// We use dynamic import for node-fetch to support ESM
const getFetch = async () => {
    const { default: fetch } = await import('node-fetch');
    return fetch;
};

async function checkStockSync() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const fetch = await getFetch();
    
    console.log("🔍 Cargando productos del ERP...");
    const { data: models, error } = await supabase
        .from('modelos')
        .select('*, variantes(*, unidades(*))')
        .not('tiendanube_id', 'is', null);

    if (error) {
        console.error("Error al cargar modelos:", error);
        return;
    }

    const accessToken = process.env.TIENDANUBE_ACCESS_TOKEN;
    const storeId = process.env.TIENDANUBE_STORE_ID;
    const baseUrl = `https://api.tiendanube.com/v1/${storeId}`;
    const headers = {
        'Authentication': `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Strawberry ERP (fernandezdemaussiontomas@gmail.com)'
    };

    console.log(`✅ ${models.length} modelos con ID de Tiendanube encontrados.`);
    console.log("-----------------------------------------");

    const discrepancies = [];

    for (const modelo of models) {
        try {
            const res = await fetch(`${baseUrl}/products/${modelo.tiendanube_id}`, { headers });
            if (!res.ok) {
                console.warn(`[!] Producto ${modelo.descripcion} (${modelo.tiendanube_id}) no encontrado en TN.`);
                continue;
            }
            const tnProd = await res.json();
            
            // Calculate ERP stock
            const erpStockByVariant = {};
            modelo.variantes?.forEach(v => {
                const stockBySize = (v.unidades || []).reduce((acc, u) => {
                    if (u.estado === 'DISPONIBLE') {
                        acc[u.talle_especifico] = (acc[u.talle_especifico] || 0) + 1;
                    }
                    return acc;
                }, {});
                erpStockByVariant[v.color.toUpperCase()] = stockBySize;
            });

            // Compare with TN
            let hasDiff = false;
            let diffDetails = [];

            tnProd.variants?.forEach(v => {
                const colorVal = (v.values[0]?.es || '').toUpperCase().trim();
                const talleVal = (v.values[1]?.es || '').trim();
                
                const erpQty = erpStockByVariant[colorVal]?.[talleVal] || 0;
                const tnQty = v.stock || 0;

                if (erpQty !== tnQty) {
                    hasDiff = true;
                    diffDetails.push(`${colorVal} T${talleVal}: ERP=${erpQty} vs TN=${tnQty}`);
                }
            });

            if (hasDiff) {
                discrepancies.push({ id: modelo.id, nombre: modelo.descripcion, details: diffDetails });
                console.log(`❌ DESFASADO: ${modelo.descripcion} (${diffDetails.length} variantes con diferencias)`);
            } else {
                // console.log(`✅ OK: ${modelo.descripcion}`);
            }

        } catch (err) {
            console.error(`Error procesando ${modelo.descripcion}:`, err.message);
        }
    }

    console.log("-----------------------------------------");
    console.log(`📊 Total desfasados: ${discrepancies.length} de ${models.length}`);
    if (discrepancies.length > 0) {
        console.log("Para sincronizarlos todos, usaremos la función syncProductToTiendanube.");
    }
}

checkStockSync();
