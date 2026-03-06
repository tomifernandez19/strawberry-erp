'use client'
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import ManualSelector from '@/components/ManualSelector'
import { getUnitForSale, recordSale } from '@/lib/actions'

export default function VenderPage() {
    const [previewUnit, setPreviewUnit] = useState(null)
    const [saleResult, setSaleResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [medioPago, setMedioPago] = useState('EFECTIVO')

    const handleScanSuccess = async (qrCode) => {
        setLoading(true)
        setError('')
        setPreviewUnit(null) // clear previous
        try {
            const result = await getUnitForSale(qrCode)
            if (result.success) {
                setPreviewUnit(result.data)
            } else {
                setError(result.message)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleConfirmSale = async () => {
        if (!previewUnit) return
        setLoading(true)
        setError('')
        try {
            const result = await recordSale(previewUnit.codigo_qr, medioPago)
            setSaleResult(result)
            setPreviewUnit(null)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const resetSale = () => {
        setSaleResult(null)
        setPreviewUnit(null)
        setError('')
    }

    if (saleResult) {
        return (
            <div className="grid mt-lg text-center">
                <div style={{ fontSize: '4rem' }}>✅</div>
                <h2>Venta Realizada</h2>
                <div className="card mt-lg">
                    <h4>{saleResult.unidad.variantes.modelos.descripcion}</h4>
                    <p>{saleResult.unidad.variantes.color} • Talle {saleResult.unidad.talle_especifico}</p>
                    <p style={{ marginTop: 'var(--spacing-md)', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                        $ {saleResult.venta.total.toLocaleString()}
                    </p>
                </div>
                <button className="btn-primary mt-lg" onClick={resetSale}>Vender Otro Par</button>
            </div>
        )
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Nueva Venta</h1>
                <p style={{ opacity: 0.7 }}>Escanee o seleccione el producto</p>
            </header>

            {error && (
                <div className="card" style={{ borderColor: 'var(--error)', backgroundColor: 'rgba(239, 68, 68, 0.1)', textAlign: 'center', padding: '15px' }}>
                    {error}
                </div>
            )}

            {previewUnit ? (
                <div className="grid">
                    <section className="card" style={{ border: '2px solid var(--accent)' }}>
                        <div className="text-center">
                            <span className="badge" style={{ marginBottom: '8px' }}>Confirmar Datos</span>
                            <h2 style={{ color: 'var(--primary)' }}>{previewUnit.variantes.modelos.descripcion}</h2>
                            <p style={{ fontSize: '1.1rem', opacity: 0.8 }}>{previewUnit.variantes.color} • Talle {previewUnit.talle_especifico}</p>
                        </div>

                        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: 'var(--spacing-lg)' }}>
                            <div className="card" style={{ backgroundColor: 'rgba(34, 197, 94, 0.05)', padding: '10px', border: medioPago === 'EFECTIVO' || medioPago === 'TRANSFERENCIA' ? '1px solid var(--accent)' : '1px solid transparent' }}>
                                <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>Efectivo / Transf.</p>
                                <p style={{ fontWeight: 'bold' }}>$ {(previewUnit.variantes?.precio_efectivo || 0).toLocaleString()}</p>
                            </div>
                            <div className="card" style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '10px', border: !(['EFECTIVO', 'TRANSFERENCIA'].includes(medioPago)) ? '1px solid var(--accent)' : '1px solid transparent' }}>
                                <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>Precio Lista</p>
                                <p style={{ fontWeight: 'bold' }}>$ {(previewUnit.variantes?.precio_lista || 0).toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="mt-lg">
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Medio de Pago:</label>
                            <select
                                value={medioPago}
                                onChange={(e) => setMedioPago(e.target.value)}
                                className="input-field"
                            >
                                <option value="EFECTIVO">Efectivo (Descuento) 💵</option>
                                <option value="TRANSFERENCIA">Transferencia (Descuento) 📱</option>
                                <option value="TARJETA_DEBITO">Tarjeta Débito 💳</option>
                                <option value="TARJETA_CREDITO">Tarjeta Crédito 💳</option>
                                <option value="QR_LISTA">QR Pago / Otros 🔘</option>
                            </select>
                        </div>

                        <div className="card mt-md text-center" style={{ backgroundColor: 'var(--secondary)' }}>
                            <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>TOTAL A COBRAR</p>
                            <h2 style={{ color: 'var(--accent)', margin: 0 }}>
                                $ {((['EFECTIVO', 'TRANSFERENCIA'].includes(medioPago)
                                    ? previewUnit.variantes?.precio_efectivo
                                    : previewUnit.variantes?.precio_lista) || 0).toLocaleString()}
                            </h2>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: 'var(--spacing-lg)' }}>
                            <button className="btn-primary" style={{ flex: 2 }} onClick={handleConfirmSale} disabled={loading}>
                                {loading ? 'Procesando...' : 'Confirmar Venta'}
                            </button>
                            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setPreviewUnit(null)}>
                                Cancelar
                            </button>
                        </div>
                    </section>
                </div>
            ) : (
                <div className="grid">
                    <QRScanner onScanSuccess={handleScanSuccess} label="Escanee el QR del par" />

                    <div className="card mt-md" style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '8px' }}>Búsqueda por Código QR:</p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                id="manualSaleQR"
                                type="text"
                                placeholder="ST-000000"
                                className="input-field"
                                style={{ flex: 1, margin: 0, textTransform: 'uppercase' }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleScanSuccess(e.target.value.toUpperCase())
                                }}
                            />
                            <button className="btn-primary" onClick={() => handleScanSuccess(document.getElementById('manualSaleQR').value.toUpperCase())}>
                                Ver
                            </button>
                        </div>
                    </div>

                    <ManualSelector onSelect={handleScanSuccess} loading={loading} />
                </div>
            )}
            <div style={{ height: '80px' }}></div>
        </div>
    )
}
