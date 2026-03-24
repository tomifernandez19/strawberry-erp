'use client'
import { useState, useEffect } from 'react'
import { getFinanceSummary, getRecentPersonas, recordMonthClosing } from '@/lib/actions'
import Loader from '@/components/Loader'

export default function ReportesPage() {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState(null)
    const [showCloseModal, setShowCloseModal] = useState(false)
    const [closingData, setClosingData] = useState([
        { name: 'SOFI', amount: 0, cuenta: 'SOFI_MP' },
        { name: 'TOMI', amount: 0, cuenta: 'TOMI' },
        { name: 'LUCAS', amount: 0, cuenta: 'LUCAS' }
    ])

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        setLoading(true)
        try {
            const res = await getFinanceSummary()
            setData(res)

            // Set default estimated salary for closing month
            const estimated = Math.floor((res.dividendTotals.sales - res.dividendTotals.paidPurchases - res.dividendTotals.expenses - res.dividendTotals.pendingProvisions - res.dividendTotals.supplierReserve + res.dividendTotals.contributions) / 3);
            setClosingData(prev => prev.map(p => ({ ...p, amount: estimated > 0 ? estimated : 0 })));

        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
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

    const { accounts, billingByPerson, dividendTotals } = data;

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Reportes Financieros</h1>
                <p style={{ opacity: 0.7 }}>Resumen de caja y análisis de utilidades</p>
            </header>

            {/* Ficha de Saldos Globales */}
            <div className="grid mt-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                <div className="card" style={{ border: '1px solid var(--primary)' }}>
                    <p style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 'bold' }}>💰 SALDOS TOTALES ACUMULADOS:</p>
                    <div className="grid mt-md" style={{ gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Caja Local (Efectivo)</span>
                            <span style={{ fontWeight: 'bold' }}>$ {accounts.CAJA_LOCAL.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Cuentas Dueños (Sofi/Tomi/Luc)</span>
                            <span style={{ fontWeight: 'bold' }}>$ {(accounts.SOFI_MP + accounts.TOMI + accounts.LUCAS).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Tarjetas Pendientes</span>
                            <span style={{ fontWeight: 'bold', color: '#666' }}>$ {accounts.SOFI_PENDING.toLocaleString()}</span>
                        </div>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', marginTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 'bold' }}>EFECTIVO TOTAL REAL</span>
                            <span style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '1.2rem' }}>
                                $ {(accounts.CAJA_LOCAL + accounts.SOFI_MP + accounts.TOMI + accounts.LUCAS).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="card" style={{ border: '1px solid #ef4444' }}>
                    <p style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 'bold' }}>🚩 DEUDAS PENDIENTES:</p>
                    <div className="grid mt-md" style={{ gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Deuda con Carolina</span>
                            <span style={{ fontWeight: 'bold', color: '#ef4444' }}>$ {Math.abs(accounts.CAROLINA).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Deuda a Proveedor</span>
                            <span style={{ fontWeight: 'bold', color: '#ef4444' }}>$ {Math.abs(accounts.PROVEEDOR).toLocaleString()}</span>
                        </div>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', marginTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 'bold' }}>PASIVO TOTAL</span>
                            <span style={{ fontWeight: 'bold', color: '#ef4444', fontSize: '1.2rem' }}>
                                $ {(Math.abs(accounts.CAROLINA) + Math.abs(accounts.PROVEEDOR)).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sección de Facturación por Dueño */}
            <section className="mt-xl">
                <h3>📊 Facturación por Dueño (Histórico Planilla)</h3>
                <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '20px' }}>Basado solo en ventas enviadas a Arka (Excluye Efectivo/Mayorista)</p>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                    {Object.entries(billingByPerson).map(([owner, amount]) => (
                        <div key={owner} className="card text-center" style={{ borderLeft: '4px solid var(--accent)' }}>
                            <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>{owner}</p>
                            <h3 style={{ margin: 0 }}>$ {amount.toLocaleString()}</h3>
                        </div>
                    ))}
                </div>
            </section>

            {/* ANÁLISIS DE SUELDOS / DIVIDENDOS */}
            <section className="mt-xl">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3>🧬 Análisis de Sueldos / Resultado del Mes</h3>
                    <button
                        onClick={() => setShowCloseModal(true)}
                        className="btn-primary"
                        style={{ padding: '8px 15px', fontSize: '0.8rem', background: '#3b82f6', borderColor: '#3b82f6' }}
                    >
                        📁 Registrar Sueldos (Cierre Mes)
                    </button>
                </div>

                <div className="card" style={{ border: '2px solid #555' }}>
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
                        <div>
                            <p style={{ fontSize: '0.85rem', fontWeight: 'bold', borderBottom: '1px solid #444', paddingBottom: '10px', marginBottom: '15px' }}>FLUJO DE CAJA (ESTE MES):</p>

                            <div className="grid" style={{ gap: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ opacity: 0.8 }}>(+) Ventas Acreditadas (Solo Mes Actual)</span>
                                    <span style={{ color: 'var(--accent)' }}>$ {dividendTotals.sales.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ opacity: 0.8 }}>(-) Pagos Efectuados (Prov/Caro)</span>
                                    <span style={{ color: '#ef4444' }}>- $ {dividendTotals.paidPurchases.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ opacity: 0.8 }}>(-) Gastos Generales (Pagados)</span>
                                    <span style={{ color: '#ef4444' }}>- $ {dividendTotals.expenses.toLocaleString()}</span>
                                </div>
                                {dividendTotals.pendingProvisions > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                        <span style={{ opacity: 0.8 }}>⚠️ (-) Reservas Gastos Fijos (Pendientes)</span>
                                        <span style={{ color: '#fbbf24' }}>- $ {dividendTotals.pendingProvisions.toLocaleString()}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ opacity: 0.8 }}>🏦 (-) Fondo para Proveedores ({dividendTotals.supplierReservePercent}%)</span>
                                    <span style={{ color: '#fbbf24' }}>- $ {dividendTotals.supplierReserve.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span style={{ opacity: 0.8 }}>(+) Aportes (Capital / Cambio)</span>
                                    <span style={{ color: 'var(--accent)' }}>+ $ {dividendTotals.contributions.toLocaleString()}</span>
                                </div>

                                <div style={{ borderTop: '2px solid rgba(255,255,255,0.1)', paddingTop: '15px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h4 style={{ margin: 0 }}>Monto Libra a Distribuir</h4>
                                        <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Efectivo libre tras reservas y fijos</p>
                                    </div>
                                    <h3 style={{ margin: 0, color: 'var(--accent)' }}>
                                        $ {(dividendTotals.sales - dividendTotals.paidPurchases - dividendTotals.expenses - dividendTotals.pendingProvisions - dividendTotals.supplierReserve + dividendTotals.contributions).toLocaleString()}
                                    </h3>
                                </div>

                                {/* Desglose de Gastos Fijos Pendientes */}
                                {dividendTotals.provisionsDetails?.length > 0 && (
                                    <div style={{ marginTop: '20px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px' }}>
                                        <p style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '10px', textTransform: 'uppercase' }}>Desglose de Gastos Fijos (Pendientes/Pagados):</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {dividendTotals.provisionsDetails.map(item => (
                                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                                    <span style={{ opacity: 0.6 }}>{item.nombre}</span>
                                                    <span style={{ color: item.pendiente > 0 ? '#fbbf24' : '#10b981' }}>
                                                        {item.pendiente > 0 ? `-$${item.pendiente.toLocaleString()}` : '✅ OK'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div style={{ background: 'rgba(255,191,0,0.05)', border: '1px dashed rgba(255,191,0,0.2)', padding: '20px', borderRadius: '12px', marginTop: '20px', textAlign: 'center' }}>
                                    <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '5px' }}>SUELDO ESTIMADO POR SOCIO</p>
                                    <h2 style={{ margin: 0, color: '#ffbf00' }}>
                                        $ {((dividendTotals.sales - dividendTotals.paidPurchases - dividendTotals.expenses - dividendTotals.pendingProvisions - dividendTotals.supplierReserve + dividendTotals.contributions) / 3).toLocaleString()}
                                    </h2>
                                    <p style={{ fontSize: '0.65rem', opacity: 0.4, marginTop: '5px' }}>* Resultado del mes proyectado tras asegurar el futuro del negocio.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* MODAL CIERRE DE MES */}
            {showCloseModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '500px', width: '100%', animation: 'slideUp 0.3s ease-out' }}>
                        <h2 style={{ marginBottom: '10px' }}>Cierre de Mes / Distribución</h2>
                        <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: '20px' }}>Confirmá cuánto dinero retira cada socio este mes. Esto se cargará como un egreso de "Retiro Personal".</p>

                        <div className="grid" style={{ gap: '15px' }}>
                            {closingData.map((p, idx) => (
                                <div key={p.name} className="grid" style={{ gridTemplateColumns: '1fr 2fr', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 'bold' }}>{p.name}:</span>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>$</span>
                                        <input
                                            type="number"
                                            value={p.amount}
                                            onChange={(e) => {
                                                const newData = [...closingData];
                                                newData[idx].amount = parseFloat(e.target.value) || 0;
                                                setClosingData(newData);
                                            }}
                                            className="input-field"
                                            style={{ margin: 0, paddingLeft: '25px' }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid mt-xl" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <button onClick={() => setShowCloseModal(false)} className="btn-secondary">Cancelar</button>
                            <button onClick={handleCloseMonth} className="btn-primary" style={{ background: '#3b82f6', borderColor: '#3b82f6' }}>Confirmar Payout ✅</button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ height: '80px' }}></div>

            <style jsx>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
