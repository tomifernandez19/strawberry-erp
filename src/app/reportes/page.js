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

    const [isAnnual, setIsAnnual] = useState(false)

    useEffect(() => {
        loadData(selectedDate, isAnnual)
    }, [selectedDate, isAnnual])

    async function loadData(dateObj = new Date(), annual = isAnnual) {
        setLoading(true)
        try {
            const [fSummary, vStats, cReport] = await Promise.all([
                getFinanceSummary(dateObj.toISOString(), annual),
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
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '5px', display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}>
                                    <span style={{ fontSize: '0.8rem' }}>Tienda Nube • {selectedMonthName} (Por Cobrar)</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>$ {(Number(accounts.ONLINE_PENDING) || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.5 }}>
                                    <span style={{ fontSize: '0.8rem' }}>Tienda Nube • {nextMonthName}+ (Pendiente)</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>$ {(Number(accounts.ONLINE_NEXT_MONTH) || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', marginTop: '5px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 'bold' }}>TOTAL LIQUIDEZ {selectedMonthName}</span>
                                    <span style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '1.2rem' }}>
                                        $ {(Number(accounts.CAJA_LOCAL || 0) + Number(accounts.SOFI_MP || 0) + Number(accounts.TOMI || 0) + Number(accounts.LUCAS || 0) + Number(accounts.SOFI_PENDING || 0) + Number(accounts.ONLINE_PENDING || 0)).toLocaleString()}
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
                                <h3 style={{ margin: 0, letterSpacing: '1px', textTransform: 'uppercase', color: '#10b981' }}>💵 Análisis de Caja (Disponibilidad Real {isAnnual ? 'Anual' : ''})</h3>
                                <p style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: '5px' }}>
                                    ¿Cuánta plata podemos retirar {isAnnual ? 'en el año' : 'hoy'} sin descapitalizar el negocio?
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '4px' }}>
                                    <button 
                                        onClick={() => setIsAnnual(false)}
                                        style={{ padding: '6px 12px', borderRadius: '10px', border: 'none', background: !isAnnual ? 'var(--accent)' : 'transparent', color: !isAnnual ? '#000' : '#888', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                        MES
                                    </button>
                                    <button 
                                        onClick={() => setIsAnnual(true)}
                                        style={{ padding: '6px 12px', borderRadius: '10px', border: 'none', background: isAnnual ? 'var(--accent)' : 'transparent', color: isAnnual ? '#000' : '#888', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                        AÑO
                                    </button>
                                </div>
                                <button onClick={() => setShowCloseModal(true)} className="btn-primary" style={{ padding: '8px 15px', fontSize: '0.8rem', background: '#3b82f6', borderColor: '#3b82f6' }}>
                                    📁 Cerrar Mes / Sueldos
                                </button>
                            </div>
                        </div>

                        <div className="grid" style={{ gap: '15px' }}>
                                <div className="mt-md" style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.9rem' }}>
                                        <span>Total Efectivo + Bancos + Por Cobrar</span>
                                        <span style={{ fontWeight: 'bold' }}>$ {(Number(accounts.CAJA_LOCAL || 0) + Number(accounts.SOFI_MP || 0) + Number(accounts.TOMI || 0) + Number(accounts.LUCAS || 0) + Number(accounts.SOFI_PENDING || 0) + Number(accounts.ONLINE_PENDING || 0)).toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.9rem', color: '#ef4444' }}>
                                        <span title="Incluye alquiler, sueldos fijos y el gasto mensual de Carolina configurado.">(-) Gastos Fijos Pendientes {isAnnual ? 'del Año' : 'del Mes'}</span>
                                        <span style={{ fontWeight: 'bold' }}>- $ {(Number(dividendTotals.pendingProvisions) || 0).toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '0.9rem', color: '#fbbf24' }}>
                                        <span title="Es la plata que deberíamos pagar a proveedores para reponer los pares que vendimos en este periodo.">(-) Reserva Sugerida para Proveedores (CMV)</span>
                                        <span style={{ fontWeight: 'bold' }}>- $ {(Math.max(0, Number(dividendTotals.supplierReserve))).toLocaleString()}</span>
                                    </div>
                                    
                                    <div style={{ borderTop: '1px solid rgba(16, 185, 129, 0.2)', paddingTop: '15px', textAlign: 'center' }}>
                                        <p style={{ fontSize: '0.7rem', opacity: 0.8, marginBottom: '5px', textTransform: 'uppercase', color: '#10b981', fontWeight: 'bold' }}>Sueldo Líquido Sugerido ({isAnnual ? 'Acumulado Año' : 'Hoy'})</p>
                                        <h2 style={{ margin: 0, color: '#10b981' }}>
                                            $ {Math.max(0, Math.floor(((Number(accounts.CAJA_LOCAL || 0) + Number(accounts.SOFI_MP || 0) + Number(accounts.TOMI || 0) + Number(accounts.LUCAS || 0) + Number(accounts.SOFI_PENDING || 0) + Number(accounts.ONLINE_PENDING || 0)) - (Number(dividendTotals.pendingProvisions) || 0) - (Math.max(0, Number(dividendTotals.supplierReserve)))) / 3)).toLocaleString()}
                                        </h2>
                                        <p style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: '10px', lineHeight: '1.4' }}>
                                            💡 <b>Recomendación de Pago:</b> Para mantener el stock sano, {isAnnual ? 'en el año' : 'este mes'} deberías pagarles a los proveedores <b>$ {(Math.max(0, Number(dividendTotals.supplierReserve))).toLocaleString()}</b>. <br/>
                                            {isAnnual ? 'El cálculo anual ayuda a compensar meses donde pagaste de más y el CMV quedó "negativo".' : `El resto de la deuda total (${((Math.abs(Number(accounts.PROVEEDOR)) + Math.abs(Number(accounts.CAROLINA)))).toLocaleString()}) se puede ir saldando a medida que haya excedentes.`}
                                        </p>
                                    </div>
                                </div>

                            {/* Detalle de Gastos Fijos Pendientes */}
                            {dividendTotals.provisionsDetails?.filter(p => p.pendiente > 0).length > 0 && (
                                <div style={{ marginTop: '20px', background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '15px', borderRadius: '12px' }}>
                                    <p style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#ef4444', marginBottom: '10px', textTransform: 'uppercase' }}>📉 Gastos Fijos Pendientes {isAnnual ? 'del Año' : 'de Pagar'}:</p>
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
                                    <li><strong>Total Efectivo + Bancos + Por Cobrar:</strong> Todo el dinero disponible y por ingresar en este periodo.</li>
                                    <li><strong>Gastos Fijos Pendientes:</strong> Gastos fijos que aún no se han pagado en el {isAnnual ? 'año' : 'mes'} seleccionado.</li>
                                    <li><strong>Reserva Sugerida Proveedores:</strong> CMV {isAnnual ? 'anual' : 'mensual'} menos pagos realizados. Ayuda a compensar si un mes pagaste de más.</li>
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
                                        <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>{customStats.count} pares vendidos • $ {Math.round(customStats.neto / Math.max(1, customStats.count)).toLocaleString()} promedio</p>
                                    </div>
                                    <button className="btn-secondary" onClick={() => setViewDetail({ period: 'custom' })} style={{ fontSize: '0.75rem' }}>Ver Detalle 📋</button>
                                </div>
                            )}
                        </div>

                        <div className="grid mt-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                            <div className="card text-center" style={{ borderLeft: '4px solid var(--accent)', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'today' })}>
                                <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Hoy</p>
                                <h2 style={{ color: 'var(--accent)', margin: '5px 0' }}>$ {stats.today.neto.toLocaleString()}</h2>
                                <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>{stats.today.count} pares • $ {Math.round(stats.today.neto / Math.max(1, stats.today.count)).toLocaleString()} prom.</p>
                            </div>
                            <div className="card text-center" style={{ borderLeft: '4px solid var(--primary)', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'week' })}>
                                <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Últimos 7 días</p>
                                <h2 style={{ color: 'var(--primary)', margin: '5px 0' }}>$ {stats.week.neto.toLocaleString()}</h2>
                                <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>{stats.week.count} pares • $ {Math.round(stats.week.neto / Math.max(1, stats.week.count)).toLocaleString()} prom.</p>
                            </div>
                            <div className="card text-center" style={{ borderLeft: '4px solid #8b5cf6', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'month' })}>
                                <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Últimos 30 días</p>
                                <h2 style={{ color: '#8b5cf6', margin: '5px 0' }}>$ {stats.month.neto.toLocaleString()}</h2>
                                <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>{stats.month.count} pares • $ {Math.round(stats.month.neto / Math.max(1, stats.month.count)).toLocaleString()} prom.</p>
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
