import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SPREADSHEET_ID = '1u-Pi8_P1fezLwFCYF0VoHB8IhXSKQ8wt-Uq_GP1Ql3A';

export async function appendToSheet(data) {
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!serviceAccountEmail || !privateKey) {
        throw new Error('Google Sheets credentials missing in environment variables.');
    }

    const auth = new JWT({
        email: serviceAccountEmail,
        key: privateKey,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
        ],
    });

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);

    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['facturacion'];

    if (!sheet) {
        throw new Error('Worksheet "facturacion" not found in spreadsheet.');
    }

    const headers = sheet.headerValues;
    const emisorKey = headers.find(h => h.toLowerCase() === 'emisor') || 'emisor';

    await sheet.addRow({
        id: data.id,
        fecha: data.fecha,
        cliente: data.cliente,
        tipo_doc: data.tipo_doc,
        nro_doc: data.nro_doc,
        total: data.total,
        medio_pago: data.medio_pago,
        [emisorKey]: data.emisor,
        estado: 'pendiente',
        cae: '',
        nro_cbte: '',
        error: ''
    });

    return true;
}
