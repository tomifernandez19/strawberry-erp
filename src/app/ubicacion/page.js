'use client'
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import { assignLocation } from '@/lib/actions'
import Link from 'next/link'

export default function UbicacionPage() {
    const [scannedQR, setScannedQR] = useState('')
    const [zona, setZona] = useState('')
    const [status, setStatus] = useState(null) // { success, message, details }
    const [loading, setLoading] = useState(false)

    const handleScan = (decodedText) => {
        setScannedQR(decodedText)
        setStatus(null)
        // Auto-focus on the zone input
        document.getElementById('zona-input')?.focus()
    }

    const handleAssign = async (e) => {
        e.preventDefault()
        if (!scannedQR || !zona) return

        setLoading(true)
        try {
            const res = await assignLocation(scannedQR, zona)
            if (res.success) {
                setStatus({ success: true, message: '¡Ubicación guardada!', details: res.details })
                setScannedQR('')
                // Clear the zone input after successfully assigning
                // setZona('') // keeping it for batch processing
            } else {
                setStatus({ success: false, message: res.message })
            }
        } catch (err) {
            setStatus({ success: false, message: 'Error de servidor' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <Link href="/" className="btn-secondary" style={{ display: 'inline-flex', marginBottom: '15px', padding: '8px 15px' }}>
                    ← Volver
                </Link>
                <h1>Organizar Depósito</h1>
                <p style={{ opacity: 0.7 }}>Asignar zona de guardado a cada par</p>
            </header>

            <QRScanner onScanSuccess={handleScan} label="Escanear zapato" />

            <form onSubmit={handleAssign} className="card grid" style={{ gap: '15px', marginTop: '20px' }}>
                <div>
                    <label style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px', display: 'block' }}>QR Escaneado:</label>
                    <input
                        type="text"
                        value={scannedQR}
                        onChange={(e) => setScannedQR(e.target.value.toUpperCase())}
                        placeholder="Escaneá o escribí (ej: ST-000123)"
                        className="input-field"
                        style={{ marginBottom: 0, textTransform: 'uppercase' }}
                        required
                    />
                </div>

                <div>
                    <label style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px', display: 'block' }}>Zona / Estante:</label>
                    <input
                        id="zona-input"
                        type="text"
                        value={zona}
                        onChange={(e) => setZona(e.target.value)}
                        placeholder="Ej: Zona 1, Estante A, etc."
                        className="input-field"
                        style={{ marginBottom: 0 }}
                        required
                    />
                    <p style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '5px' }}>Consejo: Podés dejar la misma zona para varios pares seguidos.</p>
                </div>

                <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading || !scannedQR || !zona}
                    style={{ width: '100%', height: '60px' }}
                >
                    {loading ? 'Guardando...' : 'Confirmar Ubicación ✅'}
                </button>
            </form>

            {status && (
                <div className="card" style={{
                    border: `1px solid ${status.success ? 'var(--accent)' : '#ef4444'}`,
                    backgroundColor: status.success ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                    marginTop: '15px'
                }}>
                    <p style={{ fontWeight: 'bold', color: status.success ? 'var(--accent)' : '#ef4444' }}>
                        {status.message}
                    </p>
                    {status.details && <p style={{ fontSize: '0.85rem', marginTop: '5px', opacity: 0.8 }}>{status.details}</p>}
                </div>
            )}

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
