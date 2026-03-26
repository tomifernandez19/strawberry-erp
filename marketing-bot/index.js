require('dotenv').config();
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const resendApiKey = process.env.RESEND_API_KEY;

// Llaves de TiendaNube oficial
const tnToken = process.env.TIENDANUBE_ACCESS_TOKEN;
const tnStoreId = "1335447";

// 📸 Motor de Imagen Avanzado de GOOGLE
const googleApiKey = process.env.GOOGLE_API_KEY;
const googleGcpProjectId = process.env.GOOGLE_GCP_PROJECT_ID; // Opcional si usa Vertex AI

const logPath = path.join(__dirname, 'sent_log.json');

if (!supabaseUrl || !supabaseAnonKey || !resendApiKey) {
    console.warn("⚠️  [Marketing Bot] Pausado: Faltan llaves de acceso en el archivo .env aislado.");
    process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const resend = new Resend(resendApiKey);

async function getHighQualityImagesFromTiendanube(tiendanube_id) {
    if (!tiendanube_id || !tnToken) return [];
    try {
        const response = await fetch(`https://api.tiendanube.com/v1/${tnStoreId}/products/${tiendanube_id}?fields=images`, {
            headers: {
                'Authentication': `bearer ${tnToken}`,
                'User-Agent': `Strawberry Bot (tomas@example.com)`
            }
        });
        const data = await response.json();
        if (data && data.images && data.images.length > 0) {
            return data.images.map(img => img.src);
        }
    } catch (e) {
        console.error("No se pudo obtener las fotos de TN");
    }
    return [];
}

/**
 * 🎨 LUXURY ARENA PROMPT ENGINE
 * Implementamos el nuevo formato de prompt de alta gama solicitado por el usuario.
 */
function generateAdaptivePrompt(description) {
    const desc = description.toUpperCase();
    return `Luxury professional product photography of the ${desc}. The footwear sits on a textured microcement podium in a warm sand (arena) tone, matte finish. Pure white background (#FFFFFF), clean studio backdrop, no gradients, no color cast. Soft top-down studio lighting with subtle, controlled shadows only beneath the product. Elegant soft reflections. Ultra-sharp focus on leather textures, high-end fashion magazine style. 8k resolution, cinematic lighting. The product must look exactly as in the reference image.

Generate 3 images:
- A pair of shoes, positioned elegantly.
- A single shoe, side view.
- A single shoe, front view.

High-key lighting, overexposed white background but correctly exposed product. Consistent styling across all images.`;
}

async function fetchSmartLowStock() {
    console.log("🧠 Analizando oportunidades de mercado...");
    const { data: stockData, error: stockErr } = await supabase
        .from('unidades')
        .select(`
            variante_id,
            variantes!inner (id, color, precio_efectivo, precio_lista, imagen_url, modelos!inner (id, descripcion, marca, tiendanube_id))
        `)
        .eq('estado', 'DISPONIBLE');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: soldData } = await supabase
        .from('unidades')
        .select('variante_id')
        .in('estado', ['VENDIDO', 'VENDIDO_ONLINE'])
        .gte('fecha_venta', thirtyDaysAgo.toISOString());

    if (stockErr) return [];

    const velocityMap = {};
    if (soldData) {
        soldData.forEach(u => {
            if (u.variante_id) velocityMap[u.variante_id] = (velocityMap[u.variante_id] || 0) + 1;
        });
    }

    const grouped = stockData.reduce((acc, unit) => {
        const key = unit.variante_id;
        if (!key) return acc;
        if (!acc[key]) {
            acc[key] = { ...unit.variantes, count: 0, sales_30d: velocityMap[key] || 0 };
        }
        acc[key].count++;
        return acc;
    }, {});

    const smartOpportunities = Object.values(grouped)
        .filter(item => item.modelos?.tiendanube_id)
        .sort((a, b) => {
            // Priorizamos mayor volumen de ventas (lo que rota)
            if (b.sales_30d !== a.sales_30d) {
                return b.sales_30d - a.sales_30d;
            }
            // A igual ventas, elegimos el que tiene MENOS stock (mayor urgencia)
            return a.count - b.count;
        });

    // Seleccionamos los 3 modelos con más potencial de hoy
    const dailySelection = smartOpportunities.slice(0, 3);

    // ANALIZAMOS DISEÑO Y GENERAMOS PROMPTS ADAPTATIVOS
    for (let item of dailySelection) {
        if (item.modelos?.tiendanube_id) {
            const hdPhotos = await getHighQualityImagesFromTiendanube(item.modelos.tiendanube_id);
            const desc = item.modelos.descripcion;
            
            // Unimos las de TN con la del ERP si es distinta
            const allImages = [...new Set([item.imagen_url, ...hdPhotos].filter(Boolean))];
            
            item.all_photos = allImages;
            item.google_studio_prompt = generateAdaptivePrompt(desc);
            console.log(`✅ Creative Direction lista para: ${desc}`);
        }
    }

    return dailySelection;
}

function buildDailyEmailHtml(opportunities) {
    if (opportunities.length === 0) {
        return `<p>Hoy no hay novedades críticas.</p>`;
    }

    const cards = opportunities.map(item => {
        const desc = item.modelos?.descripcion?.toUpperCase() || '';
        
        // Renderizar todas las fotos encontradas
        const photoGallery = (item.all_photos || []).map(p => 
            `<img src="${p}" style="width: 100%; max-height: 350px; object-fit: contain; background: #fdfdfd; border-bottom: 1px solid #000; margin-bottom: 10px;">`
        ).join('');

        return `
        <div style="background: #ffffff; border: 1px solid #000; margin-bottom: 50px; font-family: 'Courier New', Courier, monospace;">
            <div style="padding: 20px; border-bottom: 2px solid #000; background: #000; color: #fff; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold; letter-spacing: 2px;">BRIEF DE PRODUCCIÓN</span>
                <span style="font-size: 0.8rem; opacity: 0.8;">ASSET #${Math.floor(Math.random()*1000)}</span>
            </div>
            
            <div style="display: flex; flex-direction: column;">
                <div style="display: flex; flex-direction: column; background: #fdfdfd;">
                    ${photoGallery}
                </div>
                
                <div style="padding: 30px;">
                    <h2 style="font-size: 1.8rem; margin: 0 0 10px 0; color: #000; text-transform: uppercase;">${item.modelos?.descripcion}</h2>
                    <p style="margin: 0 0 25px 0; color: #444; font-size: 0.9rem;">Color: ${item.color} | Stock Actual: ${item.count} | ${item.modelos?.marca}</p>

                    <div style="background: #fff; border: 1px solid #000; padding: 20px; margin-bottom: 30px; background: #fcfcfc;">
                        <p style="margin: 0 0 10px 0; font-size: 0.75rem; font-weight: bold; color: #000;">PROMPT DIRECTORAL PARA AI STUDIO (V2.0):</p>
                        <p style="margin: 0; font-size: 0.9rem; line-height: 1.6; color: #000; font-family: 'Helvetica', sans-serif;">
                            ${item.google_studio_prompt.replace(/\n/g, '<br>')}
                        </p>
                    </div>

                    <div style="background: #000; color: #fff; padding: 25px;">
                        <p style="margin: 0 0 10px 0; font-size: 0.75rem; font-weight: bold; opacity: 0.7;">RECURSO: COPY SOCIAL MEDIA SUGERIDO</p>
                        <p style="margin: 0; font-size: 1rem; line-height: 1.5; color: #fff;">
                            "Elegancia urbana todos los días. 🍷<br>
                            Miren lo bomba que queda el ${item.modelos?.descripcion} puesto.<br><br>
                            ⚠️ Atención: ÚLTIMAS ${item.count} CURVAS en stock.<br>
                            Link en bio. ❤️"
                        </p>
                    </div>
                </div>
            </div>
        </div>
        `;
    }).join('');

    return `
    <div style="background: #ffffff; padding: 50px 20px; font-family: 'Courier New', Courier, monospace; color: #000;">
        <div style="max-width: 650px; margin: 0 auto;">
            <div style="text-align: center; border-bottom: 4px solid #000; padding-bottom: 30px; margin-bottom: 50px;">
                <h1 style="font-size: 2.5rem; margin: 0; letter-spacing: 5px; font-weight: 900;">DIRECTOR'S BRIEF</h1>
                <p style="margin: 10px 0 0 0; font-size: 0.9rem; letter-spacing: 2px;">STRAWBERRY • CREATIVE DEPT • ${new Date().toLocaleDateString('es-AR')}</p>
            </div>
            ${cards}
            <div style="text-align: center; font-size: 0.7rem; opacity: 0.4;">
                Este brief es confidencial y para uso exclusivo del Director de Marketing.
            </div>
        </div>
    </div>`;
}

async function triggerDailyMarketing() {
    try {
        console.log("🎬 [DIRECTOR'S BRIEF] Preparando material de alta gama...");
        const insights = await fetchSmartLowStock();

        if (insights.length === 0) {
            console.log("Nada urgente para producir hoy.");
            return;
        }

        const htmlBody = buildDailyEmailHtml(insights);

        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: ['fernandezdemaussiontomas@gmail.com'],
            subject: `🎬 Creative Brief: Campañas de Hoy`,
            html: htmlBody,
        });

        if (error) {
            console.error("❌ Error en despacho creativa:", error);
        } else {
            console.log("✅ Brief Directoral enviado. Producción en curso. Id:", data.id);
            // Guardar log de éxito para evitar duplicados hoy
            const today = new Date().toISOString().split('T')[0];
            fs.writeFileSync(logPath, JSON.stringify({ last_sent_date: today }));
        }
    } catch (e) {
        console.error("💥 Error fatal del robot:", e);
    }
}

async function checkAndTriggerProduccion() {
    console.log("🔍 [Check] Verificando si el brief de hoy ya fue enviado...");
    try {
        const today = new Date().toISOString().split('T')[0];
        let lastSent = "";
        
        if (fs.existsSync(logPath)) {
            const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
            lastSent = data.last_sent_date;
        }

        if (lastSent === today) {
            console.log("✅ El brief de hoy ya se envió. Descansando hasta mañana.");
            return;
        }

        // Si no se envió hoy, verificamos si es hora de mandar (Post 10:00 AM)
        const now = new Date();
        const hour = now.getHours();
        
        if (hour >= 10) {
            console.log("🚀 No se envió el brief hoy y ya pasaron las 10:00 AM. Mandando ahora...");
            await triggerDailyMarketing();
        } else {
            console.log("⏳ Todavía no son las 10:00 AM. Esperando al cron...");
        }
    } catch (e) {
        console.error("Error en el check persistente:", e);
    }
}

// Escuchar cada 30 minutos (por si se olvidó o prendió la PC tarde)
cron.schedule('*/30 * * * *', () => { 
    checkAndTriggerProduccion(); 
}, { timezone: "America/Argentina/Buenos_Aires" });

// Ejecutar check inmediato al prender la PC
checkAndTriggerProduccion();

console.log("🚀 [Marketing Bot] Motor inteligente activo. Revisión cada 30 min.");
