'use client'
import { useState, useEffect } from 'react'
import { getExtendedStats, getCustomRangeStats, getFinanceSummary, getUnreconciledSales, reconcileSale } from '@/lib/actions'

export default function ReportesPage() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [viewDetail, setViewDetail] = useState(null) // { period: 'today'|'week'|'month'|'custom', owner: 'propia'|'carolina' }

    // Custom range state
    const [customRange, setCustomRange] = useState({ start: '', end: '' })
    const [customStats, setCustomStats] = useState(null)
    const [customLoading, setCustomLoading] = useState(false)
    const [activeTab, setActiveTab] = useState('ventas') // 'ventas' or 'cuentas'
    const [finance, setFinance] = useState(null)
    const [pendingSales, setPendingSales] = useState([])
    const [reconcilingId, setReconcilingId] = useState(null)

    useEffect(() => {
        async function load() {
            const [vStats, fSummary, pSales] = await Promise.all([
                getExtendedStats(),
                getFinanceSummary(),
                getUnreconciledSales()
            ])
            setStats(vStats)
            setFinance(fSummary)
            setPendingSales(pSales)
            setLoading(false)
        }
        load()
    }, [])

    const handleCustomSearch = async (e) => {
        e.preventDefault()
        if (!customRange.start || !customRange.end) return
        setCustomLoading(true)
        const data = await getCustomRangeStats(customRange.start, customRange.end)
        setCustomStats(data)
        setCustomLoading(false)
    }

    if (loading) return <div className="text-center mt-lg">Cargando reportes...</div>

    const DetailView = ({ period }) => {
        const periodLabel = period === 'today' ? 'Hoy' : period === 'week' ? 'Semana' : period === 'month' ? 'Mes' : 'Personalizado';

        if (!stats) return <p>Cargando datos...</p>;
        if (stats.error) return <p style={{ color: 'var(--error)' }}>Error al cargar datos. Verifique los permisos de vendedor.</p>;

        const periodData = period === 'custom' ? customStats : stats[period];
        if (!periodData) return <p>No hay datos disponibles.</p>;

        const items = periodData.items || [];

        return (
            <div className="grid mt-md">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Detalle de Ventas - {periodLabel}</h3>
                    <button onClick={() => setViewDetail(null)} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Cerrar</button>
                </div>

                <div className="grid mt-md" style={{ gap: '10px' }}>
                    {items.length === 0 ? (
                        <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No hay ventas en este periodo.</p>
                    ) : (
                        items.map((item, i) => (
                            <div key={i} className="card" style={{ padding: '12px', fontSize: '0.85rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{item.codigo}</span>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ color: 'var(--accent)', fontWeight: 'bold', margin: '0' }}>$ {item.neto.toLocaleString()} (Neto)</p>
                                        <p style={{ fontSize: '0.7rem', opacity: 0.5, margin: '0' }}>Lista: $ {item.precio.toLocaleString()}</p>
                                    </div>
                                </div>
                                <p style={{ opacity: 0.9 }}>{item.modelo} - {item.color}</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', opacity: 0.6, fontSize: '0.75rem' }}>
                                    <span>Talle: {item.talle} • {item.vendedor ? `Vendedor: ${item.vendedor}` : 'Sin registro'}</span>
                                    <span>{new Date(item.fecha).toLocaleDateString()} {new Date(item.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {item.medio_pago}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )
    }

    if (viewDetail) {
        return (
            <div className="grid mt-lg">
                <header>
                    <button onClick={() => setViewDetail(null)} style={{ border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', marginBottom: '20px' }}>
                        ← Volver a Resumen
                    </button>
                    <h1>Detalle de Ventas</h1>
                </header>
                <DetailView period={viewDetail.period} />
                <div style={{ height: '80px' }}></div>
            </div>
        )
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Reportes Financieros</h1>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
                    <button
                        className={activeTab === 'ventas' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => setActiveTab('ventas')}
                        style={{ padding: '8px 20px' }}
                    >
                        Ventas
                    </button>
                    <button
                        className={activeTab === 'cuentas' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => setActiveTab('cuentas')}
                        style={{ padding: '8px 20px' }}
                    >
                        Estado de Cuentas
                    </button>
                </div>
            </header>

            {activeTab === 'cuentas' && finance && (
                <section className="grid mt-lg">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                        {/* Cuentas de Dueños */}
                        <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
                            <h4 style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '15px' }}>DISPONIBLE POR CUENTA</h4>
                            <div className="grid" style={{ gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ opacity: 0.8 }}>💵 Caja Local (Efectivo)</span>
                                    <span style={{ fontWeight: 'bold' }}>$ {finance.CAJA_LOCAL.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ opacity: 0.8 }}>📱 Cuenta Lucas</span>
                                    <span style={{ fontWeight: 'bold' }}>$ {finance.LUCAS.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ opacity: 0.8 }}>📱 Cuenta Tomi / TN</span>
                                    <span style={{ fontWeight: 'bold' }}>$ {finance.TOMI.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                                    <span style={{ opacity: 0.8 }}>💳 Sofi (Dispon. MP)</span>
                                    <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>$ {finance.SOFI_MP.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>⏳ Sofi (A liberar)</span>
                                    <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>$ {finance.SOFI_PENDING.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Deudas y Compromisos */}
                        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
                            <h4 style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '15px' }}>ESTADO DE DEUDAS</h4>
                            <div className="grid" style={{ gap: '12px' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                        <span style={{ opacity: 0.8 }}>👵 Deuda Carolina</span>
                                        <span style={{ fontWeight: 'bold', color: '#ef4444' }}>$ {finance.CAROLINA.toLocaleString()}</span>
                                    </div>
                                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.min(100, Math.max(0, (1 - (Math.abs(finance.CAROLINA) / 13000000)) * 100))}%`, height: '100%', background: 'var(--accent)' }}></div>
                                    </div>
                                    <p style={{ fontSize: '0.65rem', opacity: 0.4, marginTop: '4px' }}>Restan pagar $ {Math.abs(finance.CAROLINA).toLocaleString()} de los $ 13M</p>
                                </div>

                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ opacity: 0.8 }}>🏢 Deuda Proveedores</span>
                                        <span style={{ fontWeight: 'bold', color: finance.PROVEEDOR >= 0 ? 'var(--accent)' : '#ef4444' }}>$ {finance.PROVEEDOR.toLocaleString()}</span>
                                    </div>
                                    <p style={{ fontSize: '0.65rem', opacity: 0.4, marginTop: '2px' }}>
                                        {finance.PROVEEDOR < 0 ? 'Saldo pendiente de pago' : 'Saldo a favor'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Resumen de Utilidad */}
                    <div className="card mt-lg" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.02) 100%)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>Utilidad Neta Estimada</h3>
                                <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>Ventas - Costos - Gastos (Todo el tiempo)</p>
                            </div>
                            <h2 style={{ color: 'var(--accent)', margin: 0 }}>
                                $ {(finance.CAJA_LOCAL + finance.SOFI_MP + finance.SOFI_PENDING + finance.TOMI + finance.LUCAS).toLocaleString()}
                            </h2>
                        </div>
                    </div>

                    {/* Ventas por Conciliar */}
                    <div className="mt-xl">
                        <h3 style={{ fontSize: '1rem', marginBottom: '15px', color: 'var(--accent)' }}>📋 Ventas por Conciliar (Sofi)</h3>
                        {pendingSales.length === 0 ? (
                            <div className="card text-center" style={{ opacity: 0.5 }}>No hay ventas pendientes de conciliación.</div>
                        ) : (
                            <div className="grid" style={{ gap: '10px' }}>
                                {pendingSales.map(sale => (
                                    <ReconcileRow
                                        key={sale.id}
                                        sale={sale}
                                        onDone={async () => {
                                            const [f, p] = await Promise.all([getFinanceSummary(), getUnreconciledSales()])
                                            setFinance(f)
                                            setPendingSales(p)
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {activeTab === 'ventas' && (
                <>

                    {/* Selector de Fecha Personalizado */}
                    <section className="card mt-md">
                        <h4 style={{ marginBottom: '15px' }}>🔍 Filtro Personalizado</h4>
                        <form onSubmit={handleCustomSearch} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block' }}>Desde:</label>
                                    <input
                                        type="date"
                                        className="input-field"
                                        style={{ margin: 0, padding: '8px' }}
                                        value={customRange.start}
                                        onChange={e => setCustomRange({ ...customRange, start: e.target.value })}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block' }}>Hasta:</label>
                                    <input
                                        type="date"
                                        className="input-field"
                                        style={{ margin: 0, padding: '8px' }}
                                        value={customRange.end}
                                        onChange={e => setCustomRange({ ...customRange, end: e.target.value })}
                                    />
                                </div>
                            </div>
                            <button type="submit" className="btn-primary" style={{ padding: '10px' }} disabled={customLoading}>
                                {customLoading ? 'Calculando...' : 'Consultar Rango'}
                            </button>
                        </form>

                        {customStats && (
                            <div className="mt-lg" style={{ borderTop: '1px solid var(--card-border)', paddingTop: '15px' }}>
                                <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>Resultado del Rango:</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h2 style={{ color: 'var(--accent)', margin: '5px 0' }}>Neto: $ {customStats.neto.toLocaleString()}</h2>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>Lista: $ {customStats.total.toLocaleString()} ({customStats.count} pares)</p>
                                    </div>
                                    <button className="btn-secondary" style={{ padding: '8px 15px' }} onClick={() => setViewDetail({ period: 'custom' })}>
                                        Ver Listado 📋
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="grid mt-lg">
                        {/* Hoy */}
                        <div className="card" style={{ borderLeft: '4px solid var(--accent)', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'today' })}>
                            <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Ingreso Real de Hoy (Neto)</p>
                            <h2 style={{ color: 'var(--accent)', margin: '5px 0' }}>$ {stats?.today.neto.toLocaleString()}</h2>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Lista: $ {stats?.today.total.toLocaleString()}</p>
                                <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>Ver detalle →</span>
                            </div>
                        </div>

                        {/* Semana */}
                        <div className="card" style={{ borderLeft: '4px solid var(--primary)', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'week' })}>
                            <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Ingreso Real 7 días</p>
                            <h2 style={{ color: 'var(--primary)', margin: '5px 0' }}>$ {stats?.week.neto.toLocaleString()}</h2>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Lista: $ {stats?.week.total.toLocaleString()}</p>
                                <span style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>Ver detalle →</span>
                            </div>
                        </div>

                        {/* Mes */}
                        <div className="card" style={{ borderLeft: '4px solid #8b5cf6', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'month' })}>
                            <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Ingreso Real 30 días</p>
                            <h2 style={{ color: '#8b5cf6', margin: '5px 0' }}>$ {stats?.month.neto.toLocaleString()}</h2>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Lista: $ {stats?.month.total.toLocaleString()}</p>
                                <span style={{ fontSize: '0.7rem', color: '#8b5cf6' }}>Ver detalle →</span>
                            </div>
                        </div>
                    </section>

                    <div className="card mt-lg" style={{ backgroundColor: 'var(--secondary)' }}>
                        <h4>Análisis Rápido</h4>
                        <p style={{ fontSize: '0.9rem', marginTop: '10px', lineHeight: '1.4' }}>
                            Tu promedio de venta por par en los últimos 30 días es de
                            <strong> $ {stats?.month.count > 0 ? (stats.month.total / stats.month.count).toFixed(2) : 0}</strong>.
                        </p>
                    </div>

                </>
            )}

            <div style={{ height: '80px' }}></div>
        </div>
    )
}

function ReconcileRow({ sale, onDone }) {
    const [neto, setNeto] = useState('')
    const [dias, setDias] = useState(18)
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    const handleSave = async () => {
        if (!neto) {
            alert('Por favor, ingresa el monto neto que vas a recibir.')
            return
        }
        setLoading(true)
        try {
            const res = await reconcileSale(sale.id, { monto_neto: neto, dias_acreditacion: dias })
            if (res) {
                setSuccess(true)
                setTimeout(() => {
                    onDone()
                }, 1000)
            }
        } catch (err) {
            console.error(err)
            alert('Error al conciliar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="card text-center" style={{ padding: '20px', borderColor: 'var(--accent)', background: 'rgba(59, 130, 246, 0.05)' }}>
                <p style={{ color: 'var(--accent)', fontWeight: 'bold', margin: 0 }}>¡Venta conciliada con éxito! 🎉</p>
                <p style={{ fontSize: '0.7rem', opacity: 0.6 }}>Actualizando saldos...</p>
            </div>
        )
    }

    return (
        <div className="card" style={{ padding: '12px 15px', borderLeft: '4px solid rgba(59, 130, 246, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                    <p style={{ fontSize: '0.8rem', opacity: 0.6, margin: 0 }}>
                        {new Date(sale.created_at).toLocaleString()}
                    </p>
                    <p style={{ fontWeight: 'bold', fontSize: '1.2rem', margin: '4px 0' }}>$ {sale.total.toLocaleString()}</p>
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <span className="badge" style={{ fontSize: '0.6rem', padding: '2px 6px' }}>{sale.medio_pago}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{sale.profiles?.nombre}</span>
                    </div>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'flex-end', flex: 2 }}>
                    <div>
                        <label style={{ fontSize: '0.65rem', opacity: 0.6, fontWeight: 'bold' }}>Monto Neto ($):</label>
                        <input
                            type="number"
                            className="input-field"
                            style={{ margin: 0, padding: '10px', fontSize: '1rem', fontWeight: 'bold', border: '1px solid var(--accent)' }}
                            placeholder="Ej: 9500"
                            value={neto}
                            onChange={e => setNeto(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.65rem', opacity: 0.6, fontWeight: 'bold' }}>Días para cobrar:</label>
                        <input
                            type="number"
                            className="input-field"
                            style={{ margin: 0, padding: '10px' }}
                            value={dias}
                            onChange={e => setDias(e.target.value)}
                        />
                        <p style={{ fontSize: '0.6rem', color: 'var(--accent)', marginTop: '4px' }}>
                            Acredita el: {(() => {
                                const d = new Date()
                                d.setDate(d.getDate() + Number(dias))
                                return d.toLocaleDateString()
                            })()}
                        </p>
                    </div>
                    <button
                        className="btn-primary"
                        style={{ padding: '10px 20px', minWidth: 'auto', alignSelf: 'stretch' }}
                        disabled={loading}
                        onClick={handleSave}
                    >
                        {loading ? '...' : 'Conciliar ✅'}
                    </button>
                </div>
            </div>
        </div>
    )
}
