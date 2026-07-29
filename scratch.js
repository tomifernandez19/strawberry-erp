import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function calculateAverage() {
    let allData = [];
    let from = 0;
    let to = 999;
    let finished = false;
    
    while (!finished) {
        const { data, error } = await supabase.from('ventas').select('created_at, total, monto_neto').range(from, to);
        if (error) throw error;
        if (!data || data.length === 0) {
            finished = true;
        } else {
            allData = allData.concat(data);
            if (data.length < 1000) finished = true;
            else {
                from += 1000;
                to += 1000;
            }
        }
    }
    
    const monthlyTotals = {};
    allData.forEach(sale => {
        const date = new Date(sale.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const neto = sale.monto_neto != null ? parseFloat(sale.monto_neto) : parseFloat(sale.total);
        monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + neto;
    });
    
    console.log("Monthly Totals:", monthlyTotals);
    
    const months = Object.keys(monthlyTotals);
    if (months.length === 0) {
        console.log("No sales found.");
        return;
    }
    
    const totalRevenue = Object.values(monthlyTotals).reduce((sum, val) => sum + val, 0);
    const avg = totalRevenue / months.length;
    
    console.log(`\nTotal Months: ${months.length}`);
    console.log(`Average Monthly Revenue: $${avg.toFixed(2)}`);
}

calculateAverage();
