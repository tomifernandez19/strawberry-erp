'use client'
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import ManualSelector from '@/components/ManualSelector'
import { getProductDetailsByQR, getPendingSenasList } from '@/lib/actions'

export default function ConsultarPage() {
    const [scannedData, setScannedData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [senaData, setSenaData] = useState(null)

    const handleSearch = async (qrCode) => {
        const match = (qrCode || '').match(/ST-\d{6}/i)
        const cleanQr = match ? match[0].toUpperCase() : qrCode.toUpperCase().trim()
        if (!cleanQr) return

        setLoading(true)
        setError('')
        setSenaData(null)
        try {
            const data = await getProductDetailsByQR(cleanQr)
            setScannedData(data)

            // If unit is reserved, find the sena info
            if (data.unit.estado === 'RESERVADO_ONLINE') {
                const senas = await getPendingSenasList()
                const sMatch = senas.find(s => s.unidades.some(u => u.codigo_qr === cleanQr))
                if (sMatch) setSenaData(sMatch)
            }
        } catch (err) {
            setError(err.message)
            setScannedData(null)
        } finally {
            setLoading(false)
        }
    }

    const resetSearch = () => {
        setScannedData(null)
        setError('')
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Consultar Producto</h1>
                <p style={{ opacity: 0.7 }}>Escanee un QR para ver stock y precios</p>
            </header>

            {error && (
                <div className="card text-center" style={{ borderColor: 'var(--error)', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '15px' }}>
                    {error}
                </div>
            )}

            {scannedData ? (
                <div className="grid">
                    <section className="card" style={{ border: '2px solid var(--accent)' }}>
                        <div className="text-center">
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                                <span className="badge" style={{
                                    backgroundColor: scannedData.unit.estado === 'DISPONIBLE' ? 'var(--accent)' : (scannedData.unit.estado === 'RESERVADO_ONLINE' ? '#eab308' : 'var(--secondary)'),
                                    color: scannedData.unit.estado === 'RESERVADO_ONLINE' ? 'black' : 'white'
                                }}>
                                    {scannedData.unit.estado === 'RESERVADO_ONLINE' ? '📖 RESERVADO (SEÑA)' : scannedData.unit.estado}
                                </span>
                            </div>

                            {senaData && (
                                <div className="card mt-sm mb-md" style={{ border: '1px solid #eab308', background: 'rgba(234, 179, 8, 0.05)', padding: '10px' }}>
                                    <p style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#eab308', margin: 0 }}>DATOS DE RESERVA:</p>
                                    <p style={{ fontSize: '0.9rem', margin: '4px 0' }}>👤 {senaData.nombre_cliente || 'Sin nombre'}</p>
                                    <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>📞 {senaData.telefono_cliente || 'Sin teléfono'}</p>
                                    <div style={{ borderTop: '1px solid rgba(234, 179, 8, 0.2)', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Saldo Pendiente:</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#eab308' }}>$ {((senaData.total || 0) - ((senaData.monto_efectivo || 0) + (senaData.monto_otro || 0))).toLocaleString()}</span>
                                    </div>
                                </div>
                            )}

                            {scannedData.variant?.imagen_url && (
                                <div style={{ width: '100%', maxWidth: '200px', margin: '15px auto', borderRadius: '15px', overflow: 'hidden', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}>
                                    <img src={scannedData.variant.imagen_url} alt="Producto" style={{ width: '100%', height: 'auto', display: 'block' }} />
                                </div>
                            )}

                            <h2 style={{ color: 'var(--primary)', margin: '10px 0' }}>{scannedData.model.descripcion}</h2>
                            <p style={{ fontSize: '1.2rem', opacity: 0.8 }}>Color: <strong>{scannedData.variant.color}</strong></p>
                            <p style={{ fontSize: '1rem', opacity: 0.6 }}>Unidad: Talle {scannedData.unit.talle_especifico}</p>

                            <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                <p style={{ fontSize: '0.8rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px' }}>Ubicación en Depósito:</p>
                                <p style={{ fontSize: '1.3rem', fontWeight: 'bold', color: scannedData.unit.ubicacion ? 'var(--accent)' : '#ef4444' }}>
                                    {scannedData.unit.ubicacion || '⚠️ SIN ASIGNAR'}
                                </p>
                            </div>
                        </div>

                        <div className="grid mt-lg" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                            <div className="card text-center" style={{ background: 'rgba(34, 197, 94, 0.05)', padding: '10px 5px' }}>
                                <p style={{ fontSize: '0.65rem', opacity: 0.6 }}>Efe/Tra</p>
                                <p style={{ fontSize: '1rem', fontWeight: 'bold' }}>$ {scannedData.variant.precio_efectivo?.toLocaleString()}</p>
                            </div>
                            <div className="card text-center" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '10px 5px' }}>
                                <p style={{ fontSize: '0.65rem', opacity: 0.6 }}>Mayorista</p>
                                <p style={{ fontSize: '1rem', fontWeight: 'bold' }}>$ {Math.round(scannedData.variant.precio_efectivo * 0.9).toLocaleString()}</p>
                            </div>
                            <div className="card text-center" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 5px' }}>
                                <p style={{ fontSize: '0.65rem', opacity: 0.6 }}>Lista</p>
                                <p style={{ fontSize: '1rem', fontWeight: 'bold' }}>$ {scannedData.variant.precio_lista?.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="mt-lg">
                            <h4 style={{ marginBottom: '10px', borderBottom: '1px solid var(--card-border)', paddingBottom: '5px' }}>Stock Disponible (Mismo modelo/color):</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                                {scannedData.stockBySize.length > 0 ? (
                                    scannedData.stockBySize.sort((a, b) => a.talle - b.talle).map(item => (
                                        <div key={item.talle} style={{
                                            padding: '10px 15px',
                                            background: 'var(--secondary)',
                                            borderRadius: '12px',
                                            border: '1px solid var(--card-border)',
                                            textAlign: 'center',
                                            minWidth: '70px'
                                        }}>
                                            <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Talle</p>
                                            <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.talle}</p>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>{item.qty} u.</p>
                                        </div>
                                    ))
                                ) : (
                                    <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No hay más stock disponible.</p>
                                )}
                            </div>
                        </div>

                        <button className="btn-primary mt-lg" onClick={resetSearch} style={{ width: '100%' }}>
                            Consultar Otro
                        </button>
                    </section>
                </div>
            ) : (
                <div className="grid">
                    <ManualSelector onSelect={handleSearch} loading={loading} buttonLabel="Consultar Stock" />

                    <QRScanner onScanSuccess={handleSearch} label="Escanear producto" />

                    <div className="card mt-md" style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '8px' }}>Búsqueda por Código QR:</p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                id="searchQR"
                                type="text"
                                placeholder="ST-000000"
                                className="input-field"
                                style={{ flex: 1, margin: 0, textTransform: 'uppercase' }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSearch(e.target.value.toUpperCase())
                                }}
                            />
                            <button className="btn-primary" onClick={() => handleSearch(document.getElementById('searchQR').value.toUpperCase())}>
                                Buscar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div style={{ height: '80px' }}></div>
        </div>
    )
}
