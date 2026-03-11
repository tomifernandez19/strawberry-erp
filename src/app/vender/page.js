'use client'
import { useState, useEffect } from 'react'
import QRScanner from '@/components/QRScanner'
import ManualSelector from '@/components/ManualSelector'
import { getUnitForSale, recordSale } from '@/lib/actions'

export default function VenderPage() {
    const [items, setItems] = useState([])
    const [saleResult, setSaleResult] = useState(null)
    const [customerName, setCustomerName] = useState('')
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerEmail, setCustomerEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [medioPago, setMedioPago] = useState('EFECTIVO')
    const [descuento, setDescuento] = useState(0)
    const [montoAbonado, setMontoAbonado] = useState('')

    const [montoEfectivo, setMontoEfectivo] = useState('')
    const [montoOtro, setMontoOtro] = useState('')
    const [otroMedioPago, setOtroMedioPago] = useState('TARJETA_DEBITO')
    const [montoNeto, setMontoNeto] = useState('')
    const [diasAcreditacion, setDiasAcreditacion] = useState(18)

    // Auto-defaults for accreditation days
    useEffect(() => {
        const isDivided = medioPago === 'DIVIDIR_PAGOS'
        const activeMethod = isDivided ? otroMedioPago : medioPago

        if (activeMethod === 'TARJETA_DEBITO') setDiasAcreditacion(1)
        else if (activeMethod === 'TARJETA_CREDITO') setDiasAcreditacion(18)
        else if (activeMethod === 'QR_LISTA') setDiasAcreditacion(0) // Usually MP/QR is instant

        // Reset neto when method changes to trigger focus/manual entry
        setMontoNeto('')
    }, [medioPago, otroMedioPago])

    const addItem = async (qrCode) => {
        if (items.some(it => it.codigo_qr === qrCode)) {
            setError('Este producto ya está en la lista')
            return
        }

        setLoading(true)
        setError('')
        try {
            const result = await getUnitForSale(qrCode)
            if (result.success) {
                setItems(prev => [...prev, result.data])
            } else {
                setError(result.message)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const removeItem = (qrCode) => {
        setItems(prev => prev.filter(it => it.codigo_qr !== qrCode))
    }

    const handleConfirmSale = async () => {
        if (items.length === 0) return

        if (medioPago === 'DIVIDIR_PAGOS') {
            if (!montoEfectivo || !montoOtro) {
                setError('Debe completar ambos montos para el pago dividido.')
                return
            }
        }

        setLoading(true)
        setError('')
        try {
            const qrCodes = items.map(it => it.codigo_qr)
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
                descuento: Number(descuento),
                monto_neto: parseFloat(montoNeto) || null,
                dias_acreditacion: parseInt(diasAcreditacion) || 0
            }

            const result = await recordSale(qrCodes, medioPago, options)
            setSaleResult(result)
            setItems([])
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const resetSale = () => {
        setSaleResult(null)
        setItems([])
        setError('')
        setMontoEfectivo('')
        setMontoOtro('')
        setMedioPago('EFECTIVO')
        setCustomerName('')
        setCustomerPhone('')
        setCustomerEmail('')
        setDescuento(0)
        setMontoAbonado('')
    }

    const totals = () => {
        let totalLista = 0
        let totalEfectivo = 0

        items.forEach(it => {
            totalLista += it.variantes.precio_lista || 0
            totalEfectivo += it.variantes.precio_efectivo || 0
        })

        const totalMayorista = Math.round(totalEfectivo * 0.9)

        let baseTotal = totalLista
        const esEfeOTra = ['EFECTIVO', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_PROVEEDOR'].includes(medioPago)

        if (esEfeOTra) baseTotal = totalEfectivo
        else if (medioPago === 'MAYORISTA_EFECTIVO') baseTotal = totalMayorista
        else if (medioPago === 'DIVIDIR_PAGOS') baseTotal = (Number(montoEfectivo) + Number(montoOtro)) || 0

        let finalTotal = baseTotal
        if (descuento > 0) {
            finalTotal = Math.round(baseTotal * (1 - (descuento / 100)))
        }

        return { totalLista, totalEfectivo, totalMayorista, baseTotal, finalTotal }
    }

    const { totalLista, totalEfectivo, totalMayorista, baseTotal, finalTotal } = totals()

    if (saleResult) {
        return (
            <div className="grid mt-lg text-center">
                <div style={{ fontSize: '4rem' }}>✅</div>
                <h2>Venta Realizada</h2>
                <div className="card mt-lg">
                    <p style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '1.5rem' }}>
                        $ {saleResult.venta.total.toLocaleString()}
                    </p>
                    <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>{saleResult.venta.medio_pago.replace('_', ' ')}</p>
                    <div style={{ marginTop: '15px' }}>
                        {saleResult.units.map(u => (
                            <p key={u.id} style={{ fontSize: '0.9rem' }}>
                                • {u.variantes.modelos.descripcion} ({u.variantes.color}) T{u.talle_especifico}
                            </p>
                        ))}
                    </div>
                </div>
                <button className="btn-primary mt-lg" onClick={resetSale}>Nueva Venta</button>
            </div>
        )
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Nueva Venta</h1>
                <p style={{ opacity: 0.7 }}>Agregue productos para iniciar la venta</p>
            </header>

            {error && (
                <div className="card" style={{ borderColor: 'var(--error)', backgroundColor: 'rgba(239, 68, 68, 0.1)', textAlign: 'center', padding: '15px' }}>
                    {error}
                </div>
            )}

            <div className="grid">
                <QRScanner onScanSuccess={addItem} label="Escanear producto" />

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
                                if (e.key === 'Enter') {
                                    addItem(e.target.value.toUpperCase())
                                    e.target.value = ''
                                }
                            }}
                        />
                        <button className="btn-primary" onClick={() => {
                            const inp = document.getElementById('manualSaleQR')
                            addItem(inp.value.toUpperCase())
                            inp.value = ''
                        }}>
                            Ver
                        </button>
                    </div>
                </div>

                <ManualSelector onSelect={addItem} loading={loading} />
            </div>

            {items.length > 0 && (
                <div className="grid mt-xl">
                    <h3 style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '10px' }}>
                        Carrito ({items.length})
                    </h3>
                    {items.map(it => (
                        <div key={it.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px' }}>
                            <div>
                                <h4 style={{ margin: 0 }}>{it.variantes.modelos.descripcion}</h4>
                                <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>{it.variantes.color} • Talle {it.talle_especifico}</p>
                            </div>
                            <button
                                className="btn-secondary"
                                style={{ padding: '5px 10px', color: 'var(--error)', minWidth: 'auto', border: '1px solid var(--error)' }}
                                onClick={() => removeItem(it.codigo_qr)}
                            >
                                ✕
                            </button>
                        </div>
                    ))}

                    <section className="card mt-lg" style={{ border: '2px solid var(--accent)' }}>
                        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
                            <div className="card text-center" style={{
                                padding: '8px 2px',
                                background: ['EFECTIVO', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_PROVEEDOR'].includes(medioPago) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                                border: ['EFECTIVO', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_PROVEEDOR'].includes(medioPago) ? '1px solid var(--accent)' : '1px solid transparent'
                            }}>
                                <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>Efe/Tra</p>
                                <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>${totalEfectivo.toLocaleString()}</p>
                            </div>
                            <div className="card text-center" style={{ padding: '8px 2px', background: medioPago === 'MAYORISTA_EFECTIVO' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)', border: medioPago === 'MAYORISTA_EFECTIVO' ? '1px solid var(--accent)' : '1px solid transparent' }}>
                                <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>Mayorista</p>
                                <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>${totalMayorista.toLocaleString()}</p>
                            </div>
                            <div className="card text-center" style={{
                                padding: '8px 2px',
                                background: !['EFECTIVO', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_PROVEEDOR', 'MAYORISTA_EFECTIVO', 'DIVIDIR_PAGOS'].includes(medioPago) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                                border: !['EFECTIVO', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_PROVEEDOR', 'MAYORISTA_EFECTIVO', 'DIVIDIR_PAGOS'].includes(medioPago) ? '1px solid var(--accent)' : '1px solid transparent'
                            }}>
                                <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>Lista</p>
                                <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>${totalLista.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="mt-lg">
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Medio de Pago:</label>
                            <select
                                value={medioPago}
                                onChange={(e) => setMedioPago(e.target.value)}
                                className="input-field"
                            >
                                <option value="EFECTIVO">Efectivo 💵</option>
                                <option value="MAYORISTA_EFECTIVO">Mayorista Efectivo 📦</option>
                                <option value="TRANSFERENCIA_TOMI">Transferencia Tomi 📱</option>
                                <option value="TRANSFERENCIA_LUCAS">Transferencia Lucas 📱</option>
                                <option value="TRANSFERENCIA_PROVEEDOR">Transferencia Proveedor 🚚</option>
                                <option value="TARJETA_DEBITO">Tarjeta Débito (Sofi) 💳</option>
                                <option value="TARJETA_CREDITO">Tarjeta Crédito (Sofi) 💳</option>
                                <option value="QR_LISTA">QR Pago / Otros (Sofi) 🔘</option>
                                <option value="DIVIDIR_PAGOS">Dividir Pago (Efe + Otro) ⚖️</option>
                            </select>
                        </div>

                        {['TARJETA_DEBITO', 'TARJETA_CREDITO', 'QR_LISTA'].includes(medioPago) && (
                            <div className="card mt-md grid" style={{ gap: '10px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent)', margin: 0 }}>Detalle de Cobro (Sofi):</p>
                                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', opacity: 0.6 }}>Monto Neto ($):</label>
                                        <input
                                            type="number"
                                            className="input-field"
                                            placeholder="Lo que entra"
                                            value={montoNeto}
                                            onChange={(e) => setMontoNeto(e.target.value)}
                                        />
                                        <p style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: '2px' }}>Estimado: ${(finalTotal * 0.942).toFixed(0)}</p>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', opacity: 0.6 }}>Días p/ Cobrar:</label>
                                        <input
                                            type="number"
                                            className="input-field"
                                            value={diasAcreditacion}
                                            onChange={(e) => setDiasAcreditacion(e.target.value)}
                                        />
                                        <p style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: '2px' }}>0 = Al instante</p>
                                    </div>
                                </div>
                            </div>
                        )}

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
                                            if (val && !isNaN(val)) {
                                                const efeAmount = parseFloat(val);
                                                const portionOfCashPrice = efeAmount / totalEfectivo;
                                                const remainingListPrice = Math.round(totalLista * (1 - portionOfCashPrice));
                                                setMontoOtro(remainingListPrice > 0 ? remainingListPrice : 0);
                                            } else {
                                                setMontoOtro('');
                                            }
                                        }}
                                        className="input-field"
                                        placeholder={`Máx: $${totalEfectivo}`}
                                    />
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
                                </div>
                                {['TARJETA_DEBITO', 'TARJETA_CREDITO', 'QR_LISTA'].includes(otroMedioPago) && (
                                    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px', padding: '10px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', opacity: 0.6 }}>Monto Neto Tarjeta ($):</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                placeholder="Lo que entra"
                                                value={montoNeto}
                                                onChange={(e) => setMontoNeto(e.target.value)}
                                            />
                                            <p style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: '2px' }}>Estimado: ${(Number(montoOtro) * 0.942).toFixed(0)}</p>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', opacity: 0.6 }}>Días p/ Cobrar:</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={diasAcreditacion}
                                                onChange={(e) => setDiasAcreditacion(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="card mt-md" style={{ border: '1px solid rgba(59, 130, 246, 0.2)', background: 'rgba(59, 130, 246, 0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', opacity: 0.8 }}>¿Cuánto le vas a cobrar? ($)</label>
                                {descuento > 0 && <span className="badge" style={{ backgroundColor: 'var(--accent)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>-{descuento}% OFF</span>}
                            </div>

                            <div className="grid" style={{ gap: '10px' }}>
                                <div style={{ position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>$</span>
                                    <input
                                        type="number"
                                        className="input-field"
                                        placeholder={`Base: $${baseTotal}`}
                                        style={{ margin: 0, paddingLeft: '30px', fontWeight: 'bold', color: 'var(--accent)', fontSize: '1.2rem' }}
                                        value={finalTotal}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (!val || parseFloat(val) >= baseTotal) {
                                                setDescuento(0);
                                            } else {
                                                const final = parseFloat(val);
                                                const pct = Math.round(((baseTotal - final) / baseTotal) * 100);
                                                setDescuento(pct > 0 ? (pct > 100 ? 100 : pct) : 0);
                                            }
                                        }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                    {[5, 10, 15, 20, 25].map(pct => (
                                        <button
                                            key={pct}
                                            type="button"
                                            className="btn-secondary"
                                            style={{
                                                flex: 1,
                                                padding: '8px 5px',
                                                fontSize: '0.75rem',
                                                minWidth: 'auto',
                                                border: descuento === pct ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
                                                background: descuento === pct ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)'
                                            }}
                                            onClick={() => setDescuento(pct)}
                                        >
                                            {pct}%
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ flex: 1, padding: '8px 5px', fontSize: '0.75rem', color: '#ef4444' }}
                                        onClick={() => setDescuento(0)}
                                    >
                                        Limpiar
                                    </button>
                                </div>
                            </div>
                        </div>


                        {['EFECTIVO', 'MAYORISTA_EFECTIVO', 'DIVIDIR_PAGOS', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_PROVEEDOR'].includes(medioPago) && (
                            <div className="mt-md" style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: '15px', alignItems: 'center' }}>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block', marginBottom: '4px' }}>¿CON CUÁNTO PAGA?</label>
                                        <input
                                            type="number"
                                            className="input-field"
                                            style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}
                                            placeholder="Monto recibido"
                                            value={montoAbonado}
                                            onChange={(e) => setMontoAbonado(e.target.value)}
                                        />
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>VUELTO:</p>
                                        <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: (Number(montoAbonado) - (medioPago === 'DIVIDIR_PAGOS' ? Number(montoEfectivo) : finalTotal)) >= 0 ? 'var(--accent)' : '#ef4444' }}>
                                            $ {Math.max(0, (Number(montoAbonado) - (medioPago === 'DIVIDIR_PAGOS' ? Number(montoEfectivo) : finalTotal))).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
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
                                />
                                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <input
                                        type="tel"
                                        placeholder="Teléfono"
                                        className="input-field"
                                        value={customerPhone}
                                        onChange={(e) => setCustomerPhone(e.target.value)}
                                    />
                                    <input
                                        type="email"
                                        placeholder="Email"
                                        className="input-field"
                                        value={customerEmail}
                                        onChange={(e) => setCustomerEmail(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid mt-lg" style={{ gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <button className="btn-secondary" onClick={resetSale} disabled={loading}>
                                Cancelar
                            </button>
                            <button className="btn-primary" onClick={handleConfirmSale} disabled={loading} style={{ background: 'var(--accent)' }}>
                                {loading ? 'Procesando...' : `Confirmar Venta (${items.length})`}
                            </button>
                        </div>
                    </section>
                </div>
            )}
            <div style={{ height: '80px' }}></div>
        </div>
    )
}
