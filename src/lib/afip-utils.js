/**
 * Maps the destination account to the AFIP person.
 * This file is shared between client and server (no Node.js modules).
 */
export function getAfipPersonFromAccount(cuentaDestino) {
    if (cuentaDestino === 'SOFI_MP') return 'sofi';
    if (cuentaDestino === 'LUCAS') return 'lucas';
    if (cuentaDestino === 'TOMI') return 'tomi';
    // Fallback for Caja Local or others
    return 'tomi';
}
