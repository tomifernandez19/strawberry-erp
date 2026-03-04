'use client'
import { useState, useEffect } from 'react'
import { getExtendedStats, getCustomRangeStats } from '@/lib/actions'

export default function ReportesPage() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [viewDetail, setViewDetail] = useState(null) // { period: 'today'|'week'|'month'|'custom', owner: 'propia'|'carolina' }

    // Custom range state
    const [customRange, setCustomRange] = useState({ start: '', end: '' })
    const [customStats, setCustomStats] = useState(null)
    const [customLoading, setCustomLoading] = useState(false)

    useEffect(() => {
        async function load() {
            const data = await getExtendedStats()
            setStats(data)
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

    const DetailView = ({ period, owner }) => {
        const periodLabel = period === 'today' ? 'Hoy' : period === 'week' ? 'Semana' : period === 'month' ? 'Mes' : 'Personalizado';
        const ownerLabel = owner === 'propia' ? 'Propia' : 'Carolina';

        if (!stats) return <p>Cargando datos...</p>;
        if (stats.error) return <p style={{ color: 'var(--error)' }}>Error al cargar datos. Verifique los permisos de vendedor.</p>;

        const periodData = period === 'custom' ? customStats : stats[period];
        if (!periodData || !periodData[owner]) return <p>No hay datos disponibles.</p>;

        const items = periodData[owner].items || [];

        return (
            <div className="grid mt-md">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Detalle {ownerLabel} - {periodLabel}</h3>
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
                                    <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>$ {item.precio.toLocaleString()}</span>
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
                <DetailView period={viewDetail.period} owner={viewDetail.owner} />
                <div style={{ height: '80px' }}></div>
            </div>
        )
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Reporte de Ventas</h1>
                <p style={{ opacity: 0.7 }}>Rendimiento de Strawberry Trejo</p>
            </header>

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
                        <h2 style={{ color: 'var(--accent)', margin: '5px 0' }}>$ {customStats.total.toLocaleString()}</h2>
                        <p style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '10px' }}>{customStats.count} pares vendidos</p>

                        <div style={{ display: 'flex', gap: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'custom', owner: 'propia' })}>
                                <p style={{ fontSize: '0.65rem', color: '#ec4899' }}>Propia 🗂️</p>
                                <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>$ {customStats.propia.total.toLocaleString()}</p>
                            </div>
                            <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '10px', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'custom', owner: 'carolina' })}>
                                <p style={{ fontSize: '0.65rem', color: '#8b5cf6' }}>Carolina 🗂️</p>
                                <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>$ {customStats.carolina.total.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            <section className="grid mt-lg">
                {/* Hoy */}
                <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
                    <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>Ventas de Hoy</p>
                    <h2 style={{ color: 'var(--accent)', margin: '5px 0' }}>$ {stats?.today.total.toLocaleString()}</h2>
                    <p style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '10px' }}>{stats?.today.count} pares vendidos</p>

                    <div style={{ display: 'flex', gap: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'today', owner: 'propia' })}>
                            <p style={{ fontSize: '0.65rem', color: '#ec4899' }}>Propia 🗂️</p>
                            <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>$ {stats?.today.propia.total.toLocaleString()}</p>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '10px', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'today', owner: 'carolina' })}>
                            <p style={{ fontSize: '0.65rem', color: '#8b5cf6' }}>Carolina 🗂️</p>
                            <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>$ {stats?.today.carolina.total.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Semana */}
                <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
                    <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>Últimos 7 días</p>
                    <h2 style={{ color: 'var(--primary)', margin: '5px 0' }}>$ {stats?.week.total.toLocaleString()}</h2>
                    <p style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '10px' }}>{stats?.week.count} pares vendidos</p>

                    <div style={{ display: 'flex', gap: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'week', owner: 'propia' })}>
                            <p style={{ fontSize: '0.65rem', color: '#ec4899' }}>Propia 🗂️</p>
                            <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>$ {stats?.week.propia.total.toLocaleString()}</p>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '10px', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'week', owner: 'carolina' })}>
                            <p style={{ fontSize: '0.65rem', color: '#8b5cf6' }}>Carolina 🗂️</p>
                            <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>$ {stats?.week.carolina.total.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Mes */}
                <div className="card" style={{ borderLeft: '4px solid #8b5cf6' }}>
                    <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>Últimos 30 días</p>
                    <h2 style={{ color: '#8b5cf6', margin: '5px 0' }}>$ {stats?.month.total.toLocaleString()}</h2>
                    <p style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '10px' }}>{stats?.month.count} pares vendidos</p>

                    <div style={{ display: 'flex', gap: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'month', owner: 'propia' })}>
                            <p style={{ fontSize: '0.65rem', color: '#ec4899' }}>Propia 🗂️</p>
                            <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>$ {stats?.month.propia.total.toLocaleString()}</p>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '10px', cursor: 'pointer' }} onClick={() => setViewDetail({ period: 'month', owner: 'carolina' })}>
                            <p style={{ fontSize: '0.65rem', color: '#8b5cf6' }}>Carolina 🗂️</p>
                            <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>$ {stats?.month.carolina.total.toLocaleString()}</p>
                        </div>
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

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
