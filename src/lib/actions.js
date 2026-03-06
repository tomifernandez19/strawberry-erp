'use server'
import { createClient } from './supabase/server'

/**
 * Creates a new purchase, creates models/variants if they don't exist,
 * and generates the units ready for QR assignment.
 */
export async function createPurchase({ nro_remito, items }) {
    const supabase = createClient();
    // 1. Process items to ensure models and variants exist
    const processedItems = []

    for (const item of items) {
        const { codigo_proveedor, descripcion, color, costo_unitario, talles } = item
        const supplierCode = codigo_proveedor.substring(0, 2)

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
            .select('id')
            .eq('modelo_id', modelo.id)
            .eq('color', color)
            .single()

        if (!variante) {
            const precioLista = Math.round(costo_unitario * 2.42);
            const precioEfectivo = Math.round(precioLista * (100 / 121));

            const { data: newVar, error: vErr } = await supabase
                .from('variantes')
                .insert([{
                    modelo_id: modelo.id,
                    color,
                    talle: 'CURVA',
                    precio_efectivo: precioEfectivo,
                    precio_lista: precioLista,
                    costo_promedio: costo_unitario
                }])
                .select()
                .single()
            if (vErr) throw vErr
            variante = newVar
        }

        processedItems.push({ ...item, variante_id: variante.id })
    }

    // 2. Insert the purchase (compra)
    const { data: { user } } = await supabase.auth.getUser();
    const overallSupplier = processedItems[0]?.codigo_proveedor.substring(0, 2) || 'Desconocido'
    const { data: compra, error: compraError } = await supabase
        .from('compras')
        .insert([{
            proveedor: overallSupplier,
            nro_remito,
            user_id: user?.id || null
        }])
        .select()
        .single()

    if (compraError) throw compraError

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
        if (unitsError) throw unitsError
    }

    return compra
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
        .maybeSingle() // Use maybeSingle to avoid errors if not found

    if (existing) {
        throw new Error('Este código QR ya está asignado a otro par.')
    }

    const { data, error } = await supabase
        .from('unidades')
        .update({
            codigo_qr: qrCode,
            estado: 'DISPONIBLE'
        })
        .eq('id', unitId)
        .eq('estado', 'PENDIENTE_QR') // Safety: only assign if pending
        .select()
        .single()

    if (error) throw error
    return data
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

        return { success: true, data: unidad };
    } catch (err) {
        console.error("[getUnitForSale] Fatal Error:", err.message);
        return { success: false, message: "Error interno: " + err.message };
    }
}

/**
 * Records a sale for a unit scanned via QR.
 */
export async function recordSale(qrCode, medio_pago, options = {}) {
    const supabase = createClient();
    const { monto_efectivo = 0, monto_otro = 0, otro_medio_pago = null } = options;

    // 1. Re-verify unit availability
    const result = await getUnitForSale(qrCode)
    if (!result.success) throw new Error(result.message)
    const unidad = result.data

    // 2. Determine price based on rules
    let finalPrice = unidad.variantes.precio_lista;
    if (medio_pago === 'EFECTIVO') {
        finalPrice = Math.round(unidad.variantes.precio_lista * (100 / 121));
    } else if (medio_pago === 'TRANSFERENCIA') {
        finalPrice = Math.round(unidad.variantes.precio_lista * (100 / 110));
    } else if (medio_pago === 'DIVIDIR_PAGOS') {
        finalPrice = Number(monto_efectivo) + Number(monto_otro);
    }

    // 3. Create the sale record
    const { data: { user } } = await supabase.auth.getUser();
    const { data: venta, error: ventaError } = await supabase
        .from('ventas')
        .insert([{
            medio_pago,
            total: finalPrice,
            user_id: user?.id || null,
            // These will work if the user ran the SQL
            monto_efectivo: medio_pago === 'DIVIDIR_PAGOS' ? monto_efectivo : (medio_pago === 'EFECTIVO' ? finalPrice : 0),
            monto_otro: medio_pago === 'DIVIDIR_PAGOS' ? monto_otro : 0,
            otro_medio_pago: medio_pago === 'DIVIDIR_PAGOS' ? otro_medio_pago : null
        }])
        .select()
        .single()

    if (ventaError) throw ventaError

    // 4. Update the unit status
    const { error: updateError } = await supabase
        .from('unidades')
        .update({
            estado: 'VENDIDO',
            venta_id: venta.id,
            fecha_venta: new Date().toISOString()
        })
        .eq('id', unidad.id)

    if (updateError) throw updateError

    return { venta, unidad }
}

/**
 * Fetches full product details and stock status for a model based on a single unit's QR.
 */
export async function getProductDetailsByQR(qrCode) {
    const supabase = createClient();
    // 1. Find the specific unit
    const { data: unidad, error: unitError } = await supabase
        .from('unidades')
        .select('*, variantes(*, modelos(*))')
        .eq('codigo_qr', qrCode)
        .maybeSingle()

    if (unitError || !unidad) {
        throw new Error('Código QR no encontrado en el sistema.')
    }

    // 2. Get all variants for this model to show available sizes
    const { data: siblingUnits, error: siblingsError } = await supabase
        .from('unidades')
        .select('talle_especifico, estado')
        .eq('variante_id', unidad.variante_id)
        .eq('estado', 'DISPONIBLE')

    // Count stock by size
    const stockBySize = siblingUnits.reduce((acc, curr) => {
        acc[curr.talle_especifico] = (acc[curr.talle_especifico] || 0) + 1
        return acc
    }, {})

    return {
        unit: unidad,
        model: unidad.variantes.modelos,
        variant: unidad.variantes,
        stockBySize: Object.entries(stockBySize).map(([talle, qty]) => ({ talle, qty }))
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
            ventas (total, medio_pago, user_id, profiles (nombre)),
            variantes (color, modelos (descripcion, codigo_proveedor))
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

    unitsSold.forEach(unit => {
        const saleDate = new Date(unit.fecha_venta);
        const total = parseFloat(unit.ventas?.total) || 0;

        const detailedItem = {
            id: unit.id,
            fecha: unit.fecha_venta,
            codigo: unit.variantes?.modelos?.codigo_proveedor,
            modelo: unit.variantes?.modelos?.descripcion,
            color: unit.variantes?.color,
            talle: unit.talle_especifico,
            precio: total,
            medio_pago: unit.ventas?.medio_pago,
            vendedor: unit.ventas?.profiles?.nombre || unit.ventas?.user_id
        };

        const update = (obj) => {
            obj.count++;
            obj.total += total;
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
            ventas (total, medio_pago, user_id, profiles (nombre)),
            variantes (color, modelos (descripcion, codigo_proveedor))
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
            items: [],
            error: true
        };
    }

    const stats = {
        count: 0,
        total: 0,
        items: []
    };

    unitsSold.forEach(unit => {
        const total = parseFloat(unit.ventas?.total) || 0;

        const detailedItem = {
            id: unit.id,
            fecha: unit.fecha_venta,
            codigo: unit.variantes?.modelos?.codigo_proveedor,
            modelo: unit.variantes?.modelos?.descripcion,
            color: unit.variantes?.color,
            talle: unit.talle_especifico,
            precio: total,
            medio_pago: unit.ventas?.medio_pago,
            vendedor: unit.ventas?.profiles?.nombre || unit.ventas?.user_id
        };

        stats.count++;
        stats.total += total;
        stats.items.push(detailedItem);
    });

    return stats;
}

/**
 * Fetches the sales summary for the current day.
 */
export async function recordCashMovement({ monto, tipo, motivo, persona }) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('movimientos_caja')
        .insert([{
            monto: tipo === 'EGRESO' ? -Math.abs(monto) : Math.abs(monto),
            tipo,
            motivo,
            persona,
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
            ventas (total, medio_pago, user_id, monto_efectivo, profiles (nombre)),
            variantes (color, modelos (descripcion, codigo_proveedor))
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
        return { count: 0, total: 0, cash: 0, items: [] };
    }

    const allItems = unitsSold.map(unit => ({
        id: unit.id,
        fecha: unit.fecha_venta,
        codigo: unit.variantes?.modelos?.codigo_proveedor,
        modelo: unit.variantes?.modelos?.descripcion,
        color: unit.variantes?.color,
        talle: unit.talle_especifico,
        precio: parseFloat(unit.ventas?.total) || 0,
        medio_pago: unit.ventas?.medio_pago,
        monto_efectivo: parseFloat(unit.ventas?.monto_efectivo) || 0,
        vendedor: unit.ventas?.user_id,
        vendedor_nombre: unit.ventas?.profiles?.nombre || 'S/D'
    }));

    // Cash Sales
    const cashSalesAmount = allItems.reduce((acc, item) => acc + item.monto_efectivo, 0);

    // Manual Movements Sum
    const movementsSum = (movements || []).reduce((acc, mov) => acc + (parseFloat(mov.monto) || 0), 0);

    // Total Cash in Hand = Sales + Manual Adjustments
    const cashInHand = cashSalesAmount + movementsSum;

    // Totals and items list can be PERSONALIZED
    const displayItems = onlyUserId
        ? allItems.filter(i => i.vendedor === onlyUserId)
        : allItems;

    const totalAmount = displayItems.reduce((acc, item) => acc + item.precio, 0);

    return {
        count: displayItems.length,
        total: totalAmount,
        cash: cashInHand,
        items: displayItems
    };
}

/**
 * Deletes a sale and reverts the associated unit to 'DISPONIBLE'.
 */
export async function deleteSale(saleId) {
    const supabase = createClient();
    // 1. Find the unit associated with this sale
    const { data: unit, error: unitError } = await supabase
        .from('unidades')
        .select('id')
        .eq('venta_id', saleId)
        .single();

    if (unit) {
        // 2. Revert unit status
        await supabase
            .from('unidades')
            .update({
                estado: 'DISPONIBLE',
                venta_id: null,
                fecha_venta: null
            })
            .eq('id', unit.id);
    }

    // 3. Delete the sale
    const { error: saleError } = await supabase
        .from('ventas')
        .delete()
        .eq('id', saleId);

    if (saleError) throw saleError;
    return true;
}

/**
 * Deletes a specific unit from stock.
 */
export async function deleteUnit(unitId) {
    const supabase = createClient();
    const { error } = await supabase
        .from('unidades')
        .delete()
        .eq('id', unitId);

    if (error) throw error;
    return true;
}

/**
 * Updates variant details (prices, color).
 */
export async function updateVariant(variantId, updates) {
    const supabase = createClient();
    const { error } = await supabase
        .from('variantes')
        .update(updates)
        .eq('id', variantId);

    if (error) throw error;
    return true;
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

export async function findUnitBySpecs(modelDescription, color, talle, sku = null) {
    const supabase = createClient();

    // 0. Robust Model Name Extraction
    // Tiendanube name examples: "JUSTI (NEGRO, 35)", "SABADELL - CAMEL", "SHARON"
    let baseModelName = (modelDescription || '').split(' (')[0].split(' - ')[0].trim();

    const cleanColor = (color || '').trim();
    const cleanTalle = String(talle || '').trim();

    console.log(`[Matching] Attempting: ${baseModelName} | ${cleanColor} | T${cleanTalle} | SKU: ${sku}`);

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
        const { data: nameVariants } = await supabase
            .from('variantes')
            .select(`
                id, color,
                modelos!inner(id, descripcion, codigo_proveedor)
            `)
            .ilike('modelos.descripcion', baseModelName);

        variants = nameVariants || [];
        if (variants.length > 0) {
            console.log(`[Matching] Found ${variants.length} variants by Model Name: ${baseModelName}`);
        }
    }

    if (variants.length === 0) {
        throw new Error(`No se encontró el modelo "${baseModelName}" o SKU "${sku}" en el ERP`);
    }

    // 2. Find the best matching variant among those found
    let matchingVariant = null;

    // A. Priority: Exact SKU match
    if (sku) {
        matchingVariant = variants.find(v => {
            const expectedSku = `${v.modelos.codigo_proveedor}-${v.color.substring(0, 3)}-${cleanTalle}`.toUpperCase();
            return sku.toUpperCase() === expectedSku;
        });
    }

    // B. Secondary: Color Name match
    if (!matchingVariant) {
        matchingVariant = variants.find(v =>
            v.color.toLowerCase() === cleanColor.toLowerCase() ||
            v.color.toLowerCase().includes(cleanColor.toLowerCase()) ||
            cleanColor.toLowerCase().includes(v.color.toLowerCase())
        );
    }

    if (!matchingVariant) {
        throw new Error(`No se encontró la variante "${cleanColor}" para el modelo encontrado`);
    }

    // 3. Find available unit
    const { data: unit, error: uError } = await supabase
        .from('unidades')
        .select('codigo_qr')
        .eq('variante_id', matchingVariant.id)
        .eq('talle_especifico', cleanTalle)
        .eq('estado', 'DISPONIBLE')
        .limit(1)
        .maybeSingle();

    if (uError || !unit) {
        throw new Error(`STOCK AGOTADO: No hay stock disponible de ${baseModelName} talle ${cleanTalle}`);
    }

    return unit.codigo_qr;
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
    const supabase = createClient();
    const accessToken = process.env.TIENDANUBE_ACCESS_TOKEN;
    const storeId = process.env.TIENDANUBE_STORE_ID; // Necesitaremos este dato
    const appUrl = 'https://strawberry-erp.vercel.app'; // Tu URL de Vercel

    console.log('Registering Webhook for Store:', storeId);
    if (!accessToken || !storeId) {
        console.error('Missing Tiendanube credentials in environment variables');
        return false;
    }

    const response = await fetch(`https://api.tiendanube.com/v1/${storeId}/webhooks`, {
        method: 'POST',
        headers: {
            'Authentication': `bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            event: 'order/created',
            url: `${appUrl}/api/webhooks/tiendanube`
        })
    });

    const data = await response.json();
    console.log('Tiendanube Webhook Response:', data);

    return response.ok;
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
        'Content-Type': 'application/json'
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
    const gateway = orderData.gateway || orderData.payment_details?.method || 'TIENDANUBE';

    const { data: pedido, error: pError } = await supabase
        .from('pedidos_online')
        .insert([{
            tiendanube_id: String(tnId),
            cliente_nombre: clienteNombre,
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
                user_id: user?.id || null
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
            variantes (id, color, precio_efectivo, precio_lista, modelos (id, descripcion, marca))
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
    const { monto_efectivo = 0, monto_otro = 0, otro_medio_pago = null } = options;

    try {
        // 1. Process new unit sale first (to ensure availability)
        const result = await getUnitForSale(newUnitQR);
        if (!result.success) throw new Error(result.message);
        const newUnit = result.data;

        const { data: { user } } = await supabase.auth.getUser();

        // 2. Record difference sale if > 0
        let ventaId = null;
        if (difference > 0) {
            const { data: venta, error: vErr } = await supabase
                .from('ventas')
                .insert([{
                    medio_pago,
                    total: difference,
                    user_id: user?.id || null,
                    monto_efectivo: medio_pago === 'DIVIDIR_PAGOS' ? monto_efectivo : (medio_pago === 'EFECTIVO' ? difference : 0),
                    monto_otro: medio_pago === 'DIVIDIR_PAGOS' ? monto_otro : 0,
                    otro_medio_pago: medio_pago === 'DIVIDIR_PAGOS' ? otro_medio_pago : null,
                    tipo: 'DIFERENCIA_CAMBIO'
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
