'use client'
import { useState, useEffect } from 'react'
import { getUnitForSale, recordProductExchange } from '@/lib/actions'
import QRScanner from '@/components/QRScanner'
import Link from 'next/link'

export default function CambiosPage() {
    const [oldUnit, setOldUnit] = useState(null)
    const [newUnits, setNewUnits] = useState([]) // array of units
    const [scanningNew, setScanningNew] = useState(false) // show scanner for next new unit
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)

    const [medioPago, setMedioPago] = useState('EFECTIVO')
    const [montoEfectivo, setMontoEfectivo] = useState('')
    const [montoOtro, setMontoOtro] = useState('')
    const [otroMedioPago, setOtroMedioPago] = useState('TARJETA_DEBITO')
    const [customerName, setCustomerName] = useState('')
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerEmail, setCustomerEmail] = useState('')
    const [manualDifference, setManualDifference] = useState('')
    const [manualQR, setManualQR] = useState('')

    const resetState = () => {
        setOldUnit(null)
        setNewUnits([])
        setScanningNew(false)
        setError('')
        setLoading(false)
        setSuccess(false)
        setMedioPago('EFECTIVO')
        setMontoEfectivo('')
        setMontoOtro('')
        setCustomerName('')
        setCustomerPhone('')
        setCustomerEmail('')
        setManualDifference('')
        setManualQR('')
    }

    const handleScanOld = async (qr) => {
        const match = (qr || '').match(/ST-\d{6}/i)
        const cleanQr = match ? match[0].toUpperCase() : qr.toUpperCase().trim()
        if (!cleanQr) return
        setLoading(true)
        setError('')
        try {
            const res = await getUnitForSale(cleanQr, 'SOLD')
            if (res.success) setOldUnit(res.data)
            else setError(res.message)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleScanNew = async (qr) => {
        const match = (qr || '').match(/ST-\d{6}/i)
        const cleanQr = match ? match[0].toUpperCase() : qr.toUpperCase().trim()
        if (!cleanQr) return
        // Check for duplicate
        if (newUnits.some(u => u.codigo_qr === cleanQr)) {
            setError('Este producto ya fue agregado.')
            return
        }
        setLoading(true)
        setError('')
        try {
            const res = await getUnitForSale(cleanQr)
            if (res.success) {
                setNewUnits(prev => [...prev, res.data])
                setScanningNew(false)
            } else {
                setError(res.message)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const removeNewUnit = (idx) => {
        setNewUnits(prev => prev.filter((_, i) => i !== idx))
    }

    const returnValue = oldUnit?.ventas?.monto_neto != null
        ? Math.floor(oldUnit.ventas.monto_neto / 1000) * 1000
        : (oldUnit?.ventas?.total || 0)

    const totalNewPrice = newUnits.reduce((s, u) => s + (u.variantes?.precio_lista || 0), 0)
    const calculatedDiff = totalNewPrice - returnValue

    useEffect(() => {
        if (oldUnit && newUnits.length > 0) {
            const diff = calculatedDiff
            setManualDifference(diff > 0 ? diff : 0)
        } else {
            setManualDifference('')
        }
    }, [oldUnit, newUnits.length, totalNewPrice])

    const currentDiff = parseFloat(manualDifference) || 0
    const precioEfectivoDiff = Math.ceil((currentDiff * (100 / 121)) / 1000) * 1000

    const handleManualSubmitOld = (e) => {
        e.preventDefault()
        if (!manualQR) return
        handleScanOld(manualQR)
        setManualQR('')
    }

    const handleManualSubmitNew = (e) => {
        e.preventDefault()
        if (!manualQR) return
        handleScanNew(manualQR)
        setManualQR('')
    }

    const handleConfirmExchange = async () => {
        if (!oldUnit || newUnits.length === 0) return
        setLoading(true)
        try {
            const diffNum = parseFloat(manualDifference) || 0
            const options = {
                ...(medioPago === 'DIVIDIR_PAGOS' ? {
                    monto_efectivo: parseFloat(montoEfectivo),
                    monto_otro: parseFloat(montoOtro),
                    otro_medio_pago: otroMedioPago
                } : {}),
                customerData: { nombre: customerName, telefono: customerPhone, email: customerEmail }
            }
            const res = await recordProductExchange(
                oldUnit.id,
                newUnits.map(u => u.codigo_qr),
                diffNum,
                medioPago,
                options
            )
            if (res.success) setSuccess(true)
            else setError(res.message)
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
                    <p style={{ opacity: 0.6 }}>Productos entregados:</p>
                    {newUnits.map((u, i) => (
                        <p key={i} style={{ margin: '4px 0', fontWeight: 'bold' }}>
                            {u.variantes.modelos.descripcion} — {u.variantes.color} Talle {u.talle_especifico}
                        </p>
                    ))}
                </div>
                <Link href="/" className="btn-primary mt-lg" style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Volver al Inicio</Link>
            </div>
        )
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Cambio de Producto</h1>
                <p style={{ opacity: 0.7 }}>Siga los pasos para procesar el cambio</p>
            </header>

            {error && <div className="card text-center" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', marginBottom: '20px' }}>{error}</div>}

            {/* STEP 1: SCAN OLD PRODUCT */}
            {!oldUnit ? (
                <div className="grid">
                    <QRScanner onScanSuccess={handleScanOld} label="1. Escanee el producto que DEVUELVEN" />
                    <div className="card mt-md" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--card-border)' }}>
                        <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '10px' }}>¿No funciona la cámara? Ingreso manual:</p>
                        <form onSubmit={handleManualSubmitOld} style={{ display: 'flex', gap: '10px' }}>
                            <input type="text" className="input-field" placeholder="ST-000000" value={manualQR} onChange={e => setManualQR(e.target.value.toUpperCase())} style={{ margin: 0 }} />
                            <button type="submit" className="btn-primary" style={{ padding: '0 20px' }}>OK</button>
                        </form>
                    </div>
                    <Link href="/" className="btn-secondary mt-lg text-center" style={{ padding: '12px' }}>Cancelar y Volver</Link>
                </div>
            ) : (
                <div className="card" style={{ border: '1px solid var(--accent)', background: 'rgba(16, 185, 129, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ fontSize: '0.7rem', opacity: 0.6 }}>PRODUCTO DEVUELTO:</p>
                            <h4 style={{ margin: 0 }}>{oldUnit.variantes.modelos.descripcion}</h4>
                            <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                Talle {oldUnit.talle_especifico} • Crédito: <strong>${returnValue.toLocaleString()}</strong>
                            </p>
                        </div>
                        <button className="btn-secondary" onClick={() => setOldUnit(null)} style={{ padding: '8px 12px', fontSize: '0.7rem' }}>🔄 Cambiar</button>
                    </div>
                </div>
            )}

            {/* STEP 2: NEW PRODUCTS */}
            {oldUnit && (
                <div className="grid mt-md">
                    <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                        Productos nuevos ({newUnits.length})
                    </p>

                    {newUnits.map((u, i) => (
                        <div key={u.id} className="card" style={{ border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.05)', padding: '12px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <p style={{ fontSize: '0.7rem', opacity: 0.6, margin: 0 }}>PRODUCTO {i + 1}:</p>
                                    <p style={{ margin: '2px 0', fontWeight: 'bold' }}>{u.variantes.modelos.descripcion}</p>
                                    <p style={{ fontSize: '0.8rem', opacity: 0.8, margin: 0 }}>
                                        {u.variantes.color} • Talle {u.talle_especifico} • <strong>${u.variantes.precio_lista?.toLocaleString()}</strong>
                                    </p>
                                </div>
                                <button onClick={() => removeNewUnit(i)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>✕ Quitar</button>
                            </div>
                        </div>
                    ))}

                    {/* Scanner for next new product */}
                    {scanningNew ? (
                        <div className="card mt-sm" style={{ border: '1px dashed rgba(99,102,241,0.4)' }}>
                            <QRScanner onScanSuccess={handleScanNew} label={`Escanear producto ${newUnits.length + 1}`} />
                            <div className="mt-md">
                                <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '8px' }}>Ingreso manual:</p>
                                <form onSubmit={handleManualSubmitNew} style={{ display: 'flex', gap: '10px' }}>
                                    <input type="text" className="input-field" placeholder="ST-000000" value={manualQR} onChange={e => setManualQR(e.target.value.toUpperCase())} style={{ margin: 0 }} />
                                    <button type="submit" className="btn-primary" style={{ padding: '0 20px' }}>OK</button>
                                </form>
                            </div>
                            <button className="btn-secondary mt-sm" onClick={() => { setScanningNew(false); setError('') }} style={{ width: '100%', padding: '10px' }}>Cancelar</button>
                        </div>
                    ) : (
                        <button
                            className="btn-secondary mt-sm"
                            onClick={() => { setScanningNew(true); setError('') }}
                            style={{ padding: '14px', border: '2px dashed rgba(99,102,241,0.4)', color: 'rgba(99,102,241,0.9)', background: 'rgba(99,102,241,0.05)' }}
                        >
                            ➕ {newUnits.length === 0 ? 'Escanear producto nuevo' : 'Agregar otro producto'}
                        </button>
                    )}
                </div>
            )}

            {/* STEP 3: DIFFERENCE AND PAYMENT */}
            {oldUnit && newUnits.length > 0 && !scanningNew && (
                <div className="grid mt-md">
                    {newUnits.length > 1 && (
                        <div className="card" style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 16px', fontSize: '0.85rem' }}>
                            <span style={{ opacity: 0.6 }}>Total productos nuevos: </span>
                            <strong>${totalNewPrice.toLocaleString()}</strong>
                            <span style={{ opacity: 0.4, marginLeft: '8px' }}>— Crédito: ${returnValue.toLocaleString()}</span>
                        </div>
                    )}

                    <div className="card mt-sm text-center" style={{ background: currentDiff > 0 ? 'rgba(234, 179, 8, 0.1)' : 'rgba(16, 185, 129, 0.1)' }}>
                        <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px' }}>DIFERENCIA A COBRAR (EDITABLE):</p>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>$</span>
                            <input
                                type="number"
                                className="input-field"
                                value={manualDifference}
                                onChange={(e) => setManualDifference(e.target.value)}
                                style={{ maxWidth: '150px', textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold', margin: 0, border: 'none', background: 'transparent', color: currentDiff > 0 ? '#eab308' : 'var(--accent)' }}
                            />
                        </div>
                        {calculatedDiff !== currentDiff && (
                            <p style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '5px' }}>Calculado: ${calculatedDiff.toLocaleString()}</p>
                        )}
                        {currentDiff <= 0 && <p style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '5px' }}>Sin cargo (Cambio directo)</p>}
                    </div>

                    {currentDiff > 0 && (
                        <div className="grid mt-md">
                            <label style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px', display: 'block' }}>Medio de pago para la diferencia:</label>
                            <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} className="input-field">
                                <option value="EFECTIVO">Efectivo (Con Descuento) 💵</option>
                                <option value="TRANSFERENCIA_LUCAS">Transferencia Lucas 📱</option>
                                <option value="TRANSFERENCIA_TOMI">Transferencia Tomi 📱</option>
                                <option value="TRANSFERENCIA_PROVEEDOR">Transferencia Proveedor 📱</option>
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
                                                const val = e.target.value
                                                setMontoEfectivo(val)
                                                if (val && !isNaN(val)) {
                                                    const portion = parseFloat(val) / precioEfectivoDiff
                                                    const remaining = Math.round(currentDiff * (1 - portion))
                                                    setMontoOtro(remaining > 0 ? remaining : 0)
                                                } else {
                                                    setMontoOtro('')
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
                                                <option value="TRANSFERENCIA_PROVEEDOR">Transf. Prov.</option>
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
                            <input type="text" placeholder="Nombre completo" className="input-field" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ fontSize: '0.85rem' }} />
                            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <input type="tel" placeholder="Teléfono" className="input-field" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} style={{ fontSize: '0.85rem' }} />
                                <input type="email" placeholder="Email" className="input-field" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} style={{ fontSize: '0.85rem' }} />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: 'var(--spacing-lg)' }}>
                        <button className="btn-primary" style={{ flex: 2, height: '60px' }} onClick={handleConfirmExchange} disabled={loading}>
                            {loading ? 'Procesando...' : 'Confirmar Cambio ✅'}
                        </button>
                        <button className="btn-secondary" style={{ flex: 1 }} onClick={resetState}>Cancelar</button>
                    </div>
                </div>
            )}

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
