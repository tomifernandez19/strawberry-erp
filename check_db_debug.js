const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/tomasfernandez/strawberry/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    console.log("Checking ALL ventas...");
    const { data: all } = await supabase
        .from('ventas')
        .select('id, tipo, nombre_cliente, total, fecha')
        .order('fecha', { ascending: false })
        .limit(10);
    
    console.log(JSON.stringify(all, null, 2));
}
check();
