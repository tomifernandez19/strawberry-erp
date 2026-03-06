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

    // State for split payments
    const [montoEfectivo, setMontoEfectivo] = useState('')
    const [montoOtro, setMontoOtro] = useState('')
    const [otroMedioPago, setOtroMedioPago] = useState('TARJETA_DEBITO')

    const handleScanSuccess = async (qrCode) => {
        setLoading(true)
        setError('')
        setPreviewUnit(null)
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

        // Validation for split payment
        if (medioPago === 'DIVIDIR_PAGOS') {
            if (!montoEfectivo || !montoOtro) {
                setError('Debe completar ambos montos para el pago dividido.')
                return
            }
        }

        setLoading(true)
        setError('')
        try {
            const options = medioPago === 'DIVIDIR_PAGOS' ? {
                monto_efectivo: parseFloat(montoEfectivo),
                monto_otro: parseFloat(montoOtro),
                otro_medio_pago: otroMedioPago
            } : {}

            const result = await recordSale(previewUnit.codigo_qr, medioPago, options)
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
        setMontoEfectivo('')
        setMontoOtro('')
        setMedioPago('EFECTIVO')
    }

    // New calculated prices
    const precioLista = previewUnit?.variantes?.precio_lista || 0
    // Cash price rounding: Ceiling to next 1000
    const precioEfectivo = Math.ceil((precioLista * (100 / 121)) / 1000) * 1000
    const precioTransf = Math.round(precioLista * (100 / 110))

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
                    <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>{saleResult.venta.medio_pago.replace('_', ' ')}</p>
                </div>
                <button className="btn-primary mt-lg" onClick={resetSale}>Vender Otro Par</button>
            </div>
        )
    }

    const currentTotal = () => {
        if (medioPago === 'EFECTIVO') return precioEfectivo
        if (medioPago === 'TRANSFERENCIA') return precioTransf
        if (medioPago === 'DIVIDIR_PAGOS') return (Number(montoEfectivo) + Number(montoOtro)) || 0
        return precioLista
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
                            <h2 style={{ color: 'var(--primary)', margin: '10px 0' }}>{previewUnit.variantes.modelos.descripcion}</h2>
                            <p style={{ fontSize: '1.1rem', opacity: 0.8 }}>{previewUnit.variantes.color} • Talle {previewUnit.talle_especifico}</p>
                        </div>

                        <div className="grid mt-lg" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                            <div className="card text-center" style={{ padding: '10px 5px', background: medioPago === 'EFECTIVO' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)', border: medioPago === 'EFECTIVO' ? '1px solid var(--accent)' : '1px solid transparent' }}>
                                <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>Efectivo</p>
                                <p style={{ fontSize: '1rem', fontWeight: 'bold' }}>${precioEfectivo.toLocaleString()}</p>
                            </div>
                            <div className="card text-center" style={{ padding: '10px 5px', background: medioPago === 'TRANSFERENCIA' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)', border: medioPago === 'TRANSFERENCIA' ? '1px solid var(--accent)' : '1px solid transparent' }}>
                                <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>Transf.</p>
                                <p style={{ fontSize: '1rem', fontWeight: 'bold' }}>${precioTransf.toLocaleString()}</p>
                            </div>
                            <div className="card text-center" style={{ padding: '10px 5px', background: !['EFECTIVO', 'TRANSFERENCIA', 'DIVIDIR_PAGOS'].includes(medioPago) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)', border: !['EFECTIVO', 'TRANSFERENCIA', 'DIVIDIR_PAGOS'].includes(medioPago) ? '1px solid var(--accent)' : '1px solid transparent' }}>
                                <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>Lista</p>
                                <p style={{ fontSize: '1rem', fontWeight: 'bold' }}>${precioLista.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="mt-lg">
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Medio de Pago:</label>
                            <select
                                value={medioPago}
                                onChange={(e) => setMedioPago(e.target.value)}
                                className="input-field"
                            >
                                <option value="EFECTIVO">Efectivo (Promo) 💵</option>
                                <option value="TRANSFERENCIA">Transferencia (Promo) 📱</option>
                                <option value="TARJETA_DEBITO">Tarjeta Débito 💳</option>
                                <option value="TARJETA_CREDITO">Tarjeta Crédito 💳</option>
                                <option value="QR_LISTA">QR Pago / Otros 🔘</option>
                                <option value="DIVIDIR_PAGOS">Dividir Pago (Efe + Otro) ⚖️</option>
                            </select>
                        </div>

                        {medioPago === 'DIVIDIR_PAGOS' && (
                            <div className="card grid mt-md" style={{ gap: '15px', background: 'rgba(255,255,255,0.03)' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Monto en Efectivo:</label>
                                    <input
                                        type="number"
                                        value={montoEfectivo}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setMontoEfectivo(val);
                                            // Auto-calculate the remaining amount
                                            if (val && !isNaN(val)) {
                                                const efeAmount = parseFloat(val);
                                                // 1. How much of the "Cash Price" did they pay?
                                                const portionOfCashPrice = efeAmount / precioEfectivo;
                                                // 2. That same portion is subtracted from the List Price
                                                const remainingListPrice = Math.round(precioLista * (1 - portionOfCashPrice));
                                                setMontoOtro(remainingListPrice > 0 ? remainingListPrice : 0);
                                            } else {
                                                setMontoOtro('');
                                            }
                                        }}
                                        className="input-field"
                                        placeholder={`Máx: $${precioEfectivo}`}
                                    />
                                    <p style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '5px' }}>
                                        Este monto tiene el 21% de descuento aplicado.
                                    </p>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Segundo Medio de Pago:</label>
                                    <select
                                        value={otroMedioPago}
                                        onChange={(e) => setOtroMedioPago(e.target.value)}
                                        className="input-field"
                                    >
                                        <option value="TARJETA_DEBITO">Tarjeta Débito 💳</option>
                                        <option value="TARJETA_CREDITO">Tarjeta Crédito 💳</option>
                                        <option value="TRANSFERENCIA">Transferencia 📱</option>
                                        <option value="QR_LISTA">QR Pago / Otros 🔘</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Monto Restante (Auto):</label>
                                    <input
                                        type="number"
                                        value={montoOtro}
                                        readOnly
                                        className="input-field"
                                        style={{ backgroundColor: 'rgba(255,255,255,0.05)', cursor: 'not-allowed', color: 'var(--accent)', fontWeight: 'bold' }}
                                    />
                                    <p style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '5px' }}>
                                        Calculado proporcionalmente al Precio Lista.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="card mt-md text-center" style={{ backgroundColor: 'var(--secondary)' }}>
                            <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>TOTAL A COBRAR</p>
                            <h2 style={{ color: 'var(--accent)', margin: 0 }}>
                                $ {currentTotal().toLocaleString()}
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
