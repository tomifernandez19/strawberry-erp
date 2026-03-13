import Afip from '@afipsdk/afip.js';
import { jsPDF } from 'jspdf';

/**
 * Maps the destination account to the AFIP person.
 */
export function getAfipPersonFromAccount(cuentaDestino) {
    if (cuentaDestino === 'SOFI_MP') return 'sofi';
    if (cuentaDestino === 'LUCAS') return 'lucas';
    if (cuentaDestino === 'TOMI') return 'tomi';
    // Fallback for Caja Local or others
    return 'tomi';
}

/**
 * Initializes Afip SDK for a specific person.
 */
function getAfipInstance(person = 'tomi') {
    const fs = require('fs');
    const path = require('path');
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

    fs.writeFileSync(certPath, certStr);
    fs.writeFileSync(keyPath, keyStr);

    return new Afip({
        CUIT: parseInt(cuit),
        cert: certPath,
        key: keyPath,
        production: production,
        ta_folder: '/tmp/'
    });
}

/**
 * Creates an Electronic Invoice (Factura C) in AFIP.
 */
export async function createElectronicInvoice(venta, personOverride = null) {
    try {
        const person = personOverride || getAfipPersonFromAccount(venta.cuenta_destino);
        const afip = getAfipInstance(person);
        const puntoVenta = parseInt(process.env[`AFIP_POS_${person.toUpperCase()}`] || '1');

        // 1. Determine Invoice Type (Factura C = 11 for Monotributistas)
        const type = 11;

        // 2. Get the next invoice number
        const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, type);
        const nextVoucher = lastVoucher + 1;

        // 3. Prepare the data
        // For simplified use, we assume CONSUMIDOR FINAL (DocType 99, DocNumber 0) if no data
        let docType = 99;
        let docNumber = 0;

        // If we have CUIT/DNI of client, we should use it here.
        // For now, let's stick to the basic requirements.

        const amount = venta.medio_pago === 'DIVIDIR_PAGOS' ? venta.monto_otro : venta.total;

        const data = {
            CantReg: 1,  // Quantity of vouchers
            PtoVta: puntoVenta,
            CbteTipo: type,
            Concepto: 1, // Products
            DocTipo: docType,
            DocNro: docNumber,
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

        // 4. Create the voucher
        const res = await afip.ElectronicBilling.createVoucher(data);

        return {
            success: true,
            cae: res.CAE,
            caution: res.CAEFchVto,
            cbte: nextVoucher,
            puntoVenta: puntoVenta
        };
    } catch (err) {
        console.error("--- DEBUG ARCA ERROR START ---");
        console.error("Person:", personOverride || "n/a");
        console.error(err);

        // Extract the most detailed message possible from the AFIP SDK
        let errMsg = err.message || "Error desconocido en ARCA";

        // Many AFIP errors come inside a soap "faultstring" or "err" object
        if (err.err && err.err.faultstring) {
            errMsg = `AFIP Fault: ${err.err.faultstring}`;
        } else if (err.response && err.response.data) {
            errMsg = `AFIP Response: ${JSON.stringify(err.response.data)}`;
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
