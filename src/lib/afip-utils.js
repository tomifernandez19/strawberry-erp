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

/**
 * Detailed fiscal data for each taxpayer.
 */
export const AFIP_DATA = {
    tomi: {
        razonSocial: "FERNANDEZ DE MAUSSION TOMAS ESTEBAN",
        domicilio: "Guayaquil 1507 - Villa Allende, Córdoba",
        condicionIva: "Responsable Monotributo",
        iibb: "286117261",
        inicioActividades: "01/09/2021",
        cuit: "20418463970"
    },
    lucas: {
        razonSocial: "LUCAS MAUSSION",
        domicilio: "Villa Allende, Córdoba",
        condicionIva: "Responsable Monotributo",
        iibb: "---",
        inicioActividades: "01/01/2023",
        cuit: "20432991920"
    },
    sofi: {
        razonSocial: "SOFIA MAUSSION",
        domicilio: "Villa Allende, Córdoba",
        condicionIva: "Responsable Monotributo",
        iibb: "---",
        inicioActividades: "01/01/2023",
        cuit: "27421075897"
    }
}
