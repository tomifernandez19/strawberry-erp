'use client'
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import ManualSelector from '@/components/ManualSelector'
import { getProductDetailsByQR } from '@/lib/actions'

export default function ConsultarPage() {
    const [scannedData, setScannedData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSearch = async (qrCode) => {
        setLoading(true)
        setError('')
        try {
            const data = await getProductDetailsByQR(qrCode)
            setScannedData(data)
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
                                <span className="badge" style={{ backgroundColor: scannedData.unit.estado === 'DISPONIBLE' ? 'var(--accent)' : 'var(--secondary)' }}>
                                    {scannedData.unit.estado}
                                </span>
                            </div>
                            <h2 style={{ color: 'var(--primary)', margin: '10px 0' }}>{scannedData.model.descripcion}</h2>
                            <p style={{ fontSize: '1.2rem', opacity: 0.8 }}>Color: <strong>{scannedData.variant.color}</strong></p>
                            <p style={{ fontSize: '1rem', opacity: 0.6 }}>Unidad: Talle {scannedData.unit.talle_especifico}</p>
                        </div>

                        <div className="grid mt-lg" style={{ gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div className="card text-center" style={{ background: 'rgba(34, 197, 94, 0.05)' }}>
                                <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>Efectivo / Transf.</p>
                                <p style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>$ {scannedData.variant.precio_efectivo?.toLocaleString()}</p>
                            </div>
                            <div className="card text-center" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                                <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>Precio Lista</p>
                                <p style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>$ {scannedData.variant.precio_lista?.toLocaleString()}</p>
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

                    <ManualSelector onSelect={handleSearch} loading={loading} />
                </div>
            )}
            <div style={{ height: '80px' }}></div>
        </div>
    )
}
