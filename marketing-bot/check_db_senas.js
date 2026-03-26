const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/tomasfernandez/strawberry/marketing-bot/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
    console.log("Checking for pending senas...");
    const { data: senas } = await supabase
        .from('ventas')
        .select('id, tipo, nombre_cliente, total, monto_efectivo, monto_otro, fecha')
        .eq('tipo', 'SENA')
        .order('fecha', { ascending: false });
    
    console.log(JSON.stringify(senas, null, 2));

    console.log("\nChecking for latest 5 sales today...");
    const { data: sales } = await supabase
        .from('ventas')
        .select('id, tipo, nombre_cliente, total, fecha')
        .eq('tipo', 'VENTA_LOCAL')
        .order('fecha', { ascending: false })
        .limit(5);
    
    console.log(JSON.stringify(sales, null, 2));
}
check();
