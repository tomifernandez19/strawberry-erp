'use client'
import { useState, useRef, useEffect } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { assignLocation } from '@/lib/actions'
import Link from 'next/link'

export default function UbicacionPage() {
    const [scannedQR, setScannedQR] = useState('')
    const [zona, setZona] = useState('')
    const [status, setStatus] = useState(null) // { success, message, details }
    const [loading, setLoading] = useState(false)
    const scannerRef = useRef(null)

    useEffect(() => {
        const scanner = new Html5QrcodeScanner('reader', {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
            supportedScanTypes: [0] // Camera only
        })

        scanner.render((decodedText) => {
            setScannedQR(decodedText)
            setStatus(null)
            // Scroll to the zone input
            document.getElementById('zona-input')?.focus()
        }, (error) => {
            // silent scan
        })

        return () => {
            scanner.clear().catch(e => console.error(e))
        }
    }, [])

    const handleAssign = async (e) => {
        e.preventDefault()
        if (!scannedQR || !zona) return

        setLoading(true)
        try {
            const res = await assignLocation(scannedQR, zona)
            if (res.success) {
                setStatus({ success: true, message: '¡Ubicación guardada!', details: res.details })
                setScannedQR('')
                // Don't clear zone if the user is assigning many items to the same zone
                // but let's clear it if they want to be sure
                // setZona('') 
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

            <section className="card">
                <div id="reader"></div>
            </section>

            <form onSubmit={handleAssign} className="card grid" style={{ gap: '15px' }}>
                <div>
                    <label style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px', display: 'block' }}>QR Escaneado:</label>
                    <input
                        type="text"
                        value={scannedQR}
                        onChange={(e) => setScannedQR(e.target.value.toUpperCase())}
                        placeholder="Escaneá o escribí (ej: ST-000123)"
                        className="input-field"
                        style={{ marginBottom: 0 }}
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
                    backgroundColor: status.success ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'
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
