import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function fetchAll(table, selectStr) {
    let allData = [];
    let from = 0;
    let to = 999;
    let finished = false;
    
    while (!finished) {
        const { data, error } = await supabase.from(table).select(selectStr).range(from, to);
        if (error) throw error;
        if (!data || data.length === 0) {
            finished = true;
        } else {
            allData = allData.concat(data);
            if (data.length < 1000) {
                finished = true;
            } else {
                from += 1000;
                to += 1000;
            }
        }
    }
    return allData;
}

async function audit() {
    const now = new Date();
    
    console.log("Fetching sales and movements...");
    const [sales, movements] = await Promise.all([
        fetchAll('ventas', 'id, created_at, total, monto_efectivo, monto_neto, fecha_acreditacion, cuenta_destino, medio_pago, tipo, otro_medio_pago, monto_otro, nombre_cliente'),
        fetchAll('movimientos_caja', 'id, monto, cuenta, categoria, tipo, persona, created_at, motivo')
    ]);
    
    console.log(`Fetched ${sales.length} sales and ${movements.length} movements.`);
    
    let tomiBalance = 0;
    let tomiItems = [];
    
    // Process Sales
    sales.forEach(s => {
        const total = parseFloat(s.total) || 0;
        const efe = parseFloat(s.monto_efectivo) || 0;
        const rawNeto = s.monto_neto;
        const other = rawNeto != null ? parseFloat(rawNeto) : (total - efe);
        
        if (other > 0 || efe > 0) {
            let target = s.cuenta_destino;
            if (!target) {
                const mp = s.medio_pago === 'DIVIDIR_PAGOS' ? s.otro_medio_pago : s.medio_pago;
                const mpUpper = (mp || '').toUpperCase();
                
                if (mpUpper.includes('TIENDANUBE')) target = 'TOMI';
                else if (mpUpper === 'TRANSFERENCIA_LUCAS' || mpUpper === 'TRANSFERENCIA') target = 'LUCAS';
                else if (mpUpper === 'TRANSFERENCIA_TOMI') target = 'TOMI';
                else if (mpUpper === 'TRANSFERENCIA_PROVEEDOR') target = 'PROVEEDOR';
                else if (['TARJETA_DEBITO', 'TARJETA_CREDITO', 'QR', 'QR_LISTA'].includes(mpUpper)) {
                    target = 'SOFI_MP';
                }
                else target = 'DESCONOCIDO';
            }
            
            if (target === 'TOMI') {
                const isOnline = s.tipo === 'VENTA_ONLINE' || (s.medio_pago && s.medio_pago.toUpperCase().includes('TIENDANUBE'));
                const needsAccreditationCheck = isOnline; // only online for TOMI
                
                const hasAccDate = !!s.fecha_acreditacion;
                let isAcredited = false;
                
                if (!needsAccreditationCheck) {
                    isAcredited = true;
                } else if (hasAccDate) {
                    const accDate = new Date(s.fecha_acreditacion);
                    isAcredited = accDate <= now;
                }
                
                if (isAcredited) {
                    tomiBalance += other;
                    tomiItems.push({
                        fecha: s.fecha_acreditacion || s.created_at,
                        fecha_creacion: s.created_at,
                        tipo: 'INGRESO',
                        categoria: 'VENTA',
                        monto: other,
                        detalle: `Venta: ${s.medio_pago} (ID: ${s.id})`,
                        persona: s.nombre_cliente,
                        estado: 'Acreditado',
                        origen: 'ventas',
                        id: s.id
                    });
                } else {
                    tomiItems.push({
                        fecha: s.fecha_acreditacion || s.created_at,
                        fecha_creacion: s.created_at,
                        tipo: 'INGRESO',
                        categoria: 'VENTA',
                        monto: other,
                        detalle: `Venta (PENDIENTE): ${s.medio_pago} (ID: ${s.id})`,
                        persona: s.nombre_cliente,
                        estado: 'Pendiente',
                        origen: 'ventas',
                        id: s.id
                    });
                }
            }
        }
    });
    
    // Process Movements
    movements.forEach(m => {
        if (m.cuenta === 'TOMI') {
            const montoVal = parseFloat(m.monto) || 0;
            tomiBalance += montoVal;
            tomiItems.push({
                fecha: m.created_at,
                fecha_creacion: m.created_at,
                tipo: m.tipo,
                categoria: m.categoria,
                monto: montoVal,
                detalle: m.motivo,
                persona: m.persona,
                estado: 'Acreditado',
                origen: 'movimientos_caja',
                id: m.id
            });
        }
    });
    
    console.log(`\n--- AUDIT RESULTS FOR TOMI ---`);
    console.log(`Calculated TOMI Balance: $${tomiBalance.toFixed(2)}`);
    
    // Sort items chronologically to trace it
    tomiItems.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    // Calculate running balance for accredited items
    let runningAccredited = 0;
    tomiItems.forEach(item => {
        if (item.estado === 'Acreditado') {
            runningAccredited += item.monto;
        }
        item.running_balance = runningAccredited;
    });
    
    // Print the last 15 items
    console.log("\nLast 15 items in chronological order:");
    tomiItems.slice(-15).forEach(item => {
        console.log(`[${item.fecha}] ${item.estado} | ${item.tipo} | ${item.categoria} | Monto: $${item.monto.toFixed(2)} | Balance: $${item.running_balance.toFixed(2)} | Detalle: ${item.detalle} | Persona: ${item.persona}`);
    });
    
    // Print stats of items
    const ventasAcreditadas = tomiItems.filter(i => i.origen === 'ventas' && i.estado === 'Acreditado');
    const ventasPendientes = tomiItems.filter(i => i.origen === 'ventas' && i.estado === 'Pendiente');
    const movsCaja = tomiItems.filter(i => i.origen === 'movimientos_caja');
    
    const sumVentasAcr = ventasAcreditadas.reduce((sum, i) => sum + i.monto, 0);
    const sumVentasPend = ventasPendientes.reduce((sum, i) => sum + i.monto, 0);
    const sumMovs = movsCaja.reduce((sum, i) => sum + i.monto, 0);
    
    console.log(`\nSummary Statistics:`);
    console.log(`- Accredited Sales: ${ventasAcreditadas.length} items, Total: $${sumVentasAcr.toFixed(2)}`);
    console.log(`- Pending Sales: ${ventasPendientes.length} items, Total: $${sumVentasPend.toFixed(2)}`);
    console.log(`- Cash Movements: ${movsCaja.length} items, Total: $${sumMovs.toFixed(2)}`);
    console.log(`- Total (Acr Sales + Movs): $${(sumVentasAcr + sumMovs).toFixed(2)}`);
    console.log(`- Grand Total (inc. Pending): $${(sumVentasAcr + sumMovs + sumVentasPend).toFixed(2)}`);
}

audit().catch(console.error);
