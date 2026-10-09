/**
 * Sube fotos de Google Drive a los productos de Tiendanube que no tienen imagen,
 * y carga descripciones a los que tienen una descripción corta (< 25 caracteres).
 *
 * Reglas:
 *  - Solo productos con stock (al menos una variante con stock > 0).
 *  - Fotos: solo a productos sin ninguna imagen en Tiendanube.
 *  - Carpeta de Drive: <raíz>/<PROVEEDOR>/<fotos>. Cada foto se llama "MODELO" o "MODELO COLOR"
 *    (ej. "VERA NEGRO", "SABADELL CHOCO", "UDINE"). Se ignoran las fotos sin nombre de
 *    producto (IMG_xxxx) y los videos.
 *  - Una foto aplica a todos los productos cuyo nombre empieza con el mismo modelo
 *    (ej. "ALBA GZA NEGRO" -> ALBA y ALBA GZA).
 *  - Foto sin color: muestra todos los colores, va al producto sin asignar variante.
 *    Foto con color: va al producto solo si tiene ese color, y se asigna a esas variantes.
 *  - Descripciones: solo a productos con fotos en Drive. Los textos se escriben aparte
 *    (por ejemplo, pidiéndoselos a Claude mirando las fotos) en un JSON {"NOMBRE": "texto"}.
 *
 * Uso (desde la carpeta del proyecto, con .env.local completo; convierte HEIC con `sips`, solo macOS):
 *   node scripts/tiendanube-fotos-drive.mjs                       -> muestra qué haría, sin cambiar nada
 *   node scripts/tiendanube-fotos-drive.mjs --apply               -> sube las fotos
 *   node scripts/tiendanube-fotos-drive.mjs --apply --descripciones desc.json
 *                                                                 -> sube fotos y descripciones
 *
 * La cuenta de servicio de Google (GOOGLE_SERVICE_ACCOUNT_EMAIL) tiene que tener acceso a la carpeta.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';

dotenv.config({ path: '.env.local' });

const DRIVE_FOLDER_ID = '1deAeztKEQo3FXk5GBwEAiuc9snv9KHyn';
const MIN_DESC_LENGTH = 25;
const COLOR_ALIASES = { CHOCO: 'CHOCOLATE' };

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const descIdx = args.indexOf('--descripciones');
const DESC_FILE = descIdx >= 0 ? args[descIdx + 1] : null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
const stripHtml = s => (s || '').replace(/<[^>]+>/g, '').trim();

// ---------- Tiendanube ----------
const TN_BASE = `https://api.tiendanube.com/v1/${process.env.TIENDANUBE_STORE_ID}`;
const TN_HEADERS = {
    Authentication: `bearer ${process.env.TIENDANUBE_ACCESS_TOKEN}`,
    'User-Agent': 'ERP Strawberry Trejo',
    'Content-Type': 'application/json',
};

async function tn(method, url, body) {
    for (let i = 0; i < 5; i++) {
        const r = await fetch(TN_BASE + url, { method, headers: TN_HEADERS, body: body && JSON.stringify(body) });
        if (r.status === 429) { await sleep(2000); continue; }
        if (r.status === 404 && method === 'GET') return [];
        if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${await r.text()}`);
        await sleep(600);
        return r.json();
    }
    throw new Error(`${method} ${url}: demasiados reintentos`);
}

async function getProducts() {
    let all = [];
    for (let page = 1; ; page++) {
        const data = await tn('GET', `/products?per_page=200&page=${page}`);
        if (!data.length) return all;
        all = all.concat(data);
    }
}

const productName = p => clean(p.name?.es || Object.values(p.name || {})[0]);
const productDesc = p => stripHtml(p.description?.es || Object.values(p.description || {})[0]);
const hasStock = p => p.variants.some(v => v.stock == null || v.stock > 0);
const variantColor = v => clean((v.values || []).map(x => x.es).find(x => x && !/^\d+$/.test(x.trim())));
const colorWords = s => clean(s).split(' ').map(w => COLOR_ALIASES[w] || w);

// ---------- Google Drive ----------
const drive = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

async function listFolder(folderId) {
    let files = [], pageToken;
    do {
        const r = await drive.request({
            url: 'https://www.googleapis.com/drive/v3/files',
            params: { q: `'${folderId}' in parents and trashed=false`, fields: 'nextPageToken, files(id,name,mimeType)', pageSize: 1000, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true },
        });
        files = files.concat(r.data.files);
        pageToken = r.data.nextPageToken;
    } while (pageToken);
    return files;
}

async function listPhotos(rootId) {
    const photos = [];
    const stack = [rootId];
    while (stack.length) {
        for (const f of await listFolder(stack.pop())) {
            if (f.mimeType === 'application/vnd.google-apps.folder') stack.push(f.id);
            else if (f.mimeType.startsWith('image/') && !/^IMG_/i.test(f.name)) photos.push({ ...f, label: clean(f.name.replace(/\.[a-z0-9]+$/i, '')) });
        }
    }
    return photos;
}

// Download a Drive photo and return it as JPEG base64 (HEIC -> JPEG via sips)
async function photoAsJpegBase64(photo, tmpDir) {
    const r = await drive.request({ url: `https://www.googleapis.com/drive/v3/files/${photo.id}`, params: { alt: 'media', supportsAllDrives: true }, responseType: 'arraybuffer' });
    const src = path.join(tmpDir, photo.id);
    const out = src + '.jpg';
    fs.writeFileSync(src, Buffer.from(r.data));
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '-Z', '1600', src, '--out', out], { stdio: 'ignore' });
    return fs.readFileSync(out).toString('base64');
}

// ---------- Matching ----------
// Photos for a product: same model (first word); colored photos only if the product has that color.
function photosForProduct(product, photos) {
    const model = productName(product).split(' ')[0];
    const productColors = new Set(product.variants.flatMap(v => colorWords(variantColor(v))));
    const result = [];
    for (const photo of photos) {
        const words = photo.label.split(' ');
        if (words[0] !== model) continue;
        const color = words.slice(1).map(w => COLOR_ALIASES[w] || w).find(w => productColors.has(w) || ['NEGRO', 'CHOCOLATE', 'SUELA', 'CAMEL', 'BLANCO', 'TAUPE', 'HABANO', 'PLATA', 'PLATINO', 'LEOPARDO'].includes(w)) || null;
        if (color && !productColors.has(color)) continue;
        result.push({ ...photo, color });
    }
    // Generic photos first so the cover shows every color
    return result.sort((a, b) => (a.color ? 1 : 0) - (b.color ? 1 : 0) || a.label.localeCompare(b.label));
}

// ---------- Main ----------
const products = (await getProducts()).filter(hasStock);
const photos = await listPhotos(DRIVE_FOLDER_ID);
const descriptions = DESC_FILE ? Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(DESC_FILE, 'utf8'))).map(([k, v]) => [clean(k), v])) : {};
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-fotos-'));

console.log(`${products.length} productos con stock, ${photos.length} fotos con nombre en Drive${APPLY ? '' : '  (modo prueba: no se cambia nada)'}\n`);

const needDescription = [];
for (const p of products) {
    const name = productName(p);
    const matches = photosForProduct(p, photos);
    if (!matches.length) continue;

    if (!p.images?.length) {
        const colors = [...new Set(matches.map(m => m.color).filter(Boolean))];
        console.log(`FOTOS  ${name}: ${matches.length} (${matches.map(m => m.label).join(', ')})${colors.length ? ` -> variantes ${colors.join(', ')}` : ''}`);
        if (APPLY) {
            const colorImage = {};
            for (const [i, m] of matches.entries()) {
                const img = await tn('POST', `/products/${p.id}/images`, { attachment: await photoAsJpegBase64(m, tmpDir), filename: `${m.label.replace(/ /g, '_')}_${i + 1}.jpg`, position: i + 1 });
                if (m.color && !colorImage[m.color]) colorImage[m.color] = img.id;
            }
            for (const v of p.variants) {
                const c = colorWords(variantColor(v)).find(w => colorImage[w]);
                if (c) await tn('PUT', `/products/${p.id}/variants/${v.id}`, { image_id: colorImage[c] });
            }
        }
    }

    if (productDesc(p).length < MIN_DESC_LENGTH) {
        if (descriptions[name]) {
            console.log(`DESC   ${name}`);
            if (APPLY) await tn('PUT', `/products/${p.id}`, { description: { es: descriptions[name] } });
        } else {
            needDescription.push(name);
        }
    }
}

if (needDescription.length) {
    console.log(`\nNecesitan descripción (tienen fotos en Drive, falta el texto en el JSON): ${needDescription.join(', ')}`);
}
fs.rmSync(tmpDir, { recursive: true, force: true });
