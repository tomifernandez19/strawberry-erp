import Afip from '@afipsdk/afip.js';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import { getAfipPersonFromAccount, AFIP_DATA } from './afip-utils';

/**
 * In-memory cache for AFIP instances to speed up warm starts in Vercel.
 */
let afipInstances = {};

/**
 * Initializes Afip SDK for a specific person.
 */
function getAfipInstance(person = 'tomi') {
    if (afipInstances[person]) {
        console.log(`[AFIP] Using cached instance for ${person}`);
        return afipInstances[person];
    }

    const keyPrefix = person.toUpperCase();
    const cuit = process.env[`AFIP_CUIT_${keyPrefix}`];
    let certStr = process.env[`AFIP_CERT_${keyPrefix}`];
    let keyStr = process.env[`AFIP_KEY_${keyPrefix}`];

    const production = process.env.AFIP_PRODUCTION === 'true';

    if (!cuit || !certStr || !keyStr) {
        throw new Error(`Configuración de ARCA (AFIP) incompleta para ${person.toUpperCase()}. Faltan CUIT o Certificados.`);
    }

    const sanitize = (val) => val?.trim()?.replace(/^["']|["']$/g, '')?.replace(/\\n/g, '\n')?.replace(/\r/g, '');

    certStr = sanitize(certStr);
    keyStr = sanitize(keyStr);

    const certPath = path.join('/tmp', `afip_${person}_cert.crt`);
    const keyPath = path.join('/tmp', `afip_${person}_key.key`);
    const taFolder = path.join('/tmp', `afip_ta_${person}`);

    if (!fs.existsSync(taFolder)) {
        fs.mkdirSync(taFolder, { recursive: true });
    }

    fs.writeFileSync(certPath, certStr);
    fs.writeFileSync(keyPath, keyStr);

    console.log(`[AFIP] Initializing instance for ${person}...`);
    const instance = new Afip({
        CUIT: parseInt(cuit),
        cert: certPath,
        key: keyPath,
        production: production,
        ta_folder: taFolder,
        // Common ways to pass timeout to underlying clients in various SDK versions
        timeout: 60000,
        http_options: { timeout: 60000 }
    });

    afipInstances[person] = instance;
    return instance;
}

/**
 * Creates an Electronic Invoice (Factura C) in AFIP.
 */
export async function createElectronicInvoice(venta, personOverride = null) {
    const person = personOverride || getAfipPersonFromAccount(venta.cuenta_destino);

    // TIME HACK: Overriding global Date.now temporarily to fix "Clock Drift" (same as the Python fix)
    // We make AFIP believe we are 5 minutes in the past so the ticket is always valid.
    const originalNow = Date.now;
    Date.now = () => originalNow() - 300000; // 5 minutes ago

    try {
        const afip = getAfipInstance(person);
        const puntoVenta = parseInt(process.env[`AFIP_POS_${person.toUpperCase()}`] || '1');
        const type = 11; // Factura C

        console.log(`[AFIP] Fetching last voucher for POS ${puntoVenta}...`);
        const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, type);

        // Restore date now right after the first AFIP call (where login happens)
        Date.now = originalNow;
        const nextVoucher = lastVoucher + 1;
        const amount = venta.medio_pago === 'DIVIDIR_PAGOS' ? venta.monto_otro : venta.total;

        const data = {
            CantReg: 1,
            PtoVta: puntoVenta,
            CbteTipo: type,
            Concepto: 1,
            DocTipo: 99,
            DocNro: 0,
            CbteDesde: nextVoucher,
            CbteHasta: nextVoucher,
            CbteFch: parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, '')),
            ImpTotal: amount,
            ImpTotConc: 0,
            ImpNeto: amount,
            ImpOpEx: 0,
            ImpIVA: 0,
            ImpTrib: 0,
            MonId: 'PES',
            MonCotiz: 1,
        };

        console.log(`[AFIP] Creating voucher ${nextVoucher}...`);
        const res = await afip.ElectronicBilling.createVoucher(data);

        return {
            success: true,
            cae: res.CAE,
            caution: res.CAEFchVto,
            cbte: nextVoucher,
            puntoVenta: puntoVenta
        };
    } catch (err) {
        // Ensure date is restored in case of early error
        Date.now = originalNow;

        console.error("--- DEBUG ARCA ERROR START ---");
        console.error("Person:", person.toUpperCase());
        console.error(err);

        let errMsg = err.message || "Error desconocido";

        // Detailed fault extraction
        if (err.err && err.err.faultstring) {
            errMsg = `AFIP Fault: ${err.err.faultstring}`;
        } else if (err.response && err.response.data) {
            // If it's an Axios/HTTP error, extract the body
            errMsg = `HTTP Error: ${err.message}`;
            if (typeof err.response.data === 'string' && err.response.data.includes('faultstring')) {
                const match = err.response.data.match(/<faultstring>(.*)<\/faultstring>/);
                if (match) errMsg = `AFIP: ${match[1]}`;
            }
        }

        console.error("--- DEBUG ARCA ERROR END ---");
        return { success: false, message: errMsg };
    }
}



/**
 * Generates a professional PDF of the invoice matching the Python script.
 */
export function generateInvoicePDF(venta, afipData) {
    const doc = new jsPDF();
    const personKey = getAfipPersonFromAccount(venta.cuenta_destino);
    const emisor = AFIP_DATA[personKey];

    const drawPage = (label) => {
        const margin = 10;
        const width = 210;
        const height = 297;

        // 1. External Border
        doc.setDrawColor(180);
        doc.rect(margin, margin, width - margin * 2, height - margin * 2);

        // 2. Header
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text("STRAWBERRY", margin + 10, margin + 20);

        doc.setFontSize(10);
        doc.text(label, width - margin - 30, margin + 10, { align: 'right' });

        // Center Box (Factura C)
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.rect(width / 2 - 15, margin, 30, 20);
        doc.setFontSize(20);
        doc.text("C", width / 2, margin + 12, { align: 'center' });
        doc.setFontSize(8);
        doc.text("COD. 011", width / 2, margin + 18, { align: 'center' });

        // Header Labels (Right Side)
        doc.setFontSize(18);
        doc.text("FACTURA", width - 70, margin + 20);

        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        const nroCmp = `${String(afipData.puntoVenta).padStart(4, '0')}-${String(afipData.cbte).padStart(8, '0')}`;
        doc.text(`Punto de Venta: ${String(afipData.puntoVenta).padStart(4, '0')}`, width - 70, margin + 30);
        doc.text(`Comp. Nro: ${String(afipData.cbte).padStart(8, '0')}`, width - 70, margin + 36);
        doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-AR')}`, width - 70, margin + 42);

        // 3. Emisor Box (Left Side)
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("Razón Social:", margin + 5, margin + 35);
        doc.setFont("helvetica", "normal");
        doc.text(emisor.razonSocial, margin + 35, margin + 35);

        doc.setFont("helvetica", "bold");
        doc.text("Domicilio:", margin + 5, margin + 41);
        doc.setFont("helvetica", "normal");
        doc.text(emisor.domicilio, margin + 35, margin + 41);

        doc.setFont("helvetica", "bold");
        doc.text("Condición IVA:", margin + 5, margin + 47);
        doc.setFont("helvetica", "normal");
        doc.text(emisor.condicionIva, margin + 35, margin + 47);

        // Emisor Details (Right Side info below header)
        doc.setFont("helvetica", "bold");
        doc.text("CUIT:", margin + 110, margin + 55);
        doc.setFont("helvetica", "normal");
        doc.text(emisor.cuit, margin + 140, margin + 55);

        doc.setFont("helvetica", "bold");
        doc.text("Ingresos Brutos:", margin + 110, margin + 61);
        doc.setFont("helvetica", "normal");
        doc.text(emisor.iibb, margin + 140, margin + 61);

        doc.setFont("helvetica", "bold");
        doc.text("Inicio Actividades:", margin + 110, margin + 67);
        doc.setFont("helvetica", "normal");
        doc.text(emisor.inicioActividades, margin + 140, margin + 67);

        doc.line(margin, margin + 75, width - margin, margin + 75);

        // 4. Cliente
        doc.setFont("helvetica", "bold");
        doc.text("Cliente: Consumidor Final", margin + 5, margin + 85);
        doc.text("Condición IVA: Consumidor Final", margin + 110, margin + 85);

        doc.line(margin, margin + 95, width - margin, margin + 95);

        // 5. Items Table Header
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, margin + 100, width - margin * 2, 8, 'F');
        doc.setFont("helvetica", "bold");
        doc.text("Descripción", margin + 5, margin + 105);
        doc.text("Can.", margin + 110, margin + 105);
        doc.text("P. Unit.", margin + 130, margin + 105);
        doc.text("Subtotal", margin + 160, margin + 105);

        // Item
        doc.setFont("helvetica", "normal");
        const itemDesc = venta.unidades?.[0]?.variantes?.modelos?.descripcion || 'Calzado';
        const amount = venta.medio_pago === 'DIVIDIR_PAGOS' ? venta.monto_otro : venta.total;
        doc.text(itemDesc, margin + 5, margin + 115);
        doc.text("1", margin + 110, margin + 115);
        doc.text(`$ ${amount.toLocaleString()}`, margin + 130, margin + 115);
        doc.text(`$ ${amount.toLocaleString()}`, margin + 160, margin + 115);

        // 6. Totals
        doc.line(margin, height - 80, width - margin, height - 80);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("TOTAL:", width - 80, height - 70);
        doc.text(`$ ${amount.toLocaleString()}`, width - 20, height - 70, { align: 'right' });

        // 7. QR and CAE
        const vto = afipData.caution; // YYYYMMDD
        const vtoFmt = `${vto.slice(6, 8)}/${vto.slice(4, 6)}/${vto.slice(0, 4)}`;

        // AFIP QR Data
        const qrObj = {
            ver: 1,
            fecha: new Date().toISOString().slice(0, 10),
            cuit: parseInt(emisor.cuit),
            ptoVta: afipData.puntoVenta,
            tipoCmp: 11,
            nroCmp: afipData.cbte,
            importe: amount,
            moneda: "PES",
            ctz: 1,
            tipoDocRec: 99,
            nroDocRec: 0,
            tipoCodAut: "E",
            codAut: parseInt(afipData.cae)
        };
        const qrBase64 = Buffer.from(JSON.stringify(qrObj)).toString('base64');
        const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${qrBase64}`;

        // Add QR placeholder for now (or use api)
        // Since we are server-side, we can use a QR API to get an image
        const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}`;
        // Note: For now we'll just put the text or a box if network is an issue, 
        // but jspdf supports images if they are base64.

        doc.setFontSize(10);
        doc.text(`CAE N°: ${afipData.cae}`, margin + 60, height - 30);
        doc.text(`Fecha de Vto. CAE: ${vtoFmt}`, margin + 60, height - 25);

        doc.setFontSize(8);
        doc.text("Comprobante Autorizado por AFIP.", margin + 60, height - 15);
        doc.text("Esta Administración Federal no se responsabiliza por los datos ingresados...", margin + 60, height - 10);
    };

    // Original
    drawPage("ORIGINAL");

    // Duplicated
    doc.addPage();
    drawPage("DUPLICADO");

    return doc.output('datauristring');
}
