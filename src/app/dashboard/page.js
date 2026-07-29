'use client'
import { useState, useEffect } from 'react'
import { getFinanceSummary, getExtendedStats } from '@/lib/actions'
import Loader from '@/components/Loader'

export default function DashboardPage() {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState(null)
    const [stats, setStats] = useState(null)

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                const [fSummary, vStats] = await Promise.all([
                    getFinanceSummary(new Date().toISOString(), false),
                    getExtendedStats()
                ])
                setData(fSummary)
                setStats(vStats)
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    if (loading || !data || !stats) return <Loader />

    const { accounts = {}, dividendTotals = {} } = data;
    
    // Liquidez
    const totalLiquidity = 
        Number(accounts.CAJA_LOCAL || 0) + 
        Number(accounts.SOFI_MP || 0) + 
        Number(accounts.TOMI || 0) + 
        Number(accounts.LUCAS || 0) + 
        Number(accounts.SOFI_PENDING || 0) + 
        Number(accounts.ONLINE_PENDING || 0);

    // Métricas del Mes (Financieras)
    const monthSales = dividendTotals.sales || 0;
    const monthCMV = Math.max(0, dividendTotals.supplierReserve || 0);
    const fixedExpenses = (dividendTotals.pendingProvisions || 0) + (dividendTotals.expenses || 0);
    
    // Márgenes
    const grossMargin = monthSales > 0 ? ((monthSales - monthCMV) / monthSales) * 100 : 0;
    const netProfit = monthSales - monthCMV - fixedExpenses;
    const netMargin = monthSales > 0 ? (netProfit / monthSales) * 100 : 0;
    
    // Break-even
    const breakEven = grossMargin > 0 ? fixedExpenses / (grossMargin / 100) : 0;
    const breakEvenProgress = breakEven > 0 ? Math.min(100, (monthSales / breakEven) * 100) : 100;

    // Métricas Operativas (Ventas)
    const monthNetSales = stats.month?.neto || 0;
    const monthPairs = stats.month?.count || 0;
    const avgTicket = monthPairs > 0 ? monthNetSales / monthPairs : 0;

    return (
        <div className="grid mt-lg animate-in" style={{ paddingBottom: '40px' }}>
            <header style={{ marginBottom: '10px' }}>
                <h1 style={{ background: 'linear-gradient(to right, var(--accent), #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block' }}>
                    Executive Dashboard
                </h1>
                <p style={{ opacity: 0.7, fontSize: '0.85rem' }}>Visión ejecutiva del negocio en tiempo real</p>
            </header>

            {/* KPI Principales */}
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px' }}>
                <div className="card" style={{ padding: '15px', background: 'linear-gradient(145deg, rgba(16,185,129,0.1) 0%, rgba(16,185,129,0.02) 100%)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <p style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 'bold', color: 'var(--accent)' }}>CASH DISPONIBLE</p>
                    <h2 style={{ fontSize: '1.4rem', margin: '5px 0' }}>${totalLiquidity.toLocaleString()}</h2>
                    <p style={{ fontSize: '0.65rem', opacity: 0.6 }}>Liquidez total del negocio</p>
                </div>
                <div className="card" style={{ padding: '15px', background: 'linear-gradient(145deg, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0.02) 100%)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <p style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 'bold', color: 'var(--primary)' }}>VENTAS MES</p>
                    <h2 style={{ fontSize: '1.4rem', margin: '5px 0' }}>${monthSales.toLocaleString()}</h2>
                    <p style={{ fontSize: '0.65rem', opacity: 0.6 }}>{monthPairs} pares vendidos</p>
                </div>
            </div>

            {/* Análisis de Rentabilidad */}
            <h3 style={{ marginTop: '10px', fontSize: '1rem' }}>Rentabilidad (Mes Actual)</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '15px' }}>
                <div className="card" style={{ padding: '15px', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '5px' }}>Margen Bruto</p>
                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="60" height="60" viewBox="0 0 36 36">
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--primary)" strokeWidth="3" strokeDasharray={`${grossMargin}, 100`} />
                        </svg>
                        <span style={{ position: 'absolute', fontSize: '0.8rem', fontWeight: 'bold' }}>{grossMargin.toFixed(1)}%</span>
                    </div>
                </div>
                <div className="card" style={{ padding: '15px', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '5px' }}>Margen Neto</p>
                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="60" height="60" viewBox="0 0 36 36">
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={netMargin > 15 ? 'var(--accent)' : '#eab308'} strokeWidth="3" strokeDasharray={`${Math.max(0, netMargin)}, 100`} />
                        </svg>
                        <span style={{ position: 'absolute', fontSize: '0.8rem', fontWeight: 'bold' }}>{netMargin.toFixed(1)}%</span>
                    </div>
                </div>
                <div className="card" style={{ padding: '15px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <p style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '5px' }}>Utilidad Neta</p>
                    <h3 style={{ margin: 0, color: netProfit >= 0 ? 'var(--accent)' : '#ef4444' }}>${netProfit.toLocaleString()}</h3>
                </div>
            </div>

            {/* Punto de Equilibrio */}
            <div className="card" style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🎯 Punto de Equilibrio (Break-even)</h4>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: breakEvenProgress >= 100 ? 'var(--accent)' : '#eab308' }}>
                        {breakEvenProgress.toFixed(0)}%
                    </span>
                </div>
                
                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
                    <div style={{ 
                        height: '100%', 
                        width: `${breakEvenProgress}%`, 
                        background: breakEvenProgress >= 100 ? 'var(--accent)' : '#eab308',
                        transition: 'width 1s ease-out'
                    }}></div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', opacity: 0.6 }}>
                    <span>Ventas: ${monthSales.toLocaleString()}</span>
                    <span>Meta: ${Math.round(breakEven).toLocaleString()}</span>
                </div>
                
                {breakEvenProgress >= 100 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '10px', textAlign: 'center', background: 'rgba(16,185,129,0.1)', padding: '5px', borderRadius: '4px' }}>
                        ¡Meta alcanzada! Ya cubriste todos los costos fijos del mes.
                    </p>
                )}
            </div>

            {/* Insights Operativos */}
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
                <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ fontSize: '1.8rem' }}>🎟️</div>
                    <div>
                        <p style={{ fontSize: '0.7rem', opacity: 0.6, margin: 0 }}>Ticket Promedio</p>
                        <p style={{ fontSize: '1rem', fontWeight: 'bold', margin: '2px 0 0 0' }}>${Math.round(avgTicket).toLocaleString()}</p>
                    </div>
                </div>
                <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ fontSize: '1.8rem' }}>🛍️</div>
                    <div>
                        <p style={{ fontSize: '0.7rem', opacity: 0.6, margin: 0 }}>Rotación Mensual</p>
                        <p style={{ fontSize: '1rem', fontWeight: 'bold', margin: '2px 0 0 0' }}>{monthPairs} uds.</p>
                    </div>
                </div>
            </div>

            {/* Estilos locales para animaciones */}
            <style jsx>{`
                .animate-in {
                    animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
