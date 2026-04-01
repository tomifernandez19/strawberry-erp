'use client'
import { useState, useEffect } from 'react'
import { getExtendedStats, getCustomRangeStats, getFinanceSummary, getCapitalContributionsReport, recordMonthClosing } from '@/lib/actions'
import Loader from '@/components/Loader'

export default function ReportesPage() {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState(null)
    const [stats, setStats] = useState(null)
    const [contributions, setContributions] = useState({ byPerson: {}, history: [] })

    // Tab and Detail States
    const [activeTab, setActiveTab] = useState('sueldos') // 'sueldos', 'ventas', 'aportes'
    const [viewDetail, setViewDetail] = useState(null) // { period: 'today'|'week'|'month'|'custom' }

    // Custom range state
    const [customRange, setCustomRange] = useState({ start: '', end: '' })
    const [customStats, setCustomStats] = useState(null)
    const [customLoading, setCustomLoading] = useState(false)

    // Modal Closing Month
    const [showCloseModal, setShowCloseModal] = useState(false)
    const [selectedDate, setSelectedDate] = useState(new Date()) // NEW
    const [closingData, setClosingData] = useState([
        { name: 'SOFI', amount: 0, cuenta: 'SOFI_MP' },
        { name: 'TOMI', amount: 0, cuenta: 'TOMI' },
        { name: 'LUCAS', amount: 0, cuenta: 'LUCAS' }
    ])

    useEffect(() => {
        loadData(selectedDate)
    }, [selectedDate])

    async function loadData(dateObj = new Date()) {
        setLoading(true)
        try {
            const [fSummary, vStats, cReport] = await Promise.all([
                getFinanceSummary(dateObj.toISOString()),
                getExtendedStats(),
                getCapitalContributionsReport()
            ])

            setData(fSummary)
            setStats(vStats)
            setContributions(cReport)

            // Set default estimated salary for closing month
            const dt = fSummary.dividendTotals;
            const estimated = Math.floor((dt.sales - dt.supplierReserve - dt.expenses - dt.pendingProvisions + dt.contributions) / 3);
            setClosingData(prev => prev.map(p => ({ ...p, amount: estimated > 0 ? estimated : 0 })));

        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handleCustomSearch = async (e) => {
        e.preventDefault()
        if (!customRange.start || !customRange.end) return
        setCustomLoading(true)
        try {
            const res = await getCustomRangeStats(customRange.start, customRange.end)
            setCustomStats(res)
        } catch (err) {
            console.error(err)
        } finally {
            setCustomLoading(false)
        }
    }

    const handleCloseMonth = async () => {
        if (!confirm('¿Estás seguro de registrar los retiros de este mes? Esto quedará guardado como gastos de "Retiro Personal".')) return;

        setLoading(true)
        try {
            const res = await recordMonthClosing(closingData);
            if (res.success) {
                alert('¡Mes cerrado y retiros registrados!');
                setShowCloseModal(false);
                loadData();
            } else {
                alert('Error: ' + res.message);
            }
        } catch (e) {
            alert('Error crítico');
        } finally {
            setLoading(false)
        }
    }

    if (loading && !data) return <Loader />

    const { accounts = {}, billingByPerson = {}, dividendTotals = {} } = data || {};

    const selectedMonthName = selectedDate.toLocaleString('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).toUpperCase();
    const nextMonthObj = new Date(selectedDate);
    nextMonthObj.setMonth(nextMonthObj.getMonth() + 1);
    const nextMonthName = nextMonthObj.toLocaleString('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).toUpperCase();

    // View de Detalle de Ventas
    if (viewDetail) {
        const periodLabel = viewDetail.period === 'today' ? 'Hoy' : viewDetail.period === 'week' ? 'Semana' : viewDetail.period === 'month' ? 'Mes' : 'Personalizado';
        const periodData = viewDetail.period === 'custom' ? customStats : (stats?.[viewDetail.period] || {});
        const items = periodData?.items || [];

        return (
            <div className="grid mt-lg">
                <header>
                    <button onClick={() => setViewDetail(null)} className="btn-secondary" style={{ border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', marginBottom: '20px', padding: 0 }}>
                        ← Volver a Reportes
                    </button>
                    <h1>Ventas Detalladas - {periodLabel}</h1>
                </header>

                <div className="grid mt-md" style={{ gap: '10px' }}>
                    {items.length === 0 ? (
                        <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No hay ventas en este periodo.</p>
                    ) : (
                        items.map((item, i) => (
                            <div key={i} className="card" style={{ padding: '12px', fontSize: '0.85rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{item.codigo}</span>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ color: 'var(--accent)', fontWeight: 'bold', margin: '0' }}>$ {(Number(item.neto) || 0).toLocaleString()} (Neto)</p>
                                        <p style={{ fontSize: '0.7rem', opacity: 0.5, margin: '0' }}>Lista: $ {(Number(item.precio) || 0).toLocaleString()}</p>
                                    </div>
                                </div>
                                <p style={{ opacity: 0.9 }}>{item.modelo} - {item.color}</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', opacity: 0.6, fontSize: '0.75rem' }}>
                                    <span>Talle: {item.talle} • {item.vendedor || 'S/R'}</span>
                                    <span>{new Date(item.fecha).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} • {item.medio_pago}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Reportes Financieros</h1>
                <p style={{ opacity: 0.7 }}>Resumen de caja y análisis de utilidades</p>
                
                {/* Selector de Mes */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '15px' }}>
                    <button 
                        onClick={() => {
                            const prev = new Date(selectedDate);
                            prev.setMonth(prev.getMonth() - 1);
                            setSelectedDate(prev);
                        }}
                        className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.7rem' }}
                    >
                        ◀ mes anterior
                    </button>
                    <span style={{ fontWeight: 'bold', minWidth: '120px', borderBottom: '2px solid var(--accent)', paddingBottom: '2px' }}>
                         {selectedMonthName}
                    </span>
                    <button 
                        onClick={() => {
                            const nxt = new Date(selectedDate);
                            nxt.setMonth(nxt.getMonth() + 1);
                            setSelectedDate(nxt);
                        }}
                        className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.7rem' }}
                        disabled={new Date(selectedDate).getMonth() === new Date().getMonth() && new Date(selectedDate).getFullYear() === new Date().getFullYear()}
                    >
                        mes siguiente ▶
                    </button>
                </div>
            </header>

            {/* Selector de Solapas (Tabs) */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '10px' }}>
                <button
                    onClick={() => setActiveTab('sueldos')}
                    style={{ flex: 1, minWidth: '140px', padding: '12px', borderRadius: '12px', border: activeTab === 'sueldos' ? '2px solid var(--accent)' : '1px solid #444', backgroundColor: activeTab === 'sueldos' ? 'rgba(255,191,0,0.1)' : 'transparent', color: activeTab === 'sueldos' ? 'var(--accent)' : '#888', fontWeight: 'bold' }}
                >
                    🧬 Sueldos / CMV
                </button>
                <button
                    onClick={() => setActiveTab('ventas')}
                    style={{ flex: 1, minWidth: '140px', padding: '12px', borderRadius: '12px', border: activeTab === 'ventas' ? '2px solid var(--primary)' : '1px solid #444', backgroundColor: activeTab === 'ventas' ? 'rgba(59,130,246,0.1)' : 'transparent', color: activeTab === 'ventas' ? 'var(--primary)' : '#888', fontWeight: 'bold' }}
                >
                    📈 Ventas Períodos
                </button>
                <button
                    onClick={() => setActiveTab('aportes')}
                    style={{ flex: 1, minWidth: '140px', padding: '12px', borderRadius: '12px', border: activeTab === 'aportes' ? '2px solid #8b5cf6' : '1px solid #444', backgroundColor: activeTab === 'aportes' ? 'rgba(139,92,246,0.1)' : 'transparent', color: activeTab === 'aportes' ? '#8b5cf6' : '#888', fontWeight: 'bold' }}
                >
                    💰 Cuentas / Aportes
                </button>
            </div>

            {/* CONTENIDO SOLAPA: SUELDOS */}
            {activeTab === 'sueldos' && (
                <section className="animate-in">
                    {/* Ficha de Saldos Globales */}
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                        <div className="card" style={{ border: '1px solid var(--primary)' }}>
                            <p style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 'bold' }}>💰 SALDOS DISPONIBLES:</p>
                            <div className="grid mt-md" style={{ gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Caja Local (Efectivo)</span>
                                    <span style={{ fontWeight: 'bold' }}>$ {(Number(accounts.CAJA_LOCAL) || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Lucas (Transferencia)</span>
                                    <span style={{ fontWeight: 'bold' }}>$ {(Number(accounts.LUCAS) || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Tomi (Transferencia)</span>
                                    <span style={{ fontWeight: 'bold' }}>$ {(Number(accounts.TOMI) || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Sofi (Mercado Pago)</span>
                                    <span style={{ fontWeight: 'bold' }}>$ {(Number(accounts.SOFI_MP) || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '5px', display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}>
                                    <span style={{ fontSize: '0.8rem' }}>Sofi • {selectedMonthName} (Por Cobrar)</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>$ {(Number(accounts.SOFI_PENDING) || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.5 }}>
                                    <span style={{ fontSize: '0.8rem' }}>Sofi • {nextMonthName}+ (Pendiente)</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>$ {(accounts.SOFI_NEXT_MONTH || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', marginTop: '5px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 'bold' }}>TOTAL LIQUIDEZ {selectedMonthName}</span>
                                    <span style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '1.2rem' }}>
                                        $ {(Number(accounts.CAJA_LOCAL || 0) + Number(accounts.SOFI_MP || 0) + Number(accounts.TOMI || 0) + Number(accounts.LUCAS || 0) + Number(accounts.SOFI_PENDING || 0)).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ border: '1px solid #ef4444' }}>
                            <p style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 'bold' }}>🚩 PASIVO (DEUDAS):</p>
                            <div className="grid mt-md" style={{ gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Resto Carolina</span>
                                    <span style={{ fontWeight: 'bold', color: '#ef4444' }}>$ {(Math.abs(Number(accounts.CAROLINA) || 0)).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Proveedores Pendientes</span>
                                    <span style={{ fontWeight: 'bold', color: '#ef4444' }}>$ {(Math.abs(Number(accounts.PROVEEDOR) || 0)).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card mt-xl" style={{ border: '2px solid #444' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>🧬 Análisis del Mes / ROI</h3>
                                <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '4px' }}>Basado en fechas de acreditación y costos de reposición</p>
                            </div>
                            <button onClick={() => setShowCloseModal(true)} className="btn-primary" style={{ padding: '8px 15px', fontSize: '0.8rem', background: '#3b82f6', borderColor: '#3b82f6' }}>
                                📁 Cerrar Mes / Sueldos
                            </button>
                        </div>

                        <div className="grid" style={{ gap: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span style={{ opacity: 0.8 }} title="Efectivo/Transferencias del mes y tarjetas acreditadas este mes">(+) Ventas Realizadas (Ticket Neto)</span>
                                <span style={{ color: 'var(--accent)' }}>$ {(Number(dividendTotals.sales) || 0).toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span style={{ opacity: 0.8 }} title="Costo de stock vendido + Pagos ya realizados a proveedores">🏦 (-) Reposición Stock (CMV Real + Pagos)</span>
                                <span style={{ color: '#fbbf24' }}>- $ {(Number(dividendTotals.supplierReserve) || 0).toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span style={{ opacity: 0.8 }} title="Gastos fijos presupuestados y egresos varios (no proveedores)">(-) Gastos Op. (Egresos/Fijos)</span>
                                <span style={{ color: '#ef4444' }}>- $ {(Number(dividendTotals.expenses || 0) + Number(dividendTotals.pendingProvisions || 0)).toLocaleString()}</span>
                            </div>
                            {(Number(dividendTotals.contributions) || 0) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ opacity: 0.8 }} title="Ingresos externos como aportes de capital o vueltos">(+) Aportes de Capital / Vueltos</span>
                                    <span style={{ color: 'var(--accent)' }}>+ $ {(Number(dividendTotals.contributions) || 0).toLocaleString()}</span>
                                </div>
                            )}

                            <div style={{ borderTop: '2px solid rgba(255,255,255,0.1)', paddingTop: '15px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4 style={{ margin: 0 }}>GANANCIA LIBRE</h4>
                                    <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Utilidad tras asegurar stock y gastos</p>
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--accent)' }}>
                                    $ {(Number(dividendTotals.sales || 0) - Number(dividendTotals.supplierReserve || 0) - Number(dividendTotals.expenses || 0) - Number(dividendTotals.pendingProvisions || 0) + Number(dividendTotals.contributions || 0)).toLocaleString()}
                                </h3>
                            </div>

                            <div style={{ background: 'rgba(255,191,0,0.05)', border: '1px dashed rgba(255,191,0,0.2)', padding: '20px', borderRadius: '12px', marginTop: '20px', textAlign: 'center' }}>
                                <p style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '5px', letterSpacing: '1px' }}>SUELDO POR SOCIO (GANANCIA TEÓRICA)</p>
                                <h2 style={{ margin: 0, color: '#ffbf00' }}>
                                    $ {(Math.floor((Number(dividendTotals.sales || 0) - Number(dividendTotals.supplierReserve || 0) - Number(dividendTotals.expenses || 0) - Number(dividendTotals.pendingProvisions || 0) + Number(dividendTotals.contributions || 0)) / 3)).toLocaleString()}
                                </h2>
                                <p style={{ fontSize: '0.65rem', opacity: 0.4, marginTop: '8px' }}>* Basado en márgenes sobre lo vendido. No considera cuánto efectivo hay en el banco.</p>
                            </div>

                            {/* NUEVA SECCIÓN DE LIQUIDEZ CONSERVADORA */}
                            <div className="mt-xl" style={{ borderTop: '2px dashed #333', paddingTop: '30px' }}>
                                <h4 style={{ margin: 0, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '0.8rem', color: '#3b82f6' }}>🛡️ Análisis de Liquidez (Efectivo Real)</h4>
                                <p style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: '5px' }}>¿Cuánta plata real queda si pagamos todo lo pendiente hoy?</p>
                                
                                <div className="mt-md" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.9rem' }}>
                                        <span>Total en Cuentas + Tarjetas x Cobrar</span>
                                        <span style={{ fontWeight: 'bold' }}>$ {(Number(accounts.CAJA_LOCAL || 0) + Number(accounts.SOFI_MP || 0) + Number(accounts.TOMI || 0) + Number(accounts.LUCAS || 0) + Number(accounts.SOFI_PENDING || 0)).toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.9rem', color: '#ef4444' }}>
                                        <span>Deuda Total Proveedores + Carolina</span>
                                        <span style={{ fontWeight: 'bold' }}>- $ {(Math.abs(Number(accounts.PROVEEDOR)) + Math.abs(Number(accounts.CAROLINA))).toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '0.9rem', color: '#ef4444' }}>
                                        <span>Gastos Fijos Pendientes (Alquiler, etc.)</span>
                                        <span style={{ fontWeight: 'bold' }}>- $ {(Number(dividendTotals.pendingProvisions) || 0).toLocaleString()}</span>
                                    </div>
                                    
                                    <div style={{ borderTop: '1px solid rgba(59, 130, 246, 0.2)', paddingTop: '15px', textAlign: 'center' }}>
                                        <p style={{ fontSize: '0.7rem', opacity: 0.8, marginBottom: '5px', textTransform: 'uppercase', color: '#3b82f6' }}>Sueldo Líquido Máximo Sugerido</p>
                                        <h2 style={{ margin: 0, color: '#3b82f6' }}>
                                            $ {Math.max(0, Math.floor(((Number(accounts.CAJA_LOCAL || 0) + Number(accounts.SOFI_MP || 0) + Number(accounts.TOMI || 0) + Number(accounts.LUCAS || 0) + Number(accounts.SOFI_PENDING || 0)) - (Math.abs(Number(accounts.PROVEEDOR)) + Math.abs(Number(accounts.CAROLINA))) - (Number(dividendTotals.pendingProvisions) || 0)) / 3)).toLocaleString()}
                                        </h2>
                                        <p style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: '10px', lineHeight: '1.4' }}>
                                            💡 <b>Consejo:</b> Este cálculo ya descuenta todas las deudas acumuladas del negocio. Si retiran más de este monto, estarán usando plata que el local le debe a alguien más.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Detalle de Gastos Fijos Pendientes */}
                            {dividendTotals.provisionsDetails?.filter(p => p.pendiente > 0).length > 0 && (
                                <div style={{ marginTop: '20px', background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '15px', borderRadius: '12px' }}>
                                    <p style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#ef4444', marginBottom: '10px', textTransform: 'uppercase' }}>📉 Gastos Fijos Pendientes de Pagar:</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {dividendTotals.provisionsDetails.filter(p => p.pendiente > 0).map(p => (
                                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.9 }}>
                                                <span>{p.nombre}</span>
                                                <span style={{ fontWeight: 'bold' }}>$ {p.pendiente.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ marginTop: '20px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', fontSize: '0.75rem', color: '#888', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <p style={{ fontWeight: 'bold', color: '#aaa', marginBottom: '8px' }}>📌 ¿Cómo se calculan estos números?</p>
                                <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <li><strong>Ventas (Neto):</strong> Incluye efectivo y transferencias realizadas este mes, más ventas con tarjeta ya acreditadas. Excluye transferencias directas a proveedores.</li>
                                    <li><strong>CMV Real + Pagos:</strong> Suma del costo de reposición del stock vendido más todos los pagos ya realizados a proveedores (incluyendo transferencias directas).</li>
                                    <li><strong>Gastos Op.:</strong> Gastos fijos (local, luz, sueldos empleados) y otros egresos varios que no son de mercadería.</li>
                                    <li><strong>Ganancia Libre:</strong> El dinero real disponible tras asegurar la reposición de mercadería y cubrir los gastos operativos.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>
                )}

                {/* CONTENIDO SOLAPA: VENTAS */}
                {activeTab === 'ventas' && stats && (
                    <section className="animate-in">
                        {/* Filtro Personalizado */}
                        <div className="card">
                            <h4 style={{ marginBottom: '15px' }}>🔍 Rango Personalizado</h4>
                            <form onSubmit={handleCustomSearch} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input type="date" className="input-field" style={{ margin: 0 }} value={customRange.start} onChange={e => setCustomRange({ ...customRange, start: e.target.value })} />
                                    <input type="date" className="input-field" style={{ margin: 0 }} value={customRange.end} onChange={e => setCustomRange({ ...customRange, end: e.target.value })} />
                                </div>
                                <button type="submit" className="btn-primary" disabled={customLoading}>
                                    {customLoading ? 'Calculando...' : 'Ver Período Custom'}
                                </button>
                            </form>
                            {customStats && (
                                <div className="mt-md pt-md" style={{ borderTop: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--accent)' }}>$ {customStats.neto.toLocaleString()} (Neto)</p>
                                        <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>{customStats.count} pares vendidos</p>
                                    </div>
                                    <button className="btn-secondary" onClick={() => setViewDetail({ period: 'custom' })} style={{ fontSize: '0.75rem' }}>Ver Detalle 📋</button>
                                </div>
                            )}
                        </div>

                        <div className="grid mt-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                            <div className="card text-center" style={{ borderLeft: '4px solid var(--accent)', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'today' })}>
                                <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Hoy</p>
                                <h2 style={{ color: 'var(--accent)' }}>$ {stats.today.neto.toLocaleString()}</h2>
                            </div>
                            <div className="card text-center" style={{ borderLeft: '4px solid var(--primary)', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'week' })}>
                                <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Últimos 7 días</p>
                                <h2 style={{ color: 'var(--primary)' }}>$ {stats.week.neto.toLocaleString()}</h2>
                            </div>
                            <div className="card text-center" style={{ borderLeft: '4px solid #8b5cf6', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'month' })}>
                                <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Últimos 30 días</p>
                                <h2 style={{ color: '#8b5cf6' }}>$ {stats.month.neto.toLocaleString()}</h2>
                            </div>
                        </div>
                    </section>
                )}

                {/* CONTENIDO SOLAPA: APORTES */}
                {activeTab === 'aportes' && (
                    <section className="animate-in">
                        <div className="card">
                            <h3>Aportes y Facturación Arka</h3>
                            <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '20px' }}>Historial de facturación por dueño (Matching Planilla)</p>
                            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                                {Object.entries(billingByPerson).map(([owner, amount]) => (
                                    <div key={owner} className="card text-center" style={{ padding: '10px', background: 'rgba(255,255,255,0.02)' }}>
                                        <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>{owner}</p>
                                        <h4 style={{ margin: 0 }}>$ {amount.toLocaleString()}</h4>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card mt-lg">
                            <h3>Historial de Capital Registrado</h3>
                            <div className="grid mt-md" style={{ gap: '10px' }}>
                                {contributions.history.map((m, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                        <div>
                                            <p style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{m.motivo}</p>
                                            <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>{new Date(m.created_at).toLocaleDateString()} • {m.persona}</p>
                                        </div>
                                        <p style={{ color: 'var(--accent)', fontWeight: 'bold' }}>+ $ {m.monto.toLocaleString()}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {/* MODAL CIERRE */}
                {showCloseModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                        <div className="card" style={{ maxWidth: '450px', width: '100%', animation: 'slideUp 0.3s ease-out' }}>
                            <h2>Cierre y Distribución</h2>
                            <div className="grid mt-md" style={{ gap: '15px' }}>
                                {closingData.map((p, idx) => (
                                    <div key={p.name} className="grid" style={{ gridTemplateColumns: '1fr 2fr', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold' }}>{p.name}:</span>
                                        <input type="number" value={p.amount} onChange={(e) => {
                                            const newData = [...closingData];
                                            newData[idx].amount = parseFloat(e.target.value) || 0;
                                            setClosingData(newData);
                                        }} className="input-field" style={{ margin: 0 }} />
                                    </div>
                                ))}
                            </div>
                            <div className="grid mt-md" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <button onClick={() => setShowCloseModal(false)} className="btn-secondary">Cancelar</button>
                                <button onClick={handleCloseMonth} className="btn-primary" style={{ background: '#3b82f6', borderColor: '#3b82f6' }}>Confirmar ✅</button>
                            </div>
                        </div>
                    </div>
                )}

                <style jsx>{`
                    .animate-in {
                        animation: fadeIn 0.4s ease-out;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </div>
        )
}
