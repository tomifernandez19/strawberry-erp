'use client'
import { useState, useEffect } from 'react'
import { getUnitForSale, recordProductExchange } from '@/lib/actions'
import QRScanner from '@/components/QRScanner'
import Link from 'next/link'

export default function CambiosPage() {
    const [oldUnit, setOldUnit] = useState(null)
    const [newUnit, setNewUnit] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)

    // Payment states for difference
    const [medioPago, setMedioPago] = useState('EFECTIVO')
    const [montoEfectivo, setMontoEfectivo] = useState('')
    const [montoOtro, setMontoOtro] = useState('')
    const [otroMedioPago, setOtroMedioPago] = useState('TARJETA_DEBITO')
    const [customerName, setCustomerName] = useState('')
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerEmail, setCustomerEmail] = useState('')

    const resetState = () => {
        setOldUnit(null)
        setNewUnit(null)
        setError('')
        setLoading(false)
        setSuccess(false)
        setMedioPago('EFECTIVO')
        setMontoEfectivo('')
        setMontoOtro('')
        setCustomerName('')
        setCustomerPhone('')
        setCustomerEmail('')
    }

    const handleScanOld = async (qr) => {
        setLoading(true)
        try {
            const res = await getUnitForSale(qr, false) // false means include sold units
            if (res.success) {
                if (res.data.estado !== 'VENDIDO' && res.data.estado !== 'VENDIDO_ONLINE') {
                    throw new Error('Esta unidad no está marcada como vendida.')
                }
                setOldUnit(res.data)
            } else {
                setError(res.message)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleScanNew = async (qr) => {
        setLoading(true)
        try {
            const res = await getUnitForSale(qr)
            if (res.success) {
                setNewUnit(res.data)
            } else {
                setError(res.message)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const difference = (newUnit?.variantes.precio_lista || 0) - (oldUnit?.ventas?.total || 0)
    // Pre-calculated prices for split payment calculation (rounded up to 1000)
    const precioEfectivoDiff = Math.ceil((difference * (100 / 121)) / 1000) * 1000

    const handleConfirmExchange = async () => {
        setLoading(true)
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
                }
            }

            const res = await recordProductExchange(
                oldUnit.id,
                newUnit.codigo_qr,
                difference > 0 ? difference : 0,
                medioPago,
                options
            )

            if (res.success) {
                setSuccess(true)
            } else {
                setError(res.message)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="grid mt-lg text-center">
                <div style={{ fontSize: '4rem' }}>🔄✅</div>
                <h2>Cambio Realizado</h2>
                <div className="card mt-lg">
                    <p style={{ opacity: 0.6 }}>Nuevo par entregado:</p>
                    <h4 style={{ margin: '10px 0' }}>{newUnit.variantes.modelos.descripcion}</h4>
                    <p>{newUnit.variantes.color} • Talle {newUnit.talle_especifico}</p>
                </div>
                <Link href="/" className="btn-primary mt-lg">Volver al Inicio</Link>
            </div>
        )
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Cambio de Producto</h1>
                <p style={{ opacity: 0.7 }}>Siga los pasos para procesar el cambio</p>
            </header>

            {error && <div className="card text-center" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>{error}</div>}

            {/* STEP 1: SCAN OLD PRODUCT */}
            {!oldUnit ? (
                <div className="grid">
                    <QRScanner onScanSuccess={handleScanOld} label="1. Escanee el producto que DEVUELVEN" />
                    <Link href="/" className="btn-secondary mt-md text-center">Cancelar y Volver</Link>
                </div>
            ) : (
                <div className="card" style={{ border: '1px solid var(--accent)', background: 'rgba(16, 185, 129, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ fontSize: '0.7rem', opacity: 0.6 }}>PRODUCTO DEVUELTO:</p>
                            <h4 style={{ margin: 0 }}>{oldUnit.variantes.modelos.descripcion}</h4>
                            <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Talle {oldUnit.talle_especifico} • Vendido a: <strong>${oldUnit.ventas?.total.toLocaleString()}</strong></p>
                        </div>
                        <button className="btn-secondary" onClick={() => setOldUnit(null)} style={{ padding: '8px 12px', fontSize: '0.7rem' }}>🔄 Cambiar</button>
                    </div>
                </div>
            )}

            {/* STEP 2: SCAN NEW PRODUCT */}
            {oldUnit && !newUnit && (
                <div className="grid mt-md">
                    <QRScanner onScanSuccess={handleScanNew} label="2. Escanee el producto que se LLEVAN" />
                    <button className="btn-secondary mt-md" onClick={resetState}>Cancelar Cambio</button>
                </div>
            )}

            {/* STEP 3: SHOW DIFFERENCE AND PAYMENT */}
            {oldUnit && newUnit && (
                <div className="grid mt-md">
                    <div className="card" style={{ border: '1px solid var(--accent)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ fontSize: '0.7rem', opacity: 0.6 }}>PRODUCTO NUEVO:</p>
                                <h4 style={{ margin: 0 }}>{newUnit.variantes.modelos.descripcion}</h4>
                                <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Talle {newUnit.talle_especifico} • Precio Lista: <strong>${newUnit.variantes.precio_lista.toLocaleString()}</strong></p>
                            </div>
                            <button className="btn-secondary" onClick={() => setNewUnit(null)} style={{ padding: '8px 12px', fontSize: '0.7rem' }}>🔄 Cambiar</button>
                        </div>
                    </div>

                    <div className="card mt-md text-center" style={{ background: difference > 0 ? 'rgba(234, 179, 8, 0.1)' : 'rgba(16, 185, 129, 0.1)' }}>
                        <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>DIFERENCIA A COBRAR:</p>
                        <h2 style={{ margin: 0, color: difference > 0 ? '#eab308' : 'var(--accent)' }}>
                            $ {difference > 0 ? difference.toLocaleString() : '0 (Sin cargo)'}
                        </h2>
                        {difference < 0 && <p style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '5px' }}>Queda un saldo a favor del cliente de ${Math.abs(difference).toLocaleString()}</p>}
                    </div>

                    {difference > 0 && (
                        <div className="grid mt-md">
                            <label style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px', display: 'block' }}>Medio de pago para la diferencia:</label>
                            <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} className="input-field">
                                <option value="EFECTIVO">Efectivo (Con Descuento) 💵</option>
                                <option value="TRANSFERENCIA">Transferencia 📱</option>
                                <option value="TARJETA_DEBITO">Tarjeta Débito 💳</option>
                                <option value="TARJETA_CREDITO">Tarjeta Crédito 💳</option>
                                <option value="DIVIDIR_PAGOS">Dividir Pago ⚖️</option>
                            </select>

                            {medioPago === 'EFECTIVO' && (
                                <div className="card text-center" style={{ background: 'var(--secondary)', padding: '10px' }}>
                                    <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>Total con descuento Efectivo (Redondeado):</p>
                                    <h3 style={{ margin: 0, color: 'var(--accent)' }}>$ {precioEfectivoDiff.toLocaleString()}</h3>
                                </div>
                            )}

                            {medioPago === 'DIVIDIR_PAGOS' && (
                                <div className="card grid mt-sm" style={{ gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '15px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', opacity: 0.6 }}>Monto Efectivo:</label>
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            className="input-field"
                                            value={montoEfectivo}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setMontoEfectivo(val);
                                                if (val && !isNaN(val)) {
                                                    const portion = parseFloat(val) / precioEfectivoDiff;
                                                    const remaining = Math.round(difference * (1 - portion));
                                                    setMontoOtro(remaining > 0 ? remaining : 0);
                                                } else {
                                                    setMontoOtro('');
                                                }
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', opacity: 0.6 }}>Segundo Medio:</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <select value={otroMedioPago} onChange={(e) => setOtroMedioPago(e.target.value)} className="input-field" style={{ flex: 1 }}>
                                                <option value="TARJETA_DEBITO">Débito</option>
                                                <option value="TARJETA_CREDITO">Crédito</option>
                                                <option value="TRANSFERENCIA">Transf.</option>
                                                <option value="QR">QR</option>
                                            </select>
                                            <input type="number" value={montoOtro} readOnly className="input-field" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--accent)', fontWeight: 'bold' }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

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

                    <div style={{ display: 'flex', gap: '10px', marginTop: 'var(--spacing-lg)' }}>
                        <button className="btn-primary" style={{ flex: 2, height: '60px' }} onClick={handleConfirmExchange} disabled={loading}>
                            {loading ? 'Procesando...' : 'Confirmar Cambio ✅'}
                        </button>
                        <button className="btn-secondary" style={{ flex: 1 }} onClick={resetState}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
