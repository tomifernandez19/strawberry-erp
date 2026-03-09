'use client'
import { useState } from 'react'
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

    // State for split payments
    const [montoEfectivo, setMontoEfectivo] = useState('')
    const [montoOtro, setMontoOtro] = useState('')
    const [otroMedioPago, setOtroMedioPago] = useState('TARJETA_DEBITO')

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
                descuento: Number(descuento)
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
    }

    const totals = () => {
        let totalLista = 0
        let totalEfectivo = 0

        items.forEach(it => {
            totalLista += it.variantes.precio_lista || 0
            totalEfectivo += it.variantes.precio_efectivo || 0
        })

        const totalMayorista = Math.round(totalEfectivo * 0.9)

        let finalTotal = totalLista
        if (medioPago === 'EFECTIVO' || medioPago === 'TRANSFERENCIA') finalTotal = totalEfectivo
        else if (medioPago === 'MAYORISTA_EFECTIVO') finalTotal = totalMayorista
        else if (medioPago === 'DIVIDIR_PAGOS') finalTotal = (Number(montoEfectivo) + Number(montoOtro)) || 0

        if (descuento > 0) {
            finalTotal = Math.round(finalTotal * (1 - (descuento / 100)))
        }

        return { totalLista, totalEfectivo, totalMayorista, finalTotal }
    }

    const { totalLista, totalEfectivo, totalMayorista, finalTotal } = totals()

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
                            <div className="card text-center" style={{ padding: '8px 2px', background: (medioPago === 'EFECTIVO' || medioPago === 'TRANSFERENCIA') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)', border: (medioPago === 'EFECTIVO' || medioPago === 'TRANSFERENCIA') ? '1px solid var(--accent)' : '1px solid transparent' }}>
                                <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>Efe/Tra</p>
                                <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>${totalEfectivo.toLocaleString()}</p>
                            </div>
                            <div className="card text-center" style={{ padding: '8px 2px', background: medioPago === 'MAYORISTA_EFECTIVO' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)', border: medioPago === 'MAYORISTA_EFECTIVO' ? '1px solid var(--accent)' : '1px solid transparent' }}>
                                <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>Mayorista</p>
                                <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>${totalMayorista.toLocaleString()}</p>
                            </div>
                            <div className="card text-center" style={{ padding: '8px 2px', background: !['EFECTIVO', 'TRANSFERENCIA', 'MAYORISTA_EFECTIVO', 'DIVIDIR_PAGOS'].includes(medioPago) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)', border: !['EFECTIVO', 'TRANSFERENCIA', 'MAYORISTA_EFECTIVO', 'DIVIDIR_PAGOS'].includes(medioPago) ? '1px solid var(--accent)' : '1px solid transparent' }}>
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
                                <option value="TRANSFERENCIA">Transferencia 📱</option>
                                <option value="MAYORISTA_EFECTIVO">Mayorista Efectivo 📦</option>
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
                                $ {finalTotal.toLocaleString()}
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
