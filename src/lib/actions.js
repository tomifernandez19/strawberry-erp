'use server'
import { createClient } from './supabase/server'
import { appendToSheet } from './sheets'

/**
 * Rounds the list price to the nearest thousand with a 100-skip threshold.
 * If remainder < 100, round down to thousand.
 * If remainder >= 100, round up to thousand.
 */
function roundListPrice(price) {
    const thousand = Math.floor(price / 1000) * 1000;
    const remainder = price % 1000;
    return remainder < 100 ? thousand : thousand + 1000;
}

/**
 * Helper to get the most recent pricing for any model/color combination.
 */
async function getLatestPricing(supabase, description, color) {
    if (!description || !color) return null;
    const { data } = await supabase
        .from('variantes')
        .select('precio_lista, precio_efectivo, modelos!inner(descripcion)')
        .ilike('modelos.descripcion', description)
        .eq('color', color)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    return data;
}

/**
 * Creates a new purchase, creates models/variants if they don't exist,
 * and generates the units ready for QR assignment.
 */
export async function createPurchase({ nro_remito, items, supplier_type = 'CAROLINA' }) {
    const supabase = createClient();
    try {
        console.log("Creating Purchase with items:", items?.length, "Type:", supplier_type);
        // 1. Process items to ensure models and variants exist
        const processedItems = []

        for (const item of items) {
            const codigo_proveedor = item.codigo_proveedor?.toUpperCase() || ''
            const descripcion = item.descripcion?.toUpperCase() || ''
            const color = item.color?.toUpperCase() || ''
            const { costo_unitario, talles, imagen_url = null } = item
            const supplierCode = codigo_proveedor?.substring(0, 2) || 'ST'

            // a. Find or Create Modelo
            let { data: modelo } = await supabase
                .from('modelos')
                .select('id')
                .eq('codigo_proveedor', codigo_proveedor)
                .single()

            if (!modelo) {
                const { data: newModelo, error: mErr } = await supabase
                    .from('modelos')
                    .insert([{
                        codigo_proveedor,
                        descripcion,
                        marca: supplierCode, // First 2 digits as requested
                        categoria: 'Calzado'
                    }])
                    .select()
                    .single()
                if (mErr) throw mErr
                modelo = newModelo
            }

            // b. Find or Create Variant (Generic Price for now, will be updated)
            let { data: variante } = await supabase
                .from('variantes')
                .select('id, imagen_url')
                .eq('modelo_id', modelo.id)
                .eq('color', color)
                .single()

            if (!variante) {
                const rawPrecioLista = costo_unitario * 2.42;
                const precioLista = roundListPrice(rawPrecioLista);
                const precioEfectivo = (costo_unitario * 2) + 3000;

                const { data: newVar, error: vErr } = await supabase
                    .from('variantes')
                    .insert([{
                        modelo_id: modelo.id,
                        color,
                        talle: 'CURVA',
                        precio_efectivo: precioEfectivo,
                        precio_lista: precioLista,
                        costo_promedio: costo_unitario,
                        imagen_url: imagen_url
                    }])
                    .select('id')
                    .single()
                if (vErr) throw new Error(vErr.message)
                variante = newVar
            } else {
                // ALWAYS update prices and image based on the latest purchase
                const rawPrecioLista = costo_unitario * 2.42;
                const precioLista = roundListPrice(rawPrecioLista);
                const precioEfectivo = (costo_unitario * 2) + 3000;

                const { error: updErr } = await supabase
                    .from('variantes')
                    .update({
                        precio_efectivo: precioEfectivo,
                        precio_lista: precioLista,
                        costo_promedio: costo_unitario,
                        imagen_url: imagen_url || variante.imagen_url
                    })
                    .eq('id', variante.id)
                if (updErr) console.warn("Could not update variant details:", updErr.message)
            }

            processedItems.push({ ...item, variante_id: variante.id })
        }

        // 2. Insert the purchase (compra)
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        const overallSupplier = processedItems[0]?.codigo_proveedor?.substring(0, 2) || 'ST'
        const { data: compra, error: compraError } = await supabase
            .from('compras')
            .insert([{
                proveedor: overallSupplier,
                nro_remito,
                user_id: user?.id || null,
                propietario: supplier_type === 'CAROLINA' ? 'Carolina' : 'Proveedor'
            }])
            .select('id')
            .single()

        if (compraError) throw new Error(compraError.message)

        // 3. Insert detail and units
        for (const item of processedItems) {
            const { variante_id, cantidad, costo_unitario, talles } = item

            await supabase.from('detalle_compras').insert([{
                compra_id: compra.id,
                variante_id,
                cantidad,
                costo_unitario
            }])

            const unitsToCreate = talles.map(talle => ({
                variante_id,
                compra_id: compra.id,
                estado: 'PENDIENTE_QR',
                talle_especifico: talle
            }))

            const { error: unitsError } = await supabase.from('unidades').insert(unitsToCreate)
            if (unitsError) throw new Error(unitsError.message)
        }

        return { success: true, id: compra.id };
    } catch (err) {
        console.error("CreatePurchase Error:", err);
        return { success: false, message: err.message };
    }
}

export async function addStock(variantId, talles) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Create a "Virtual Compra" to maintain the schema
    const { data: compra, error: cErr } = await supabase
        .from('compras')
        .insert([{
            proveedor: 'AJS',
            nro_remito: 'REPOSICION-' + Date.now(),
            propietario: 'Propia',
            user_id: user?.id || null
        }])
        .select()
        .single()

    if (cErr) throw cErr;

    // 2. Create units
    const unitsToCreate = talles.map(talle => ({
        variante_id: variantId,
        compra_id: compra.id,
        estado: 'PENDIENTE_QR',
        talle_especifico: talle
    }));

    const { error: unitsError } = await supabase.from('unidades').insert(unitsToCreate);
    if (unitsError) throw unitsError;

    return true;
}

/**
 * Assigns a physical QR code to a specific unit.
 */
export async function assignQRToUnit(unitId, qrCode) {
    const supabase = createClient();
    try {
        // 1. Validate Format (ST-000000)
        const qrPattern = /^ST-\d{6}$/
        if (!qrPattern.test(qrCode)) {
            throw new Error('Formato inválido. El código debe ser ST- seguido de 6 números (ej: ST-000123).')
        }

        // 2. Check if QR already exists
        const { data: existing } = await supabase
            .from('unidades')
            .select('id')
            .eq('codigo_qr', qrCode)
            .maybeSingle()

        if (existing) {
            if (existing.id === unitId) return { success: true }; // All good, already assigned to this one
            throw new Error('Este código QR ya está asignado a otro par.')
        }

        const { error } = await supabase
            .from('unidades')
            .update({
                codigo_qr: qrCode,
                estado: 'DISPONIBLE'
            })
            .eq('id', unitId)
            .eq('estado', 'PENDIENTE_QR')

        if (error) throw new Error(error.message)
        return { success: true }
    } catch (err) {
        return { success: false, message: err.message }
    }
}

/**
 * Fetches unit details for preview before confirming a sale.
 */
export async function getUnitForSale(qrCode, includeReserved = false) {
    const supabase = createClient();
    try {
        // 0. Validate Format
        const qrPattern = /^ST-\d{6}$/
        if (!qrPattern.test(qrCode)) {
            return { success: false, message: 'Formato de QR inválido. Debe ser ST- seguido de 6 números.' };
        }

        // 1. Find the unit
        let query = supabase
            .from('unidades')
            .select('*, variantes(*, modelos(*))')
            .eq('codigo_qr', qrCode);

        if (includeReserved) {
            query = query.in('estado', ['DISPONIBLE', 'RESERVADO_ONLINE']);
        } else {
            query = query.eq('estado', 'DISPONIBLE');
        }

        const { data: unidad, error: fetchError } = await query.maybeSingle();

        if (fetchError) {
            console.error("[getUnitForSale] DB Error:", fetchError);
            return { success: false, message: "Error al consultar la base de datos." };
        }

        if (!unidad) {
            return { success: false, message: 'Este par no está disponible o ya fue vendido.' };
        }

        if (!unidad.variantes || !unidad.variantes.modelos) {
            return { success: false, message: 'Datos del producto incompletos en la base de datos.' };
        }

        // Apply LATEST pricing if available (e.g. if this is an old season unit)
        const latest = await getLatestPricing(supabase, unidad.variantes.modelos.descripcion, unidad.variantes.color);
        if (latest) {
            unidad.variantes.precio_lista = latest.precio_lista;
            unidad.variantes.precio_efectivo = latest.precio_efectivo;
        }

        // Return a plain object to avoid serialization issues
        return {
            success: true,
            data: JSON.parse(JSON.stringify(unidad))
        };
    } catch (err) {
        console.error("[getUnitForSale] Fatal Error:", err.message);
        return { success: false, message: "Error interno: " + err.message };
    }
}

/**
 * Records a sale for multiple units.
 */
export async function recordSale(qrCodes, medio_pago, options = {}) {
    const supabase = createClient();
    const {
        monto_efectivo = 0,
        monto_otro = 0,
        otro_medio_pago = null,
        customerData = {},
        descuento = 0,
        monto_descuento_fijo = 0,
        monto_neto = null,
        dias_acreditacion = 0,
        isSena = false
    } = options;

    if (!Array.isArray(qrCodes) || qrCodes.length === 0) throw new Error("No hay productos seleccionados");

    // 1. Fetch and verify all units
    const { data: units, error: uErr } = await supabase
        .from('unidades')
        .select('*, variantes(*, modelos(*))')
        .in('codigo_qr', qrCodes)
        .eq('estado', 'DISPONIBLE');

    if (uErr) throw uErr;
    if (units.length !== qrCodes.length) throw new Error("Uno o más productos ya no están disponibles");

    // 2. Calculate Total
    let calculatedTotal = 0;

    if (medio_pago === 'DIVIDIR_PAGOS') {
        calculatedTotal = Number(monto_efectivo) + Number(monto_otro);
    } else {
        for (const unidad of units) {
            // Apply LATEST pricing for calculating totals
            const latest = await getLatestPricing(supabase, unidad.variantes.modelos.descripcion, unidad.variantes.color);
            const baseEfectivo = latest ? latest.precio_efectivo : unidad.variantes.precio_efectivo;
            const baseLista = latest ? latest.precio_lista : unidad.variantes.precio_lista;

            let itemPrice = baseLista;
            if (['EFECTIVO', 'MAYORISTA_EFECTIVO', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_PROVEEDOR'].includes(medio_pago)) {
                itemPrice = baseEfectivo;
            }
            calculatedTotal += itemPrice;
        }
    }

    // Apply Discount or Surcharge
    if (monto_descuento_fijo !== 0) {
        calculatedTotal = Math.max(0, calculatedTotal - Number(monto_descuento_fijo));
    } else if (descuento > 0) {
        calculatedTotal = Math.round(calculatedTotal * (1 - (descuento / 100)));
    }

    // 3. Create the sale record
    const { data: { user } } = await supabase.auth.getUser();

    // Calculate targeted account and metadata
    let targetAccount = 'SOFI_MP'; // Default for cards/QR
    if (['EFECTIVO', 'MAYORISTA_EFECTIVO'].includes(medio_pago)) targetAccount = 'CAJA_LOCAL';
    if (medio_pago === 'TRANSFERENCIA_LUCAS') targetAccount = 'LUCAS';
    if (medio_pago === 'TRANSFERENCIA_TOMI') targetAccount = 'TOMI';
    if (medio_pago === 'TRANSFERENCIA_PROVEEDOR') targetAccount = 'PROVEEDOR';

    let fechaAcreditacion = new Date();
    if (dias_acreditacion > 0) {
        fechaAcreditacion.setDate(fechaAcreditacion.getDate() + Number(dias_acreditacion));
    }

    const { data: venta, error: ventaError } = await supabase
        .from('ventas')
        .insert([{
            medio_pago,
            total: calculatedTotal,
            user_id: user?.id || null,
            monto_efectivo: (isSena || medio_pago === 'DIVIDIR_PAGOS') ? monto_efectivo : (['EFECTIVO', 'MAYORISTA_EFECTIVO'].includes(medio_pago) ? calculatedTotal : 0),
            monto_otro: (isSena || medio_pago === 'DIVIDIR_PAGOS') ? monto_otro : 0,
            otro_medio_pago: medio_pago === 'DIVIDIR_PAGOS' ? otro_medio_pago : null,
            facturado: medio_pago === 'EFECTIVO' || (medio_pago === 'DIVIDIR_PAGOS' && Number(monto_otro) === 0),
            nombre_cliente: customerData.nombre?.toUpperCase() || null,
            telefono_cliente: customerData.telefono || null,
            email_cliente: customerData.email?.toUpperCase() || null,
            // New Finance fields
            monto_neto: monto_neto || null,
            fecha_acreditacion: fechaAcreditacion.toISOString(),
            cuenta_destino: targetAccount,
            tipo: isSena ? 'SENA' : 'VENTA_LOCAL'
        }])
        .select()
        .single()

    if (ventaError) throw ventaError

    // 4. Update all units
    const { error: updateError } = await supabase
        .from('unidades')
        .update({
            estado: isSena ? 'RESERVADO_ONLINE' : 'VENDIDO',
            venta_id: venta.id,
            fecha_venta: new Date().toISOString()
        })
        .in('id', units.map(u => u.id))

    if (updateError) throw updateError

    // 5. AUTO-SYNC with Tiendanube
    try {
        const modelIds = [...new Set(units.map(u => u.variantes?.modelo_id))].filter(Boolean);
        for (const mId of modelIds) {
            syncProductToTiendanube(mId).catch(e => console.error(`[AutoSync] Error:`, e));
        }
    } catch (e) {
        console.error("[AutoSync] Failed to initiate:", e);
    }

    return { venta, units }
}

/**
 * Fetches full product details and stock status for a model based on a single unit's QR.
 * Aggregates stock across all variants with the same description and color.
 */
export async function getProductDetailsByQR(qrCode) {
    const supabase = createClient();

    // 1. Find the specific unit scanned
    const { data: unidad, error: unitError } = await supabase
        .from('unidades')
        .select('*, variantes(*, modelos(*))')
        .eq('codigo_qr', qrCode)
        .maybeSingle()

    if (unitError || !unidad) {
        throw new Error('Código QR no encontrado en el sistema.')
    }

    // 2. Aggregate stock and find the LATEST variant for pricing
    // This handles the case where "MAITE NEGRO" exists in two different models (old vs new season)
    const desc = unidad.variantes?.modelos?.descripcion;
    const color = unidad.variantes?.color;

    let siblingUnits = [];
    let latestVariant = unidad.variantes; // Default to scanned one

    if (desc && color) {
        // Step A: Find all variants that match the desc and color across any model, ordered by newest
        const { data: matchingVariants } = await supabase
            .from('variantes')
            .select('*, modelos!inner(descripcion)')
            .ilike('modelos.descripcion', desc)
            .eq('color', color)
            .order('created_at', { ascending: false });

        if (matchingVariants && matchingVariants.length > 0) {
            latestVariant = matchingVariants[0]; // Use newest for pricing/display
            const variantIds = matchingVariants.map(v => v.id);

            // Step B: Get all available units for those variants
            const { data: units } = await supabase
                .from('unidades')
                .select('talle_especifico')
                .in('variante_id', variantIds)
                .eq('estado', 'DISPONIBLE');

            siblingUnits = units || [];
        }
    }

    // Count stock by size
    const stockBySize = siblingUnits.reduce((acc, curr) => {
        const talle = curr.talle_especifico;
        acc[talle] = (acc[talle] || 0) + 1;
        return acc;
    }, {});

    return {
        unit: unidad,
        model: latestVariant.modelos,
        variant: latestVariant,
        stockBySize: Object.entries(stockBySize)
            .map(([talle, qty]) => ({ talle, qty }))
            .sort((a, b) => String(a.talle).localeCompare(String(b.talle), undefined, { numeric: true }))
    }
}

/**
 * Fetches the daily, weekly and monthly sales stats.
 */
export async function getExtendedStats() {
    const supabase = createClient();
    const initStats = () => ({
        count: 0,
        total: 0,
        neto: 0,
        items: []
    });

    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    const startOfMonth = new Date(now);
    startOfMonth.setDate(now.getDate() - 30);

    // Join with unidades, ventas, variantes and modelos to get all details
    const { data: unitsSold, error } = await supabase
        .from('unidades')
        .select(`
            id, fecha_venta, talle_especifico,
            ventas (id, total, medio_pago, monto_neto, user_id, profiles (nombre)),
            variantes (color, precio_lista, precio_efectivo, modelos (descripcion, codigo_proveedor))
        `)
        .in('estado', ['VENDIDO', 'VENDIDO_ONLINE'])
        .gte('fecha_venta', startOfMonth.toISOString())
        .order('fecha_venta', { ascending: false });

    if (error) {
        console.error("Error fetching stats:", error);
        return {
            today: initStats(),
            week: initStats(),
            month: initStats(),
            error: true
        };
    }


    const stats = {
        today: initStats(),
        week: initStats(),
        month: initStats()
    };

    const saleBaseTotals = {};
    unitsSold.forEach(unit => {
        const vId = unit.ventas?.id;
        if (!vId) return;
        const medio = unit.ventas?.medio_pago;
        const basePrice = ['EFECTIVO', 'MAYORISTA_EFECTIVO', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_PROVEEDOR'].includes(medio)
            ? (unit.variantes?.precio_efectivo || 1)
            : (unit.variantes?.precio_lista || 1);
        saleBaseTotals[vId] = (saleBaseTotals[vId] || 0) + basePrice;
    });

    unitsSold.forEach(unit => {
        const saleDate = new Date(unit.fecha_venta);
        const vId = unit.ventas?.id;
        const total = parseFloat(unit.ventas?.total) || 0;
        const neto = parseFloat(unit.ventas?.monto_neto) || total;

        let perUnitTotal = 0;
        let perUnitNeto = 0;

        if (vId && saleBaseTotals[vId] > 0) {
            const medio = unit.ventas?.medio_pago;
            const basePrice = ['EFECTIVO', 'MAYORISTA_EFECTIVO', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_PROVEEDOR'].includes(medio)
                ? (unit.variantes?.precio_efectivo || 1)
                : (unit.variantes?.precio_lista || 1);
            const weight = basePrice / saleBaseTotals[vId];
            perUnitTotal = total * weight;
            perUnitNeto = neto * weight;
        } else {
            const siblingsCount = unitsSold.filter(u => u.ventas?.id === vId).length || 1;
            perUnitTotal = total / siblingsCount;
            perUnitNeto = neto / siblingsCount;
        }

        const detailedItem = {
            id: unit.id,
            fecha: unit.fecha_venta,
            codigo: unit.variantes?.modelos?.codigo_proveedor,
            modelo: unit.variantes?.modelos?.descripcion,
            color: unit.variantes?.color,
            talle: unit.talle_especifico,
            precio: perUnitTotal,
            neto: perUnitNeto,
            medio_pago: unit.ventas?.medio_pago,
            vendedor: unit.ventas?.profiles?.nombre || unit.ventas?.user_id
        };

        const update = (obj) => {
            obj.count++;
            obj.total += perUnitTotal;
            obj.neto += perUnitNeto;
            obj.items.push(detailedItem);
        };

        if (saleDate >= startOfDay) update(stats.today);
        if (saleDate >= startOfWeek) update(stats.week);
        if (saleDate >= startOfMonth) update(stats.month);
    });

    return stats;
}

/**
 * Fetches sales stats for a custom date range.
 */
export async function getCustomRangeStats(startDate, endDate) {
    const supabase = createClient();
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const { data: unitsSold, error } = await supabase
        .from('unidades')
        .select(`
            id, fecha_venta, talle_especifico,
            ventas (id, total, medio_pago, monto_neto, user_id, profiles (nombre)),
            variantes (color, precio_lista, precio_efectivo, modelos (descripcion, codigo_proveedor))
        `)
        .in('estado', ['VENDIDO', 'VENDIDO_ONLINE'])
        .gte('fecha_venta', start.toISOString())
        .lte('fecha_venta', end.toISOString())
        .order('fecha_venta', { ascending: false });

    if (error) {
        console.error("Error fetching custom stats:", error);
        return {
            count: 0,
            total: 0,
            neto: 0,
            items: [],
            error: true
        };
    }

    const stats = {
        count: 0,
        total: 0,
        neto: 0,
        items: []
    };

    const saleBaseTotals = {};
    unitsSold.forEach(unit => {
        const vId = unit.ventas?.id;
        if (!vId) return;
        const medio = unit.ventas?.medio_pago;
        const basePrice = ['EFECTIVO', 'MAYORISTA_EFECTIVO', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_PROVEEDOR'].includes(medio)
            ? (unit.variantes?.precio_efectivo || 1)
            : (unit.variantes?.precio_lista || 1);
        saleBaseTotals[vId] = (saleBaseTotals[vId] || 0) + basePrice;
    });

    unitsSold.forEach(unit => {
        const vId = unit.ventas?.id;
        const total = parseFloat(unit.ventas?.total) || 0;
        const neto = parseFloat(unit.ventas?.monto_neto) || total;

        let perUnitTotal = 0;
        let perUnitNeto = 0;

        if (vId && saleBaseTotals[vId] > 0) {
            const medio = unit.ventas?.medio_pago;
            const basePrice = ['EFECTIVO', 'MAYORISTA_EFECTIVO', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_PROVEEDOR'].includes(medio)
                ? (unit.variantes?.precio_efectivo || 1)
                : (unit.variantes?.precio_lista || 1);
            const weight = basePrice / saleBaseTotals[vId];
            perUnitTotal = total * weight;
            perUnitNeto = neto * weight;
        } else {
            const siblingsCount = unitsSold.filter(u => u.ventas?.id === vId).length || 1;
            perUnitTotal = total / siblingsCount;
            perUnitNeto = neto / siblingsCount;
        }

        const detailedItem = {
            id: unit.id,
            fecha: unit.fecha_venta,
            codigo: unit.variantes?.modelos?.codigo_proveedor,
            modelo: unit.variantes?.modelos?.descripcion,
            color: unit.variantes?.color,
            talle: unit.talle_especifico,
            precio: perUnitTotal,
            neto: perUnitNeto,
            medio_pago: unit.ventas?.medio_pago,
            vendedor: unit.ventas?.profiles?.nombre || unit.ventas?.user_id
        };

        stats.count++;
        stats.total += perUnitTotal;
        stats.neto += perUnitNeto;
        stats.items.push(detailedItem);
    });

    return stats;
}

/**
 * Records a financial movement (Expensas, Payments, Salary, etc.)
 */
export async function recordCashMovement({ monto, tipo, motivo, persona, cuenta = 'CAJA_LOCAL', categoria = 'GASTOS_GENERALES' }) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('movimientos_caja')
        .insert([{
            monto: tipo === 'EGRESO' ? -Math.abs(monto) : Math.abs(monto),
            tipo,
            motivo,
            persona,
            cuenta,
            categoria,
            user_id: user?.id
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getRecentPersonas() {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('movimientos_caja')
        .select('persona')
        .order('created_at', { ascending: false });

    if (error || !data) return [];

    // Return unique names, removing nulls and duplicates
    const names = data.map(d => d.persona).filter(Boolean);
    return [...new Set(names)];
}

export async function getCashMovements() {
    const supabase = createClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('movimientos_caja')
        .select('*')
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });

    if (error) return [];
    return data;
}

export async function getDailySummary(onlyUserId = null) {
    const supabase = createClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch units sold today (VENDIDO or VENDIDO_ONLINE)
    const { data: unitsSold, error: uError } = await supabase
        .from('unidades')
        .select(`
            id, fecha_venta, talle_especifico,
            ventas (id, total, medio_pago, user_id, monto_efectivo, monto_neto, profiles (nombre)),
            variantes (color, precio_lista, precio_efectivo, modelos (descripcion, codigo_proveedor))
        `)
        .in('estado', ['VENDIDO', 'VENDIDO_ONLINE'])
        .gte('fecha_venta', today.toISOString())
        .order('fecha_venta', { ascending: false });

    // Fetch manual movements today
    const { data: movements, error: mError } = await supabase
        .from('movimientos_caja')
        .select('monto')
        .gte('created_at', today.toISOString());

    if (uError || mError) {
        console.error("Error fetching summary:", uError || mError);
        return { count: 0, total: 0, neto: 0, cash: 0, items: [] };
    }

    // 3. GLOBAL CASH CALCULATION (Perpetual balance)
    const { data: totalSalesCash, error: sErr } = await supabase
        .from('ventas')
        .select('monto_efectivo, medio_pago');

    const { data: totalManualCash, error: mAllErr } = await supabase
        .from('movimientos_caja')
        .select('monto')
        .eq('cuenta', 'CAJA_LOCAL');

    if (sErr || mAllErr) {
        console.error("Error fetching global cash:", sErr || mAllErr);
    }

    const cashFromSales = (totalSalesCash || []).reduce((acc, s) => {
        if (['TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_PROVEEDOR'].includes(s.medio_pago)) return acc;
        return acc + (parseFloat(s.monto_efectivo) || 0)
    }, 0);
    const cashFromManual = (totalManualCash || []).reduce((acc, m) => acc + (parseFloat(m.monto) || 0), 0);
    const globalCashInHand = cashFromSales + cashFromManual;

    const saleBaseTotals = {};
    unitsSold.forEach(unit => {
        const vId = unit.ventas?.id;
        if (!vId) return;
        const medio = unit.ventas?.medio_pago;
        const basePrice = ['EFECTIVO', 'MAYORISTA_EFECTIVO', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_PROVEEDOR'].includes(medio)
            ? (unit.variantes?.precio_efectivo || 1)
            : (unit.variantes?.precio_lista || 1);
        saleBaseTotals[vId] = (saleBaseTotals[vId] || 0) + basePrice;
    });

    // Daily items list
    const allItems = unitsSold.map(unit => {
        const vId = unit.ventas?.id;
        const total = parseFloat(unit.ventas?.total) || 0;
        const neto = parseFloat(unit.ventas?.monto_neto) || total;

        let perUnitTotal = 0;
        let perUnitNeto = 0;

        if (vId && saleBaseTotals[vId] > 0) {
            const medio = unit.ventas?.medio_pago;
            const basePrice = ['EFECTIVO', 'MAYORISTA_EFECTIVO', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_PROVEEDOR'].includes(medio)
                ? (unit.variantes?.precio_efectivo || 1)
                : (unit.variantes?.precio_lista || 1);
            const weight = basePrice / saleBaseTotals[vId];
            perUnitTotal = total * weight;
            perUnitNeto = neto * weight;
        } else {
            const siblingsCount = unitsSold.filter(u => u.ventas?.id === vId).length || 1;
            perUnitTotal = total / siblingsCount;
            perUnitNeto = neto / siblingsCount;
        }

        return {
            id: unit.id,
            fecha: unit.fecha_venta,
            codigo: unit.variantes?.modelos?.codigo_proveedor,
            modelo: unit.variantes?.modelos?.descripcion,
            color: unit.variantes?.color,
            talle: unit.talle_especifico,
            precio: perUnitTotal,
            neto: perUnitNeto,
            medio_pago: unit.ventas?.medio_pago,
            monto_efectivo: parseFloat(unit.ventas?.monto_efectivo) || 0,
            vendedor: unit.ventas?.user_id,
            vendedor_nombre: unit.ventas?.profiles?.nombre || 'S/D'
        };
    });

    // Totals and items list can be PERSONALIZED
    const displayItems = onlyUserId
        ? allItems.filter(i => i.vendedor === onlyUserId)
        : allItems;

    const totalAmount = displayItems.reduce((acc, item) => acc + item.precio, 0);
    const totalNeto = displayItems.reduce((acc, item) => acc + (item.neto || item.precio), 0);

    return {
        count: displayItems.length,
        total: totalAmount,
        neto: totalNeto,
        cash: globalCashInHand,
        items: displayItems
    };
}

/**
 * Fetches recent cash movements (Manual + Sales) for detail view.
 * @param {string} accountId - Optional account filter (e.g., 'CAJA_LOCAL')
 */
export async function getRecentUnifiedCaja(accountId = null) {
    const supabase = createClient();

    let query = supabase.from('movimientos_caja').select('*');
    if (accountId) query = query.eq('cuenta', accountId);

    const { data: manual } = await query
        .order('created_at', { ascending: false })
        .limit(20);

    // 2. Sales with cash strictly (Cash or Wholesale Cash)
    // Only include sales if we are looking at all accounts OR specifically CAJA_LOCAL
    let sales = [];
    if (!accountId || accountId === 'CAJA_LOCAL') {
        const { data: salesData } = await supabase
            .from('ventas')
            .select('id, created_at, total, monto_efectivo, medio_pago')
            .in('medio_pago', ['EFECTIVO', 'MAYORISTA_EFECTIVO', 'DIVIDIR_PAGOS'])
            .gt('monto_efectivo', 0)
            .order('created_at', { ascending: false })
            .limit(15);
        sales = salesData || [];
    }

    // 3. Merge and Sort
    const unified = [
        ...(manual || []).map(m => ({
            id: m.id,
            created_at: m.created_at,
            monto: m.monto,
            tipo: m.tipo,
            motivo: m.motivo,
            persona: m.persona,
            cuenta: m.cuenta,
            tag: 'MANUAL'
        })),
        ...sales.map(s => ({
            id: s.id,
            created_at: s.created_at,
            monto: s.monto_efectivo,
            tipo: 'INGRESO',
            motivo: `Venta ${s.medio_pago === 'EFECTIVO' ? 'Efectivo' : (s.medio_pago === 'MAYORISTA_EFECTIVO' ? 'Mayorista' : 'Parte Efectivo')}`,
            persona: 'CAJA',
            cuenta: 'CAJA_LOCAL',
            tag: 'VENTA'
        }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20);

    return unified;
}

/**
 * Calculates current balances for all accounts (State of Accounts).
 */
export async function getFinanceSummary() {
    const supabase = createClient();
    const now = new Date().toISOString();

    // Optimize by fetching in parallel and selecting only needed fields
    const [salesRes, movementsRes, purchasesRes] = await Promise.all([
        supabase.from('ventas').select('total, monto_efectivo, monto_neto, fecha_acreditacion, cuenta_destino, medio_pago'),
        supabase.from('movimientos_caja').select('monto, cuenta, categoria'),
        supabase.from('detalle_compras').select('costo_unitario, cantidad, compras(propietario)')
    ]);

    const sales = salesRes.data;
    const movements = movementsRes.data;
    const purchases = purchasesRes.data;

    if (salesRes.error || movementsRes.error || purchasesRes.error) {
        throw new Error("Error fetching finance data");
    }

    const accounts = {
        CAJA_LOCAL: 0,
        SOFI_MP: 0,
        SOFI_PENDING: 0,
        TOMI: 0,
        LUCAS: 0,
        CAROLINA: -13000000, // Initial debt
        PROVEEDOR: 0
    };

    // Calculate Costs from Supplier Purchases
    purchases?.forEach(p => {
        if (p.compras?.propietario === 'Proveedor') {
            const cost = (parseFloat(p.costo_unitario) || 0) * (p.cantidad || 0);
            accounts.PROVEEDOR -= cost; // New stock increases debt (negative)
        }
    });

    // 4. Process Sales
    sales?.forEach(s => {
        const total = parseFloat(s.total) || 0;
        let efe = parseFloat(s.monto_efectivo) || 0;

        if (['TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_PROVEEDOR'].includes(s.medio_pago)) {
            efe = 0;
        }

        const netoTotal = s.monto_neto !== null ? parseFloat(s.monto_neto) : total;

        // 1. Cash portion always goes to CAJA_LOCAL
        if (efe > 0) accounts.CAJA_LOCAL += efe;

        const other = netoTotal - efe;
        if (other <= 0 && efe <= 0) return;

        // 2. The rest goes to its target account
        let target = s.cuenta_destino;
        if (!target) {
            // Legacy fallbacks
            if (s.medio_pago === 'TRANSFERENCIA_LUCAS') target = 'LUCAS';
            else if (s.medio_pago === 'TRANSFERENCIA_TOMI') target = 'TOMI';
            else if (s.medio_pago === 'TRANSFERENCIA_PROVEEDOR') target = 'PROVEEDOR';
            else if (s.medio_pago?.includes('SOFI')) target = 'SOFI_MP';
            else target = 'SOFI_MP'; // Assume digital for anything else legacy
        }

        if (target === 'SOFI_MP') {
            const isReconciled = s.monto_neto !== null;
            if (isReconciled && s.fecha_acreditacion <= now) {
                accounts.SOFI_MP += other;
            } else {
                accounts.SOFI_PENDING += other;
            }
        } else if (target === 'PROVEEDOR') {
            accounts.PROVEEDOR += other;
        } else if (accounts[target] !== undefined && target !== 'CAJA_LOCAL') {
            accounts[target] += other;
        }
    });

    // 5. Process Manual Movements
    movements?.forEach(m => {
        const monto = parseFloat(m.monto) || 0;

        // Always affect the account first
        if (accounts[m.cuenta] !== undefined) {
            accounts[m.cuenta] += monto;
        }

        // Then affect debts if special category
        if (m.categoria === 'PAGO_CAROLINA') {
            accounts.CAROLINA += Math.abs(monto);
        } else if (m.categoria === 'PAGO_PROVEEDOR') {
            accounts.PROVEEDOR += Math.abs(monto);
        } else if (m.categoria === 'INTERESES') {
            // Intereses are already added/subtracted to the account balance in the step above
        }
    });

    return accounts;
}

/**
 * Gets a detailed summary of capital contributions by person.
 */
export async function getCapitalContributionsReport() {
    const supabase = createClient();

    const { data: movements, error } = await supabase
        .from('movimientos_caja')
        .select('monto, persona, categoria, created_at, motivo, cuenta')
        .in('categoria', ['APORTE_CAPITAL', 'VUELTO_CAMBIO', 'OTRO_INGRESO'])
        .eq('tipo', 'INGRESO')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("[getCapitalContributionsReport] Error:", error);
        return { byPerson: {}, history: [] };
    }

    const byPerson = {
        'LUCAS': 0,
        'SOFI': 0,
        'TOMI': 0
    };
    const validMovements = movements?.filter(m => !m.motivo?.includes('TRASPASO')) || [];

    validMovements.forEach(m => {
        const name = (m.persona || 'S/D').trim().toUpperCase();
        if (!byPerson[name]) byPerson[name] = 0;
        byPerson[name] += parseFloat(m.monto) || 0;
    });

    return {
        byPerson,
        history: validMovements
    };
}
export async function deleteSale(saleId) {
    if (!saleId) return { success: false, message: "ID de venta no proporcionado" };

    const supabase = createClient();

    try {
        // 0. Get units to sync later
        const { data: unitsToSync } = await supabase
            .from('unidades')
            .select('variantes(modelo_id)')
            .eq('venta_id', saleId);

        // 1. Revert all units associated with this sale to DISPONIBLE
        const { error: unitError } = await supabase
            .from('unidades')
            .update({
                estado: 'DISPONIBLE',
                venta_id: null,
                fecha_venta: null
            })
            .eq('venta_id', saleId);

        if (unitError) {
            console.error("[deleteSale] Unit Revert Error:", unitError);
            return { success: false, message: "No se pudieron liberar los productos de esta venta." };
        }

        // 2. Delete the sale record itself
        const { data: deleted, error: saleError } = await supabase
            .from('ventas')
            .delete()
            .eq('id', saleId)
            .select();

        if (saleError) {
            console.error("[deleteSale] Sale Delete Error:", saleError);
            return { success: false, message: "Error de base de datos al borrar venta: " + saleError.message };
        }

        if (!deleted || deleted.length === 0) {
            return { success: false, message: "No se pudo eliminar el registro de la venta. Es posible que no tengas permisos o ya se haya borrado." };
        }

        // 3. AUTO-SYNC
        try {
            const modelIds = [...new Set(unitsToSync?.map(u => u.variantes?.modelo_id))].filter(Boolean);
            for (const mId of modelIds) {
                syncProductToTiendanube(mId).catch(e => console.error(`[AutoSync] Error:`, e));
            }
        } catch (e) {
            console.error("[AutoSync] Failed:", e);
        }

        return { success: true };
    } catch (err) {
        console.error("[deleteSale] Unexpected error:", err);
        return { success: false, message: "Error inesperado al anular la venta." };
    }
}

/**
 * Fetches card sales that haven't been reconciled (no monto_neto).
 */
export async function getUnreconciledSales() {
    const supabase = createClient();
    // Fetch card sales that haven't been reconciled.
    // Use array for 'in' filter and select only needed fields
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);

    const { data, error } = await supabase
        .from('ventas')
        .select('*, profiles(nombre)')
        .is('monto_neto', null)
        .gte('created_at', lastMonth.toISOString())
        .order('created_at', { ascending: false });

    if (error) throw error;

    // Filter in JS to be more robust with legacy data
    return (data || []).filter(s => {
        // Exclude cash-only sales
        const medio = s.medio_pago || '';
        if (medio === 'EFECTIVO' || medio === 'MAYORISTA_EFECTIVO') return false;

        // If it's a split payment or a card/transfer, we want it
        return true;
    });
}

/**
 * Updates a sale with merchant-verified financial data.
 */
export async function reconcileSale(saleId, { monto_neto, dias_acreditacion }) {
    const supabase = createClient();

    let fechaAcreditacion = new Date();
    if (dias_acreditacion > 0) {
        fechaAcreditacion.setDate(fechaAcreditacion.getDate() + Number(dias_acreditacion));
    }

    const { error } = await supabase
        .from('ventas')
        .update({
            monto_neto: parseFloat(monto_neto),
            fecha_acreditacion: fechaAcreditacion.toISOString()
        })
        .eq('id', saleId);

    if (error) throw error;
    return true;
}

/**
 * Deletes a specific unit from stock.
 */
export async function deleteUnit(unitId) {
    const supabase = createClient();
    try {
        // 0. Get info to sync
        const { data: unit } = await supabase
            .from('unidades')
            .select('variantes(modelo_id)')
            .eq('id', unitId)
            .single();

        const { error } = await supabase
            .from('unidades')
            .delete()
            .eq('id', unitId);

        if (error) throw error;

        // Sync
        if (unit?.variantes?.modelo_id) {
            syncProductToTiendanube(unit.variantes.modelo_id).catch(e => console.error(`[AutoSync] Error:`, e));
        }

        return { success: true };
    } catch (err) {
        console.error("[deleteUnit] Error:", err);
        return { success: false, message: "No se pudo eliminar la unidad: " + err.message };
    }
}

/**
 * Updates variant details (prices, color).
 */
export async function updateVariant(variantId, updates) {
    const supabase = createClient();
    try {
        const { data: variant } = await supabase
            .from('variantes')
            .select('modelo_id')
            .eq('id', variantId)
            .single();

        const { error } = await supabase
            .from('variantes')
            .update(updates)
            .eq('id', variantId);

        if (error) throw error;

        if (variant?.modelo_id) {
            syncProductToTiendanube(variant.modelo_id).catch(e => console.error(`[AutoSync] Error:`, e));
        }

        return { success: true };
    } catch (err) {
        console.error("[updateVariant] Error:", err);
        return { success: false, message: "No se pudieron actualizar los precios: " + err.message };
    }
}

/**
 * Updates variant details (prices, color).
 */
export async function updatePrice(variantId, newPriceLista) {
    const supabase = createClient();
    const newPriceEfectivo = Math.round(newPriceLista * (100 / 121));

    const { error } = await supabase
        .from('variantes')
        .update({
            precio_efectivo: newPriceEfectivo,
            precio_lista: newPriceLista
        })
        .eq('id', variantId);

    if (error) throw error;
    return true;
}

/**
 * Auth Helpers
 */
export async function signIn(email, password) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw (error.message === 'Invalid login credentials' ? 'Credenciales incorrectas' : error.message);
    return data;
}

export async function signOutAction() {
    const supabase = createClient();
    await supabase.auth.signOut();
}

export async function findUnitBySpecs(modelDescription, color, talle, excludeQrs = [], sku = null) {
    const supabase = createClient();
    try {
        const cleanExclude = Array.isArray(excludeQrs) ? excludeQrs : [];

        // 0. Robust Model Name Extraction
        // Tiendanube name examples: "JUSTI (NEGRO, 35)", "SABADELL - CAMEL", "SHARON"
        let baseModelName = (modelDescription || '').split(' (')[0].split(' - ')[0].trim();

        const cleanColor = (color || '').trim();
        const cleanTalle = String(talle || '').trim();

        console.log(`[Matching] Attempting: ${baseModelName} | ${cleanColor} | T${cleanTalle} | SKU: ${sku} | Exclude: ${cleanExclude.length}`);

        // 1. Get variants
        // Priority 1: Match model by SKU (Supplier Code part)
        let variants = [];
        if (sku) {
            const skuParts = sku.split('-');
            const supplierCodeFromSku = skuParts[0]; // "LE61JUSTI"

            const { data: skuVariants } = await supabase
                .from('variantes')
                .select(`
                    id, color,
                    modelos!inner(id, descripcion, codigo_proveedor)
                `)
                .eq('modelos.codigo_proveedor', supplierCodeFromSku);

            if (skuVariants && skuVariants.length > 0) {
                variants = skuVariants;
                console.log(`[Matching] Found ${variants.length} variants by SKU Supplier Code: ${supplierCodeFromSku}`);
            }
        }

        // Priority 2: Match model by Name if SKU search failed
        if (variants.length === 0) {
            // Find all models where the description contains the base name
            const { data: nameVariants } = await supabase
                .from('variantes')
                .select(`
                    id, color,
                    modelos!inner(id, descripcion, codigo_proveedor)
                `)
                .ilike('modelos.descripcion', `%${baseModelName}%`);

            variants = nameVariants || [];
            if (variants.length > 0) {
                console.log(`[Matching] Found ${variants.length} variants related to: ${baseModelName}`);
            }
        }

        if (variants.length === 0) {
            throw new Error(`No se encontró el modelo "${baseModelName}" en el sistema`);
        }

        // 2. Find ALL matching variants for the requested color
        const matchingVariantIds = variants
            .filter(v =>
                v.color.toLowerCase() === cleanColor.toLowerCase() ||
                v.color.toLowerCase().includes(cleanColor.toLowerCase()) ||
                cleanColor.toLowerCase().includes(v.color.toLowerCase())
            )
            .map(v => v.id);

        if (matchingVariantIds.length === 0) {
            throw new Error(`No se encontró la variante "${cleanColor}" para el modelo encontrado`);
        }

        // 3. Find FIRST available unit among ALL matching variants
        const { data: units, error: uError } = await supabase
            .from('unidades')
            .select('codigo_qr')
            .in('variante_id', matchingVariantIds)
            .eq('talle_especifico', cleanTalle)
            .eq('estado', 'DISPONIBLE')
            .limit(20);

        if (uError || !units || units.length === 0) {
            return { success: false, message: `STOCK AGOTADO: No hay stock disponible de ${baseModelName} talle ${cleanTalle}` };
        }

        // Filter out those already in cart in JavaScript to avoid PostgREST hyphen issues
        const unit = units.find(u => !cleanExclude.includes(u.codigo_qr));

        if (!unit) {
            return { success: false, message: `STOCK AGOTADO: Ya agregaste todas las unidades disponibles de ${baseModelName} talle ${cleanTalle}` };
        }

        return { success: true, qr_code: unit.codigo_qr };
    } catch (err) {
        console.error("findUnitBySpecs Error:", err.message);
        return { success: false, message: "Error al buscar unidad: " + err.message };
    }
}

export async function getSearchSpecs() {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('unidades')
        .select(`
            talle_especifico,
            variantes (
                color,
                modelos (descripcion)
            )
        `)
        .eq('estado', 'DISPONIBLE');

    if (error) return { models: [] };

    const specs = {};

    data.forEach(item => {
        const model = item.variantes?.modelos?.descripcion;
        const color = item.variantes?.color;
        const talle = item.talle_especifico;

        if (!model || !color || !talle) return;

        if (!specs[model]) specs[model] = {};
        if (!specs[model][color]) specs[model][color] = new Set();
        specs[model][color].add(talle);
    });

    // Format for easier consumption in React
    return Object.keys(specs).sort().map(modelName => ({
        name: modelName,
        colors: Object.keys(specs[modelName]).sort().map(colorName => ({
            name: colorName,
            sizes: Array.from(specs[modelName][colorName]).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
        }))
    }));
}

export async function getCurrentUser() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, nombre')
        .eq('id', user.id)
        .maybeSingle();

    return { ...user, role: profile?.role || 'VENDEDOR', nombre: profile?.nombre };
}


export async function updateProfile(updates) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No hay sesión activa");

    const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

    if (error) throw error;
    return true;
}

export async function searchModels(term) {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('modelos')
        .select('*, variantes(*)')
        .ilike('descripcion', `%${term}%`)
        .limit(10)

    if (error) throw error;
    return data;
}

// --- INTEGRACIÓN TIENDANUBE ---

export async function registerTiendanubeWebhooks() {
    const accessToken = process.env.TIENDANUBE_ACCESS_TOKEN;
    const storeId = process.env.TIENDANUBE_STORE_ID;

    if (!accessToken || !storeId) return { ok: false, error: 'Faltan credenciales en Vercel' };

    try {
        const response = await fetch(`https://api.tiendanube.com/v1/${storeId}/webhooks`, {
            method: 'POST',
            headers: {
                'Authentication': `bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'ERP Strawberry Trejo (fernandezdemaussiontomas@gmail.com)'
            },
            body: JSON.stringify({
                event: 'order/created',
                url: `https://strawberry-erp.vercel.app/api/webhooks/tiendanube`
            })
        });

        if (response.ok) return { ok: true };

        const errorData = await response.json().catch(() => ({}));
        return {
            ok: false,
            error: `Error ${response.status}: ${errorData.description || errorData.message || 'Sin detalles'}`
        };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

export async function getTiendanubeStatus() {
    return {
        hasToken: !!process.env.TIENDANUBE_ACCESS_TOKEN,
        hasStoreId: !!process.env.TIENDANUBE_STORE_ID,
        storeDigits: process.env.TIENDANUBE_STORE_ID?.slice(-4) || '---',
        tokenDigits: process.env.TIENDANUBE_ACCESS_TOKEN?.slice(-4) || '---'
    };
}

export async function syncProductToTiendanube(modeloId) {
    const supabase = createClient();
    const accessToken = process.env.TIENDANUBE_ACCESS_TOKEN;
    const storeId = process.env.TIENDANUBE_STORE_ID;

    if (!accessToken || !storeId) {
        return { success: false, message: "Faltan las credenciales de Tiendanube en .env.local" };
    }

    const baseUrl = `https://api.tiendanube.com/v1/${storeId}`;
    const headers = {
        'Authentication': `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Strawberry ERP (fernandezdemaussiontomas@gmail.com)'
    };

    try {
        const { data: modelo, error: mErr } = await supabase
            .from('modelos')
            .select('*, variantes(*, unidades(*))')
            .eq('id', modeloId)
            .single();

        if (mErr || !modelo) return { success: false, message: "Modelo no encontrado en el ERP" };

        const tnVariants = [];
        modelo.variantes?.forEach(variante => {
            const stockPorTalle = (variante.unidades || []).reduce((acc, u) => {
                if (u.estado === 'DISPONIBLE') {
                    acc[u.talle_especifico] = (acc[u.talle_especifico] || 0) + 1;
                }
                return acc;
            }, {});

            Object.entries(stockPorTalle).forEach(([talle, stock]) => {
                tnVariants.push({
                    price: String(variante.precio_lista),
                    stock: stock,
                    values: [{ es: variante.color }, { es: String(talle) }],
                    sku: `${modelo.codigo_proveedor}-${variante.color.substring(0, 3)}-${talle}`.toUpperCase()
                });
            });
        });

        if (tnVariants.length === 0) {
            return { success: false, message: "No hay stock disponible para sincronizar" };
        }

        // 1. Verificar si el producto ya existe en Tiendanube
        let tnProductId = modelo.tiendanube_id;
        let existingProduct = null;

        if (tnProductId) {
            const res = await fetch(`${baseUrl}/products/${tnProductId}`, { headers });
            if (res.ok) existingProduct = await res.json();
        }

        if (!existingProduct) {
            // Intentar buscar por nombre
            const searchRes = await fetch(`${baseUrl}/products?q=${encodeURIComponent(modelo.descripcion)}`, { headers });
            const searchData = await searchRes.json();
            existingProduct = Array.isArray(searchData) ? searchData.find(p => p.name.es === modelo.descripcion) : null;
            if (existingProduct) {
                tnProductId = existingProduct.id;
                await supabase.from('modelos').update({ tiendanube_id: String(tnProductId) }).eq('id', modelo.id);
            }
        }

        if (!existingProduct) {
            // MODO CREACIÓN (POST)
            const tnProduct = {
                name: { es: modelo.descripcion },
                description: { es: `Modelo ${modelo.descripcion} - ${modelo.marca}` },
                attributes: [{ es: 'Color' }, { es: 'Talle' }],
                variants: tnVariants,
                stock_control: true // IMPORTANTE: Para que Tiendanube acepte el stock
            };

            const response = await fetch(`${baseUrl}/products`, {
                method: 'POST',
                headers,
                body: JSON.stringify(tnProduct)
            });

            if (!response.ok) {
                const err = await response.text();
                return { success: false, message: `Error al crear: ${response.status}`, details: err };
            }

            const newProd = await response.json();
            await supabase.from('modelos').update({ tiendanube_id: String(newProd.id) }).eq('id', modelo.id);
            return { success: true, message: "Producto creado con stock y precios con éxito" };
        } else {
            // MODO ACTUALIZACIÓN (PUT)
            // 1. Actualizar datos base (Aseguramos stock_control: true)
            const updateProdRes = await fetch(`${baseUrl}/products/${tnProductId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    name: { es: modelo.descripcion },
                    description: { es: `Modelo ${modelo.descripcion} - ${modelo.marca}` },
                    stock_control: true
                })
            });

            if (!updateProdRes.ok) {
                const err = await updateProdRes.text();
                return { success: false, message: "Error al actualizar info base", details: err };
            }

            // 2. Sincronizar variantes una por una
            for (const localV of tnVariants) {
                const tnV = existingProduct.variants.find(v =>
                    v.sku === localV.sku ||
                    (v.values[0]?.es === localV.values[0].es && v.values[1]?.es === localV.values[1].es)
                );

                if (tnV) {
                    // Actualizar variante existente
                    await fetch(`${baseUrl}/products/${tnProductId}/variants/${tnV.id}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({
                            price: localV.price,
                            stock: localV.stock,
                            sku: localV.sku
                        })
                    });
                } else {
                    // Crear variante nueva si no existía en TN
                    await fetch(`${baseUrl}/products/${tnProductId}/variants`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(localV)
                    });
                }
            }

            return { success: true, message: "Producto, precios y stock actualizados correctamente" };
        }
    } catch (err) {
        console.error('Sync Exception:', err);
        return { success: false, message: "Error interno: " + err.message };
    }
}

export async function recordOnlineOrder(orderData) {
    const supabase = createClient();
    const { id: tnId, customer, products, number } = orderData;

    console.log(`[Webhook] Processing Order #${number} (${tnId})`);

    // 1. Create order record
    const clienteNombre = customer?.name || orderData.shipping_address?.first_name || 'Cliente Online';
    const clienteEmail = customer?.email || orderData.shipping_address?.email || null;
    const clienteTelefono = customer?.phone || orderData.shipping_address?.phone || null;
    const gateway = orderData.gateway || orderData.payment_details?.method || 'TIENDANUBE';

    const { data: pedido, error: pError } = await supabase
        .from('pedidos_online')
        .insert([{
            tiendanube_id: String(tnId),
            cliente_nombre: clienteNombre,
            cliente_email: clienteEmail,
            cliente_telefono: clienteTelefono,
            nro_pedido: String(number),
            items_raw: products,
            estado: 'PENDIENTE_DESPACHO',
            medio_pago: gateway
        }])
        .select()
        .single();

    if (pError) {
        console.error(`[Webhook] Error saving order #${number}:`, pError.message);
        throw pError;
    }

    // 2. Try to reserve units
    for (const prod of products) {
        try {
            // Tiendanube sends variant values in order. We assume [Color, Talle]
            const colorRaw = (prod.variant_values?.[0] || '').trim();
            const talleRaw = (prod.variant_values?.[1] || '').trim();

            console.log(`[Webhook] Searching unit for: ${prod.name} | ${colorRaw} | ${talleRaw} | SKU: ${prod.sku}`);

            const qrCode = await findUnitBySpecs(prod.name, colorRaw, talleRaw, prod.sku);

            if (qrCode) {
                // Find unit ID
                const { data: unit } = await supabase
                    .from('unidades')
                    .select('id')
                    .eq('codigo_qr', qrCode)
                    .single();

                if (unit) {
                    // Update unit to RESERVADO_ONLINE
                    const { error: uErr } = await supabase
                        .from('unidades')
                        .update({
                            estado: 'RESERVADO_ONLINE',
                            fecha_venta: new Date().toISOString() // Reserve date
                        })
                        .eq('id', unit.id);

                    if (!uErr) {
                        // Link unit to order
                        await supabase
                            .from('pedidos_online')
                            .update({ unidad_reservada_id: unit.id })
                            .eq('id', pedido.id);

                        console.log(`[Webhook] SUCCESS: Unit ${qrCode} reserved for order #${number}`);
                    }
                }
            }
        } catch (e) {
            console.warn(`[Webhook] Auto-reservation failed for item in #${number}:`, e.message);
        }
    }

    return pedido;
}

export async function getPendingDispatches() {
    const supabase = createClient();
    try {
        const { data, error } = await supabase
            .from('pedidos_online')
            .select('*')
            .eq('estado', 'PENDIENTE_DESPACHO')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("[Dispatches] DB Error:", error.message);
            return [];
        }
        return data || [];
    } catch (err) {
        console.error("[Dispatches] Fatal Error:", err.message);
        return [];
    }
}

export async function completeDispatch(pedidoId, qrCode, customPrice = null) {
    const supabase = createClient();
    try {
        console.log(`[Dispatch] Starting completion for Pedido ID: ${pedidoId}, QR: ${qrCode}`);

        // 1. Confirm unit exists and is available (including reserved)
        const result = await getUnitForSale(qrCode, true);
        if (!result.success) {
            throw new Error(result.message);
        }
        const unidad = result.data;

        // 2. Fetch Order to see if there was a reserved unit
        const { data: order, error: oError } = await supabase
            .from('pedidos_online')
            .select('*')
            .eq('id', pedidoId)
            .single();

        if (oError || !order) {
            throw new Error("No se pudo encontrar el pedido en la base de datos.");
        }

        // 3. Record the sale
        const { data: { user } } = await supabase.auth.getUser();

        const montoVenta = customPrice !== null ? parseFloat(customPrice) : (unidad.variantes?.precio_lista || 0);
        const medioPagoFinal = order.medio_pago || 'TIENDANUBE';

        const { data: venta, error: vErr } = await supabase
            .from('ventas')
            .insert([{
                total: montoVenta,
                medio_pago: medioPagoFinal,
                user_id: user?.id || null,
                facturado: false,
                tipo: 'VENTA_ONLINE',
                nombre_cliente: order.cliente_nombre || null,
                email_cliente: order.cliente_email || null,
                telefono_cliente: order.cliente_telefono || null
            }])
            .select()
            .single();

        if (vErr) {
            console.error("[Dispatch] Error inserting sale:", vErr);
            throw new Error(`Error al registrar la venta: ${vErr.message}`);
        }

        // 4. Update unit to VENDIDO_ONLINE and link to sale
        const { error: uErr } = await supabase.from('unidades').update({
            estado: 'VENDIDO_ONLINE',
            venta_id: venta.id,
            fecha_venta: new Date().toISOString()
        }).eq('id', unidad.id);

        if (uErr) {
            console.error("[Dispatch] Error updating unit to VENDIDO_ONLINE:", uErr);
            throw new Error("No se pudo marcar la unidad como vendida online.");
        }

        // 5. If there was a PREVIOUSLY reserved unit and it's DIFFERENT from this one, release it
        if (order.unidad_reservada_id && order.unidad_reservada_id !== unidad.id) {
            console.log(`[Dispatch] Releasing previously reserved unit: ${order.unidad_reservada_id}`);
            await supabase.from('unidades').update({
                estado: 'DISPONIBLE'
            }).eq('id', order.unidad_reservada_id);
        }

        // 6. Update order status in Local DB
        const { error: pError } = await supabase.from('pedidos_online').update({
            estado: 'DESPACHADO',
            unidad_reservada_id: unidad.id
        }).eq('id', pedidoId);

        if (pError) {
            console.error("[Dispatch] Error updating order status:", pError);
            throw new Error("El pedido se vendió pero no pudimos actualizar su estado final.");
        }

        // 7. SYNC WITH TIENDANUBE: Mark as Paid
        const accessToken = process.env.TIENDANUBE_ACCESS_TOKEN;
        const storeId = process.env.TIENDANUBE_STORE_ID;

        if (accessToken && storeId && order.tiendanube_id) {
            try {
                console.log(`[Dispatch] Syncing payment status to Tiendanube for Order ID: ${order.tiendanube_id}`);
                const tnResponse = await fetch(`https://api.tiendanube.com/v1/${storeId}/orders/${order.tiendanube_id}`, {
                    method: 'PUT',
                    headers: {
                        'Authentication': `bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Strawberry ERP (fernandezdemaussiontomas@gmail.com)'
                    },
                    body: JSON.stringify({
                        payment_status: 'paid'
                    })
                });

                if (tnResponse.ok) {
                    console.log(`[Dispatch] Tiendanube order ${order.tiendanube_id} marked as PAID.`);
                } else {
                    const errTxt = await tnResponse.text();
                    console.error(`[Dispatch] Failed to mark as paid in Tiendanube: ${errTxt}`);
                }
            } catch (syncErr) {
                console.error("[Dispatch] Exception syncing with Tiendanube:", syncErr.message);
            }
        }

        console.log(`[Dispatch] SUCCESS: Pedido #${order.nro_pedido} dispatched with unit ${qrCode}`);
        return { success: true };
    } catch (err) {
        console.error("[Dispatch] Fatal Error:", err.message);
        return { success: false, message: err.message };
    }
}

/**
 * Fetches all available stock items for a detailed inventory list.
 * This server action is used to avoid RLS limitations for non-admin users
 * in the inventory summary view.
 */
export async function getAvailableStockDetailed() {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('unidades')
        .select(`
            id, talle_especifico, ubicacion,
            variantes (id, color, precio_efectivo, precio_lista, modelos (id, descripcion, marca, tiendanube_id))
        `)
        .eq('estado', 'DISPONIBLE');

    if (error) {
        console.error("[Stock] Error fetching available stock:", error);
        return [];
    }

    return data || [];
}

/**
 * Assigns a warehouse location (zone) to a unit.
 */
export async function assignLocation(qrCode, location) {
    const supabase = createClient();
    try {
        // 1. Find the unit
        const { data: unit, error: fetchErr } = await supabase
            .from('unidades')
            .select('id, talle_especifico, variantes(color, modelos(descripcion))')
            .eq('codigo_qr', qrCode)
            .eq('estado', 'DISPONIBLE')
            .maybeSingle();

        if (fetchErr || !unit) {
            return { success: false, message: 'QR no encontrado o no disponible.' };
        }

        // 2. Update location
        const { error: updateErr } = await supabase
            .from('unidades')
            .update({ ubicacion: location.toUpperCase() })
            .eq('id', unit.id);

        if (updateErr) throw updateErr;

        return {
            success: true,
            details: `${unit.variantes.modelos.descripcion} (${unit.variantes.color}) T${unit.talle_especifico}`
        };
    } catch (err) {
        console.error("[Location] Error:", err.message);
        return { success: false, message: err.message };
    }
}

/**
 * Fetches unit details for a previously sold item to process an exchange.
 */
export async function getUnitForExchange(qrCode) {
    const supabase = createClient();
    try {
        const { data: unidad, error } = await supabase
            .from('unidades')
            .select('*, variantes(*, modelos(*, descripcion, marca)), ventas(*)')
            .eq('codigo_qr', qrCode)
            .in('estado', ['VENDIDO', 'VENDIDO_ONLINE'])
            .maybeSingle();

        if (error || !unidad) {
            return { success: false, message: 'Este QR no figura como vendido o no existe.' };
        }

        return { success: true, data: unidad };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Records a product exchange, returning one to stock and selling another.
 */
export async function recordProductExchange(oldUnitId, newUnitQR, difference, medio_pago, options = {}) {
    const supabase = createClient();
    const { monto_efectivo = 0, monto_otro = 0, otro_medio_pago = null, customerData = {} } = options;

    try {
        // 1. Process new unit sale first (to ensure availability)
        const result = await getUnitForSale(newUnitQR);
        if (!result.success) throw new Error(result.message);
        const newUnit = result.data;

        const { data: { user } } = await supabase.auth.getUser();

        // 2. Record difference sale if > 0
        let ventaId = null;
        if (difference > 0) {
            let totalDiferencia = difference;
            if (medio_pago === 'EFECTIVO') {
                totalDiferencia = Math.ceil((difference * (100 / 121)) / 1000) * 1000;
            } else if (medio_pago === 'DIVIDIR_PAGOS') {
                totalDiferencia = Number(monto_efectivo) + Number(monto_otro);
            }

            const { data: venta, error: vErr } = await supabase
                .from('ventas')
                .insert([{
                    medio_pago,
                    total: totalDiferencia,
                    user_id: user?.id || null,
                    monto_efectivo: medio_pago === 'DIVIDIR_PAGOS' ? monto_efectivo : (medio_pago === 'EFECTIVO' ? totalDiferencia : 0),
                    monto_otro: medio_pago === 'DIVIDIR_PAGOS' ? monto_otro : 0,
                    otro_medio_pago: medio_pago === 'DIVIDIR_PAGOS' ? otro_medio_pago : null,
                    tipo: 'DIFERENCIA_CAMBIO',
                    facturado: medio_pago === 'EFECTIVO' || (medio_pago === 'DIVIDIR_PAGOS' && Number(monto_otro) === 0),
                    nombre_cliente: customerData.nombre || null,
                    telefono_cliente: customerData.telefono || null,
                    email_cliente: customerData.email || null
                }])
                .select()
                .single();
            if (vErr) throw vErr;
            ventaId = venta.id;
        }

        // 3. Update new unit status to SOLD
        const { error: newErr } = await supabase.from('unidades').update({
            estado: 'VENDIDO',
            venta_id: ventaId,
            fecha_venta: new Date().toISOString()
        }).eq('id', newUnit.id);
        if (newErr) throw newErr;

        // 4. Return old unit to stock (DISPONIBLE)
        const { error: oldErr } = await supabase.from('unidades').update({
            estado: 'DISPONIBLE',
            venta_id: null,
            fecha_venta: null
        }).eq('id', oldUnitId);
        if (oldErr) throw oldErr;

        return { success: true };
    } catch (err) {
        return { success: false, message: 'No se pudo completar el cambio: ' + err.message };
    }
}

/**
 * Gets a summary of pending invoices grouped by responsible person.
 */
export async function getPendingInvoicesSummary() {
    const supabase = createClient();
    try {
        const { data, error } = await supabase
            .from('ventas')
            .select('id, medio_pago, otro_medio_pago, cuenta_destino')
            .eq('facturado', false)
            .not('medio_pago', 'in', '("EFECTIVO", "MAYORISTA_EFECTIVO", "TRANSFERENCIA_PROVEEDOR")');

        if (error) throw error;

        const summary = {
            sofi: 0, // Debit, Credit, QR
            tomi: 0, // Tiendanube, Transf. Tomi
            lucas: 0, // Transf. Lucas
            total: 0
        };

        data?.forEach(v => {
            let resp = 'tomi'; // Default (Tiendanube, etc)

            if (v.cuenta_destino === 'SOFI_MP') {
                resp = 'sofi';
            } else if (v.cuenta_destino === 'LUCAS') {
                resp = 'lucas';
            } else if (v.cuenta_destino === 'TOMI') {
                resp = 'tomi';
            } else {
                const mp = v.otro_medio_pago || v.medio_pago;
                if (['TARJETA_DEBITO', 'TARJETA_CREDITO', 'QR'].includes(mp)) {
                    resp = 'sofi';
                } else if (mp === 'TRANSFERENCIA' || mp === 'TRANSFERENCIA_LUCAS') {
                    resp = 'lucas';
                } else {
                    resp = 'tomi';
                }
            }

            summary[resp]++;
            summary.total++;
        });

        return { success: true, count: summary };
    } catch (err) {
        console.error("[getPendingInvoicesSummary] Error:", err);
        return { success: false, message: err.message };
    }
}

/**
 * Marks a sale as invoiced.
 */
export async function markAsInvoiced(ventaId) {
    const supabase = createClient();
    try {
        const { error } = await supabase
            .from('ventas')
            .update({ facturado: true })
            .eq('id', ventaId);
        if (error) throw error;
        return { success: true };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Gets the list of pending invoices.
 */
export async function getPendingInvoicesList() {
    const supabase = createClient();
    try {
        const { data, error } = await supabase
            .from('ventas')
            .select('*, profiles(nombre), unidades(*, variantes(*, modelos(*)))')
            .eq('facturado', false)
            .not('medio_pago', 'in', '("EFECTIVO", "MAYORISTA_EFECTIVO", "TRANSFERENCIA_PROVEEDOR")')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Uploads a product image provided as a Base64 string from the client.
 */
export async function uploadProductImage(variantId, base64Data) {
    const supabase = createClient();
    try {
        // Convert base64 to Buffer
        const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
        const fileName = `variant_${variantId}_${Date.now()}.jpg`;

        const { data, error } = await supabase
            .storage
            .from('productos')
            .upload(fileName, buffer, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw new Error(error.message);

        // Get Public URL
        const { data: { publicUrl } } = supabase
            .storage
            .from('productos')
            .getPublicUrl(fileName);

        // Update variant if provided
        if (variantId) {
            const { error: vErr } = await supabase
                .from('variantes')
                .update({ imagen_url: publicUrl })
                .eq('id', variantId);

            if (vErr) throw new Error(vErr.message);
        }

        return { success: true, url: publicUrl };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Gets the list of variants missing images.
 */
export async function getMissingImagesList() {
    const supabase = createClient();
    try {
        const { data, error } = await supabase
            .from('variantes')
            .select('*, modelos(*)')
            .is('imagen_url', null)
            .order('id', { ascending: false });

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        return { success: false, message: err.message };
    }
}
/**
 * Gets the last remito number to suggest the next one.
 */
export async function getLastRemito() {
    const supabase = createClient();
    try {
        const { data, error } = await supabase
            .from('compras')
            .select('nro_remito')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) return '0001-00000001';

        const raw = data.nro_remito;

        // Handle 0000-00000000 format
        if (raw.includes('-')) {
            const parts = raw.split('-');
            if (parts.length === 2) {
                const prefix = parts[0];
                const suffix = parts[1];
                const nextNum = (parseInt(suffix) + 1).toString().padStart(suffix.length, '0');
                // Check if nextNum is valid, otherwise return original
                if (!isNaN(parseInt(nextNum))) {
                    return `${prefix}-${nextNum}`;
                }
            }
        }

        // Fallback for purely numeric or other formats
        const lastNum = parseInt(raw);
        if (!isNaN(lastNum)) return (lastNum + 1).toString().padStart(raw.length, '0');

        return raw;
    } catch (err) {
        console.error("Error getting last remito:", err);
        return '0001-00000001';
    }
}

/**
 * Gets unique descriptions, colors and their associations for autocomplete.
 */
export async function getStockAutocompleteData() {
    const supabase = createClient();
    try {
        const { data: modelos, error: mErr } = await supabase
            .from('modelos')
            .select('descripcion, codigo_proveedor, id');

        if (mErr) throw mErr;

        const { data: variantes, error: vErr } = await supabase
            .from('variantes')
            .select('color, costo_promedio, modelo_id');

        if (vErr) throw vErr;

        const descriptions = Array.from(new Set(modelos.map(m => m.descripcion?.toUpperCase()))).filter(Boolean);
        const colors = Array.from(new Set(variantes.map(v => v.color?.toUpperCase()))).filter(Boolean);

        // Map for quick lookup: { "KALI": { codigo: "LS123", colors: { "NEGRO": 5000 } } }
        const lookup = {};
        modelos.forEach(m => {
            const desc = m.descripcion?.toUpperCase();
            if (!desc) return;
            if (!lookup[desc]) lookup[desc] = { codigo: m.codigo_proveedor, colors: {} };

            const mVariantes = variantes.filter(v => v.modelo_id === m.id);
            mVariantes.forEach(v => {
                const color = v.color?.toUpperCase();
                if (color) {
                    lookup[desc].colors[color] = v.costo_promedio;
                }
            });
        });

        return { descriptions, colors, lookup };
    } catch (err) {
        console.error("Error getting autocomplete data:", err);
        return { descriptions: [], colors: [], lookup: {} };
    }
}

export async function migratePricing() {
    const supabase = createClient();
    try {
        const { data: variantes, error } = await supabase
            .from('variantes')
            .select('id, costo_promedio')
            .gt('costo_promedio', 0);

        if (error) throw error;
        console.log(`Migrating ${variantes.length} items...`);

        for (const v of variantes) {
            const precioEfectivo = (v.costo_promedio * 2) + 3000;

            await supabase
                .from('variantes')
                .update({
                    precio_efectivo: precioEfectivo
                })
                .eq('id', v.id);
        }

        return { success: true, message: `Migración completada: ${variantes.length} productos actualizados.` };
    } catch (err) {
        console.error("Migration Error:", err);
        return { success: false, message: err.message };
    }
}

/**
 * Fetches recent units sold with their sale data for management.
 */
export async function getRecentSalesList(search = '') {
    const supabase = createClient();

    let query = supabase
        .from('unidades')
        .select(`
            id, fecha_venta, estado,
            codigo_qr,
            venta_id,
            ventas (id, total, medio_pago, monto_neto),
            variantes!inner (color, modelos!inner (descripcion))
        `)
        .in('estado', ['VENDIDO', 'VENDIDO_ONLINE'])
        .order('fecha_venta', { ascending: false });

    if (search) {
        query = query.or(`codigo_qr.ilike.%${search}%,variantes.color.ilike.%${search}%,variantes.modelos.descripcion.ilike.%${search}%`);
    }

    const { data, error } = await query.limit(search ? 100 : 50);

    if (error) {
        console.error("[getRecentSalesList] Error:", error);
        return [];
    }

    // Standardize the shape to avoid any SSR/Client differences
    return (data || []).map(u => ({
        ...u,
        ventas: Array.isArray(u.ventas) ? u.ventas[0] : u.ventas
    }));
}

/**
 * Records a transfer between two accounts.
 */
export async function recordTransfer({ from, to, amount, reason, person }) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const montoNum = Math.abs(parseFloat(amount));

    // 1. Withdrawal (EGRESO) from Source
    const { error: outErr } = await supabase
        .from('movimientos_caja')
        .insert([{
            monto: -montoNum,
            tipo: 'EGRESO',
            motivo: `TRASPASO -> ${to}: ${reason}`,
            persona: person.trim().toUpperCase(),
            cuenta: from,
            categoria: 'TRASPASO',
            user_id: user?.id || null
        }]);

    if (outErr) throw outErr;

    // 2. Deposit (INGRESO) to Destination
    const { error: inErr } = await supabase
        .from('movimientos_caja')
        .insert([{
            monto: montoNum,
            tipo: 'INGRESO',
            motivo: `TRASPASO <- ${from}: ${reason}`,
            persona: person.trim().toUpperCase(),
            cuenta: to,
            categoria: 'TRASPASO',
            user_id: user?.id || null
        }]);

    if (inErr) throw inErr;

    return { success: true };
}


export async function sendToInvoiceSheet(ventaId) {
    const supabase = createClient();

    try {
        const { data: venta, error: vErr } = await supabase
            .from('ventas')
            .select('*, unidades(*, variantes(*, modelos(*)))')
            .eq('id', ventaId)
            .single();

        if (vErr) throw vErr;

        const amount = venta.medio_pago === 'DIVIDIR_PAGOS' ? venta.monto_otro : venta.total;

        // Determine emisor (taxpayer)
        let emisor = 'tomi'; // Default fallback
        const account = (venta.cuenta_destino || '').toUpperCase();
        const method = (venta.medio_pago || '').toUpperCase();

        if (method.includes('TARJETA') || method.includes('QR') || account.includes('SOFI')) {
            emisor = 'sofi';
        } else if (method.includes('LUCAS') || account.includes('LUCAS')) {
            emisor = 'lucas';
        } else {
            emisor = 'tomi';
        }

        const sheetData = {
            id: venta.id,
            fecha: new Date(venta.created_at).toLocaleString('es-AR'),
            cliente: venta.nombre_cliente || 'Consumidor Final',
            tipo_doc: 'CF',
            nro_doc: '0',
            total: amount,
            medio_pago: 'TARJETA',
            emisor: emisor
        };

        await appendToSheet(sheetData);

        // Update database to mark that it was sent to sheet
        const { error: updErr } = await supabase
            .from('ventas')
            .update({ facturado: true, cae: 'EN_PLANILLA' }) // Placeholder to know it's in progress
            .eq('id', ventaId);

        if (updErr) throw updErr;

        return { success: true };
    } catch (err) {
        console.error("sendToInvoiceSheet error:", err);
        return { success: false, message: err.message };
    }
}

/**
 * One-time action to fix prices for variants purchased from 'Proveedor'
 * applying the new rounding logic.
 */
export async function fixProveedorPrices() {
    const supabase = createClient();
    try {
        // 1. Find all variants
        const { data: variants, error } = await supabase
            .from('variantes')
            .select(`
                id, 
                costo_promedio,
                precio_lista,
                precio_efectivo
            `)
            .not('costo_promedio', 'is', null);

        if (error) throw error;

        // 2. Find all purchases from 'Proveedor'
        const { data: proveedorPurchases } = await supabase
            .from('compras')
            .select('id')
            .eq('propietario', 'Proveedor');

        const purchaseIds = (proveedorPurchases || []).map(p => p.id);

        if (purchaseIds.length === 0) return { success: true, updated: 0 };

        // 3. Find variants involved in those purchases
        const { data: proveedorDetail } = await supabase
            .from('detalle_compras')
            .select('variante_id')
            .in('compra_id', purchaseIds);

        const proveedorVariantIds = new Set((proveedorDetail || []).map(d => d.variante_id));

        let count = 0;
        for (const v of variants) {
            if (proveedorVariantIds.has(v.id)) {
                // Recalculate BOTH prices to ensure total consistency
                const rawPrecioLista = v.costo_promedio * 2.42;
                const newPriceLista = roundListPrice(rawPrecioLista);
                const newPriceEfectivo = (v.costo_promedio * 2) + 3000;

                if (newPriceLista !== v.precio_lista || newPriceEfectivo !== v.precio_efectivo) {
                    const { error: updErr } = await supabase
                        .from('variantes')
                        .update({
                            precio_lista: newPriceLista,
                            precio_efectivo: newPriceEfectivo
                        })
                        .eq('id', v.id);
                    if (!updErr) count++;
                }
            }
        }

        return { success: true, updated: count };
    } catch (err) {
        console.error("fixProveedorPrices Error:", err);
        return { success: false, message: err.message };
    }
}

/**
 * Fetches all pending deposits (señas).
 */
export async function getPendingSenasList() {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('ventas')
        .select(`
            *,
            unidades (
                id, talle_especifico, codigo_qr, 
                variantes (color, modelos (descripcion))
            )
        `)
        .eq('tipo', 'SENA')
        .order('fecha', { ascending: false });

    if (error) {
        console.error("[getPendingSenasList] Error:", error);
        return [];
    }
    return data || [];
}

/**
 * Completes a pending deposit with the final payment.
 */
export async function completeSena(ventaId, paymentData) {
    const supabase = createClient();
    const { monto_efectivo, monto_otro, medio_pago, cuenta_destino } = paymentData;

    // 1. Update the sale record
    const { data: venta, error: vErr } = await supabase
        .from('ventas')
        .select('*')
        .eq('id', ventaId)
        .single();

    if (vErr) throw vErr;

    const newMontoEfectivo = (venta.monto_efectivo || 0) + (Number(monto_efectivo) || 0);
    const newMontoOtro = (venta.monto_otro || 0) + (Number(monto_otro) || 0);

    const { error: updateVErr } = await supabase
        .from('ventas')
        .update({
            tipo: 'VENTA_LOCAL',
            monto_efectivo: newMontoEfectivo,
            monto_otro: newMontoOtro,
            medio_pago: medio_pago || venta.medio_pago,
            cuenta_destino: cuenta_destino || venta.cuenta_destino
        })
        .eq('id', ventaId);

    if (updateVErr) throw updateVErr;

    // 2. Update units to VENDIDO
    const { error: uErr } = await supabase
        .from('unidades')
        .update({ estado: 'VENDIDO', fecha_venta: new Date().toISOString() })
        .eq('venta_id', ventaId);

    if (uErr) throw uErr;

    return { success: true };
}
