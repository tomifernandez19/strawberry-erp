import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    const { data: records, error } = await supabase
        .from('ventas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
        
    if (error) {
        console.error("Error fetching ventas:", error);
    } else {
        console.log("ventas recent records:", records);
        if (records.length > 0) {
            console.log("ventas keys:", Object.keys(records[0]));
        }
    }
}

run().catch(console.error);
