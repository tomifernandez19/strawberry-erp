'use client'
import { useState, useEffect } from 'react'
import { recordCashMovement, getRecentUnifiedCaja, getFinanceSummary } from '@/lib/actions'
import { useRouter } from 'next/navigation'

export default function CajaPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [movements, setMovements] = useState([])
    const [balances, setBalances] = useState(null)
    const [suggestions, setSuggestions] = useState([])
    const [activeTab, setActiveTab] = useState('GASTO') // GASTO, INGRESO, TRASPASO, AJUSTE

    const [formData, setFormData] = useState({
        monto: '',
        motivo: '',
        persona: '',
        cuenta: 'CAJA_LOCAL',
        haciaCuenta: 'SOFI_MP',
        categoria: 'GASTOS_GENERALES',
        origenDinero: 'NEGOCIO', // 'NEGOCIO' or 'BOLSILLO' (for GASTO)
        tipoAjuste: 'INGRESO' // For AJUSTE (Intereses / Cargo)
    })

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        const [movs, fSummary, { getRecentPersonas }] = await Promise.all([
            getRecentUnifiedCaja(),
            getFinanceSummary(),
            import('@/lib/actions')
        ])
        setMovements(movs)
        setBalances(fSummary)
        const pers = await getRecentPersonas()
        setSuggestions(pers || [])
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.monto || !formData.motivo || !formData.persona) return

        setLoading(true)
        try {
            const { recordTransfer } = await import('@/lib/actions')
            const montoNum = parseFloat(formData.monto)

            if (activeTab === 'TRASPASO') {
                if (formData.cuenta === formData.haciaCuenta) throw new Error("Las cuentas deben ser distintas")
                // Check balance
                if (montoNum > (balances[formData.cuenta] || 0)) {
                    throw new Error(`Saldo insuficiente en ${formData.cuenta}. Disponible: $${balances[formData.cuenta]}`)
                }
                await recordTransfer({
                    from: formData.cuenta,
                    to: formData.haciaCuenta,
                    amount: montoNum,
                    reason: formData.motivo,
                    person: formData.persona.trim().toUpperCase()
                })

            } else if (activeTab === 'GASTO') {
                if (formData.origenDinero === 'BOLSILLO') {
                    // Two entries: One donation (virtual) and one expense
                    // We use 'PERSONAL' as account so it doesn't affect real bank balances
                    await recordCashMovement({
                        monto: montoNum,
                        tipo: 'INGRESO',
                        motivo: `APORTE (P/GASTO): ${formData.motivo}`,
                        persona: formData.persona.trim().toUpperCase(),
                        cuenta: 'PERSONAL',
                        categoria: 'APORTE_CAPITAL'
                    })
                    await recordCashMovement({
                        monto: montoNum,
                        tipo: 'EGRESO',
                        motivo: formData.motivo,
                        persona: formData.persona.trim().toUpperCase(),
                        cuenta: 'PERSONAL',
                        categoria: formData.categoria
                    })
                } else {
                    // Real money from business
                    if (montoNum > (balances[formData.cuenta] || 0)) {
                        throw new Error(`Saldo insuficiente. Disponible: $${balances[formData.cuenta]}`)
                    }
                    await recordCashMovement({
                        monto: montoNum,
                        tipo: 'EGRESO',
                        motivo: formData.motivo,
                        persona: formData.persona.trim().toUpperCase(),
                        cuenta: formData.cuenta,
                        categoria: formData.categoria
                    })
                }
            } else if (activeTab === 'INGRESO') {
                await recordCashMovement({
                    monto: montoNum,
                    tipo: 'INGRESO',
                    motivo: formData.motivo,
                    persona: formData.persona.trim().toUpperCase(),
                    cuenta: formData.cuenta,
                    categoria: formData.categoria // APORTE_CAPITAL, etc.
                })
            } else if (activeTab === 'AJUSTE') {
                await recordCashMovement({
                    monto: montoNum,
                    tipo: formData.tipoAjuste,
                    motivo: formData.motivo,
                    persona: formData.persona.trim().toUpperCase(),
                    cuenta: formData.cuenta,
                    categoria: 'INTERESES'
                })
            }

            setFormData({
                monto: '', motivo: '', persona: '',
                cuenta: 'CAJA_LOCAL', haciaCuenta: 'SOFI_MP',
                categoria: 'GASTOS_GENERALES', origenDinero: 'NEGOCIO',
                tipoAjuste: 'INGRESO'
            })
            await loadData()
            alert('Operación registrada')
        } catch (err) {
            alert('Error: ' + err.message)
        } finally {
            router.refresh()
            setLoading(false)
        }
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Dinero del Negocio</h1>
                <p style={{ opacity: 0.7 }}>Gestión de saldos y gastos</p>
            </header>

            {/* Panel de Saldos */}
            {balances && (
                <section className="card mt-lg" style={{ border: '2px solid var(--primary)', background: 'rgba(59, 130, 246, 0.05)' }}>
                    <p style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 'bold' }}>💵 SALDOS EN CUENTAS DEL LOCAL:</p>
                    <div className="grid mt-md" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                        <div className="card" style={{ padding: '10px', margin: 0, background: 'rgba(255,255,255,0.03)' }}>
                            <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>CAJA LOCAL</p>
                            <p style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--accent)' }}>$ {balances.CAJA_LOCAL.toLocaleString()}</p>
                        </div>
                        <div className="card" style={{ padding: '10px', margin: 0, background: 'rgba(255,255,255,0.03)' }}>
                            <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>SOFI (MP)</p>
                            <p style={{ fontWeight: 'bold', fontSize: '1rem' }}>$ {balances.SOFI_MP.toLocaleString()}</p>
                        </div>
                        <div className="card" style={{ padding: '10px', margin: 0, background: 'rgba(255,255,255,0.03)' }}>
                            <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>TOMI</p>
                            <p style={{ fontWeight: 'bold', fontSize: '1rem' }}>$ {balances.TOMI.toLocaleString()}</p>
                        </div>
                        <div className="card" style={{ padding: '10px', margin: 0, background: 'rgba(255,255,255,0.03)' }}>
                            <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>LUCAS</p>
                            <p style={{ fontWeight: 'bold', fontSize: '1rem' }}>$ {balances.LUCAS.toLocaleString()}</p>
                        </div>
                    </div>
                </section>
            )}

            {/* Formulario Principal */}
            <section className="card mt-lg">
                <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', borderBottom: '1px solid var(--card-border)', paddingBottom: '15px' }}>
                    {[
                        { id: 'GASTO', label: '💸 Gasto', color: '#ef4444' },
                        { id: 'INGRESO', label: '💰 Capital', color: 'var(--accent)' },
                        { id: 'TRASPASO', label: '🔄 Traspaso', color: '#3b82f6' },
                        { id: 'AJUSTE', label: '⚙️ Ajuste', color: '#8b5cf6' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                flex: 1, padding: '10px 5px', borderRadius: '10px', fontSize: '0.75rem',
                                border: '1px solid',
                                borderColor: activeTab === tab.id ? tab.color : 'transparent',
                                backgroundColor: activeTab === tab.id ? `${tab.color}22` : 'rgba(255,255,255,0.05)',
                                color: activeTab === tab.id ? tab.color : '#888',
                                fontWeight: 'bold'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="grid">
                    {/* Campo común: Monto y Responsable */}
                    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={labelStyle}>Monto ($):</label>
                            <input type="number" step="any" required value={formData.monto} onChange={e => setFormData({ ...formData, monto: e.target.value })} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Responsable:</label>
                            <input type="text" list="personas-list" required value={formData.persona} onChange={e => setFormData({ ...formData, persona: e.target.value.toUpperCase() })} style={{ ...inputStyle, textTransform: 'uppercase' }} />
                        </div>
                    </div>

                    {/* Lógica según TAB */}
                    {activeTab === 'GASTO' && (
                        <>
                            <div className="mt-md">
                                <label style={labelStyle}>¿Con qué se pagó?</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, origenDinero: 'NEGOCIO' })}
                                        style={{ ...toggleStyle, borderColor: formData.origenDinero === 'NEGOCIO' ? 'var(--primary)' : 'var(--card-border)', opacity: formData.origenDinero === 'NEGOCIO' ? 1 : 0.5 }}
                                    >🏛️ Plata del Local</button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, origenDinero: 'BOLSILLO' })}
                                        style={{ ...toggleStyle, borderColor: formData.origenDinero === 'BOLSILLO' ? 'var(--accent)' : 'var(--card-border)', opacity: formData.origenDinero === 'BOLSILLO' ? 1 : 0.5 }}
                                    >👤 De mi Bolsillo</button>
                                </div>
                            </div>
                            {formData.origenDinero === 'NEGOCIO' && (
                                <div className="mt-md">
                                    <label style={labelStyle}>Cuenta de Origen:</label>
                                    <select value={formData.cuenta} onChange={e => setFormData({ ...formData, cuenta: e.target.value })} style={inputStyle}>
                                        <option value="CAJA_LOCAL">Caja Local (Efectivo)</option>
                                        <option value="SOFI_MP">Cuenta Sofi (MP)</option>
                                        <option value="TOMI">Cuenta Tomi</option>
                                        <option value="LUCAS">Cuenta Lucas</option>
                                    </select>
                                </div>
                            )}
                            <div className="mt-md">
                                <label style={labelStyle}>Categoría de Gasto:</label>
                                <select value={formData.categoria} onChange={e => setFormData({ ...formData, categoria: e.target.value })} style={inputStyle}>
                                    <option value="GASTOS_GENERALES">Gastos Generales / Insumos</option>
                                    <option value="ALQUILER">Alquiler 🏠</option>
                                    <option value="SERVICIOS">Servicios (Luz/Impresiones) 💡</option>
                                    <option value="FLETES">Fletes / Viáticos 🚚</option>
                                    <option value="PAGO_CAROLINA">Pago a Carolina 👵</option>
                                    <option value="PAGO_PROVEEDOR">Pago a Proveedor 📦</option>
                                    <option value="RETIRO_PERSONAL">Retiro Personal / Sueldo 👤</option>
                                </select>
                            </div>
                        </>
                    )}

                    {activeTab === 'INGRESO' && (
                        <>
                            <div className="grid mt-md" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={labelStyle}>Cuenta Destino:</label>
                                    <select value={formData.cuenta} onChange={e => setFormData({ ...formData, cuenta: e.target.value })} style={inputStyle}>
                                        <option value="CAJA_LOCAL">Caja Local</option>
                                        <option value="SOFI_MP">Cuenta Sofi</option>
                                        <option value="TOMI">Cuenta Tomi</option>
                                        <option value="LUCAS">Cuenta Lucas</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Motivo:</label>
                                    <select value={formData.categoria} onChange={e => setFormData({ ...formData, categoria: e.target.value })} style={inputStyle}>
                                        <option value="APORTE_CAPITAL">Aporte de Capital 💰</option>
                                        <option value="VUELTO_CAMBIO">Carga de Cambio 🪙</option>
                                        <option value="OTRO_INGRESO">Otro Ingreso 📥</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'TRASPASO' && (
                        <div className="grid mt-md" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={labelStyle}>Desde:</label>
                                <select value={formData.cuenta} onChange={e => setFormData({ ...formData, cuenta: e.target.value })} style={inputStyle}>
                                    <option value="CAJA_LOCAL">Caja Local</option>
                                    <option value="SOFI_MP">Cuenta Sofi</option>
                                    <option value="TOMI">Cuenta Tomi</option>
                                    <option value="LUCAS">Cuenta Lucas</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Hacia:</label>
                                <select value={formData.haciaCuenta} onChange={e => setFormData({ ...formData, haciaCuenta: e.target.value })} style={inputStyle}>
                                    <option value="CAJA_LOCAL">Caja Local</option>
                                    <option value="SOFI_MP">Cuenta Sofi</option>
                                    <option value="TOMI">Cuenta Tomi</option>
                                    <option value="LUCAS">Cuenta Lucas</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {activeTab === 'AJUSTE' && (
                        <div className="grid mt-md" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={labelStyle}>¿Qué ajustar?</label>
                                <select value={formData.tipoAjuste} onChange={e => setFormData({ ...formData, tipoAjuste: e.target.value })} style={inputStyle}>
                                    <option value="INGRESO">Intereses / Sumar (+)</option>
                                    <option value="EGRESO">Cargo / Restar (-)</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Cuenta:</label>
                                <select value={formData.cuenta} onChange={e => setFormData({ ...formData, cuenta: e.target.value })} style={inputStyle}>
                                    <option value="SOFI_MP">Cuenta Sofi</option>
                                    <option value="TOMI">Cuenta Tomi</option>
                                    <option value="LUCAS">Cuenta Lucas</option>
                                    <option value="CAJA_LOCAL">Caja Local</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <div className="mt-md">
                        <label style={labelStyle}>Descripción:</label>
                        <input type="text" placeholder="Ej: Pago luz, Intereses MP, etc." required value={formData.motivo} onChange={e => setFormData({ ...formData, motivo: e.target.value })} style={inputStyle} />
                    </div>

                    <button type="submit" className="btn-primary btn-large mt-lg" disabled={loading}>
                        {loading ? 'Procesando...' : 'Confirmar Registro'}
                    </button>
                </form>
            </section>

            {/* Listado Reciente */}
            <div className="mt-xl">
                <h3 style={{ fontSize: '1rem', marginBottom: '15px' }}>Últimos Movimientos</h3>
                <div className="grid" style={{ gap: '10px' }}>
                    {movements.map(mov => (
                        <div key={mov.id} className="card" style={{ padding: '10px 15px', margin: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontWeight: 'bold', fontSize: '0.85rem', margin: 0 }}>{mov.motivo}</p>
                                    <p style={{ fontSize: '0.65rem', opacity: 0.5, margin: 0 }}>
                                        {mov.persona} • {new Date(mov.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • 🏦 {mov.cuenta?.replace('_', ' ')}
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontWeight: 'bold', color: mov.tipo === 'EGRESO' ? '#ef4444' : 'var(--accent)', fontSize: '0.9rem', margin: 0 }}>
                                        {mov.tipo === 'EGRESO' ? '-' : '+'} ${Math.abs(mov.monto).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <datalist id="personas-list">{suggestions.map(p => <option key={p} value={p} />)}</datalist>
            <div style={{ height: '80px' }}></div>
        </div>
    )
}

const labelStyle = { fontSize: '0.75rem', opacity: 0.5, display: 'block', marginBottom: '5px' }
const inputStyle = { width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--secondary)', color: 'white', border: '1px solid var(--card-border)', fontSize: '0.9rem' }
const toggleStyle = { flex: 1, padding: '12px', borderRadius: '12px', background: 'var(--secondary)', color: 'white', border: '2px solid transparent', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s' }
