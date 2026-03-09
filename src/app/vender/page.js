'use client'
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import ManualSelector from '@/components/ManualSelector'
import { getUnitForSale, recordSale } from '@/lib/actions'

export default function VenderPage() {
    const [previewUnit, setPreviewUnit] = useState(null)
    const [saleResult, setSaleResult] = useState(null)
    const [customerName, setCustomerName] = useState('')
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerEmail, setCustomerEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [medioPago, setMedioPago] = useState('EFECTIVO')
    const [descuento, setDescuento] = useState(0)

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
            const options = {
                ...(medioPago === 'DIVIDIR_PAGOS' ? {
                    monto_efectivo: parseFloat(montoEfectivo),
                    monto_otro: parseFloat(montoOtro),
                    otro_medio_pago: otroMedioPago
                } : {}),
                customerData: {
                    nombre: customerName,
                    telefono: customerPhone,
                    email: customerEmail
                },
                descuento: Number(descuento)
            }

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
        setCustomerName('')
        setCustomerPhone('')
        setCustomerEmail('')
        setDescuento(0)
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
        let baseTotal = 0
        if (medioPago === 'EFECTIVO') baseTotal = precioEfectivo
        else if (medioPago === 'TRANSFERENCIA') baseTotal = precioTransf
        else if (medioPago === 'DIVIDIR_PAGOS') baseTotal = (Number(montoEfectivo) + Number(montoOtro)) || 0
        else baseTotal = precioLista

        if (descuento > 0) {
            baseTotal = Math.round(baseTotal * (1 - (descuento / 100)))
        }
        return baseTotal
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

                            {previewUnit.variantes?.imagen_url && (
                                <div style={{ width: '100%', maxWidth: '180px', margin: '0 auto 15px auto', borderRadius: '12px', overflow: 'hidden' }}>
                                    <img src={previewUnit.variantes.imagen_url} alt="Prod" style={{ width: '100%', height: 'auto', display: 'block' }} />
                                </div>
                            )}

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

                        <div className="mt-md" style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: 'var(--radius)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>¿Aplicar Descuento? %</label>
                                {descuento > 0 && <span className="badge" style={{ backgroundColor: 'var(--accent)', color: 'white' }}>-{descuento}%</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    placeholder="Ej: 10"
                                    className="input-field"
                                    style={{ margin: 0, flex: 1 }}
                                    value={descuento > 0 ? descuento : ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') setDescuento(0);
                                        else {
                                            const num = parseInt(val);
                                            if (num >= 0 && num <= 100) setDescuento(num);
                                        }
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    {[5, 10, 15].map(pct => (
                                        <button
                                            key={pct}
                                            type="button"
                                            className="btn-secondary"
                                            style={{ padding: '5px 10px', fontSize: '0.7rem', minWidth: 'auto' }}
                                            onClick={() => setDescuento(pct)}
                                        >
                                            {pct}%
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="card mt-md text-center" style={{ backgroundColor: 'var(--secondary)' }}>
                            <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>TOTAL A COBRAR</p>
                            <h2 style={{ color: 'var(--accent)', margin: 0 }}>
                                $ {currentTotal().toLocaleString()}
                            </h2>
                        </div>

                        <div className="mt-lg" style={{ borderTop: '1px solid var(--card-border)', paddingTop: '15px' }}>
                            <p style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '10px' }}>DATOS DEL CLIENTE (OPCIONAL):</p>
                            <div className="grid" style={{ gap: '10px' }}>
                                <input
                                    type="text"
                                    placeholder="Nombre completo"
                                    className="input-field"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    style={{ fontSize: '0.85rem' }}
                                />
                                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <input
                                        type="tel"
                                        placeholder="Teléfono"
                                        className="input-field"
                                        value={customerPhone}
                                        onChange={(e) => setCustomerPhone(e.target.value)}
                                        style={{ fontSize: '0.85rem' }}
                                    />
                                    <input
                                        type="email"
                                        placeholder="Email"
                                        className="input-field"
                                        value={customerEmail}
                                        onChange={(e) => setCustomerEmail(e.target.value)}
                                        style={{ fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid mt-lg" style={{ gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <button className="btn-secondary" onClick={resetSale} disabled={loading}>
                                Cancelar
                            </button>
                            <button className="btn-primary" onClick={handleConfirmSale} disabled={loading} style={{ background: 'var(--accent)' }}>
                                {loading ? 'Procesando...' : 'Confirmar Venta'}
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
