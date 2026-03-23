'use client'
import { useState, useEffect } from 'react'
import QRScanner from '@/components/QRScanner'
import { assignLocation, getUnitByQR } from '@/lib/actions'
import Link from 'next/link'

export default function UbicacionPage() {
    const [scannedQR, setScannedQR] = useState('')
    const [unitInfo, setUnitInfo] = useState(null)
    const [zona, setZona] = useState('')
    const [status, setStatus] = useState(null) // { success, message, details }
    const [loading, setLoading] = useState(false)

    // Effect to fetch unit details when QR changes
    useEffect(() => {
        if (scannedQR.length >= 9) { // ST-XXXXXX
            fetchUnitDetails(scannedQR)
        } else {
            setUnitInfo(null)
        }
    }, [scannedQR])

    async function fetchUnitDetails(qr) {
        const res = await getUnitByQR(qr)
        if (res.success && res.unit) {
            setUnitInfo(res.unit)
        } else {
            setUnitInfo(null)
        }
    }

    const handleScan = (decodedText) => {
        const match = (decodedText || '').match(/ST-\d{6}/i)
        const cleanText = match ? match[0].toUpperCase() : decodedText.trim().toUpperCase()
        setScannedQR(cleanText)
        setStatus(null)
        // Auto-focus on the zone input
        setTimeout(() => {
            document.getElementById('zona-input')?.focus()
        }, 300)
    }

    const handleAssign = async (e) => {
        e.preventDefault()
        if (!scannedQR || !zona) return

        setLoading(true)
        try {
            const res = await assignLocation(scannedQR, zona)
            if (res.success) {
                setStatus({ success: true, message: '¡Ubicación actualizada!', details: res.details })
                setScannedQR('')
                setUnitInfo(null)
                setZona('')
                // Redirigir el foco al scanner o al input de QR
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

            <div className="card" style={{ marginBottom: '20px' }}>
                <QRScanner onScanSuccess={handleScan} label="Escanear zapato" />
            </div>

            <form onSubmit={handleAssign} className="card grid" style={{ gap: '15px' }}>
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

                {unitInfo && (
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        padding: '15px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.05)',
                        animation: 'fadeIn 0.3s ease-out'
                    }}>
                        <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>PRODUCTO DETECTADO:</p>
                        <h4 style={{ margin: '5px 0', color: 'var(--accent)' }}>
                            {unitInfo.variantes.modelos.descripcion} ({unitInfo.variantes.color}) T{unitInfo.talle_especifico}
                        </h4>

                        {unitInfo.ubicacion ? (
                            <p style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 'bold', marginTop: '10px' }}>
                                ⚠️ Ubicación actual: <span style={{ background: 'rgba(251, 191, 36, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>{unitInfo.ubicacion}</span>
                            </p>
                        ) : (
                            <p style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '10px' }}>✨ Sin ubicación asignada aún.</p>
                        )}
                    </div>
                )}

                <div>
                    <label style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px', display: 'block' }}>
                        {unitInfo?.ubicacion ? 'Nueva Ubicación (Sobrescribir):' : 'Asignar Zona / Estante:'}
                    </label>
                    <input
                        id="zona-input"
                        type="text"
                        value={zona}
                        onChange={(e) => setZona(e.target.value)}
                        placeholder="Ej: Zona 1, Estante A..."
                        className="input-field"
                        style={{ marginBottom: 0 }}
                        required
                    />
                </div>

                <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading || !scannedQR || !zona}
                    style={{ width: '100%', height: '60px' }}
                >
                    {loading ? 'Guardando...' : (unitInfo?.ubicacion ? 'Actualizar Ubicación 🔄' : 'Confirmar Ubicación ✅')}
                </button>
            </form>

            {status && (
                <div className="card" style={{
                    border: `1px solid ${status.success ? 'var(--accent)' : '#ef4444'}`,
                    backgroundColor: status.success ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                    marginTop: '15px',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <p style={{ fontWeight: 'bold', color: status.success ? 'var(--accent)' : '#ef4444' }}>
                        {status.message}
                    </p>
                    {status.details && <p style={{ fontSize: '0.85rem', marginTop: '5px', opacity: 0.8 }}>{status.details}</p>}
                </div>
            )}

            <div style={{ height: '80px' }}></div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
