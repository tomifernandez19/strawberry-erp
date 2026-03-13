import Afip from '@afipsdk/afip.js';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import { getAfipPersonFromAccount } from './afip-utils';

/**
 * Initializes Afip SDK for a specific person.
 */
function getAfipInstance(person = 'tomi') {
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

    return new Afip({
        CUIT: parseInt(cuit),
        cert: certPath,
        key: keyPath,
        production: production,
        ta_folder: taFolder
    });
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
 * Generates a PDF of the invoice.
 */
export function generateInvoicePDF(venta, afipData) {
    const doc = new jsPDF();
    const margin = 20;

    // Simple template
    doc.setFontSize(22);
    doc.text("STRAWBERRY", margin, 25);
    doc.text("FACTURA C", 140, 25);

    doc.setFontSize(10);
    doc.text(`Punto de Venta: ${String(afipData.puntoVenta).padStart(4, '0')}`, 140, 32);
    doc.text(`Número: ${String(afipData.cbte).padStart(8, '0')}`, 140, 38);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 140, 44);

    doc.line(margin, 55, 190, 55);

    doc.setFontSize(12);
    doc.text("Detalle:", margin, 65);
    doc.text(`${venta.unidades?.[0]?.variantes?.modelos?.descripcion || 'Calzado'}`, margin, 75);
    doc.text(`$ ${venta.total.toLocaleString()}`, 160, 75, { align: 'right' });

    doc.line(margin, 150, 190, 150);

    doc.setFontSize(14);
    doc.text(`TOTAL: $ ${venta.total.toLocaleString()}`, 160, 160, { align: 'right' });

    doc.setFontSize(10);
    doc.text(`CAE: ${afipData.cae}`, margin, 260);
    doc.text(`Vto. CAE: ${afipData.caution}`, margin, 265);

    return doc.output('datauristring');
}
