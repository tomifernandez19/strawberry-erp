'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getDailySummary } from '@/lib/actions'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/context/AuthContext'

export default function HomePage() {
    const { isAdmin, user } = useAuth()
    const [summary, setSummary] = useState({ count: 0, total: 0, cash: 0, items: [] })
    const [pendingQR, setPendingQR] = useState(0)

    const [pendingDispatches, setPendingDispatches] = useState(0)

    useEffect(() => {
        if (!user) return

        async function loadData() {
            const s = await getDailySummary(isAdmin ? null : user.id)
            setSummary(s)

            if (isAdmin) {
                // Task 1: Units without QR
                const { count: qrCount } = await supabase
                    .from('unidades')
                    .select('*', { count: 'exact', head: true })
                    .eq('estado', 'PENDIENTE_QR')
                setPendingQR(qrCount || 0)

                // Task 2: Pending Online Dispatches
                const { count: dispatchCount } = await supabase
                    .from('pedidos_online')
                    .select('*', { count: 'exact', head: true })
                    .eq('estado', 'PENDIENTE_DESPACHO')
                setPendingDispatches(dispatchCount || 0)
            }
        }

        loadData()

        // 1. Realtime Subscription
        const channel = supabase
            .channel('db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, loadData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos_caja' }, loadData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'unidades' }, loadData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_online' }, loadData)
            .subscribe()

        // 2. Refresh on window focus (when coming back to the tab)
        window.addEventListener('focus', loadData)

        return () => {
            supabase.removeChannel(channel)
            window.removeEventListener('focus', loadData)
        }
    }, [isAdmin, user])

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Strawberry Trejo</h1>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <p style={{ opacity: 0.7, margin: 0 }}>Gestión de Calzado</p>
                    {user && (
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            padding: '4px 12px',
                            borderRadius: '20px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            marginTop: '8px'
                        }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 'bold' }}>●</span>
                            <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>{user.email}</span>
                            <span style={{ fontSize: '0.65rem', opacity: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                {user.role === 'PROPIETARIA' ? 'Admin' : 'Ventas'}
                            </span>
                        </div>
                    )}
                </div>
            </header>

            <section className="mt-lg grid" style={{ gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: '15px' }}>
                <Link href="/consultar" className="btn-primary" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.5rem' }}>🔍</span>
                    <span>Consultar Stock</span>
                </Link>
                <Link href="/vender" className="btn-primary" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'var(--accent)' }}>
                    <span style={{ fontSize: '1.5rem' }}>💰</span>
                    <span>Nueva Venta</span>
                </Link>

                {isAdmin && (
                    <>
                        <Link href="/compras/nueva" className="btn-secondary" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.5rem' }}>📦</span>
                            <span>Alta Stock</span>
                        </Link>
                        <Link href="/gestion" className="btn-secondary" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                            <span style={{ fontSize: '1.5rem' }}>⚙️</span>
                            <span>Gestionar / Corregir</span>
                        </Link>
                    </>
                )}
            </section>

            <div className="grid">
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <section className="card mt-lg" style={{ border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)' }}>
                        <h4 style={{ fontSize: '0.8rem', opacity: 0.8, color: 'var(--accent)' }}>Efectivo en Caja</h4>
                        <div style={{ marginTop: '10px' }}>
                            <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                                $ {summary.cash.toLocaleString()}
                            </p>
                            <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Saldo real disponible</p>
                        </div>
                    </section>

                    <Link href={isAdmin ? "/reportes" : "#"} style={{ textDecoration: 'none', color: 'inherit', cursor: isAdmin ? 'pointer' : 'default' }}>
                        <section className="card mt-lg" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                            <h4 style={{ fontSize: '0.8rem', opacity: 0.8 }}>Total Ventas</h4>
                            <div style={{ marginTop: '10px' }}>
                                <p style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                                    $ {summary.total.toLocaleString()}
                                </p>
                                <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>{summary.count} ventas hoy</p>
                            </div>
                        </section>
                    </Link>
                </div>

                {isAdmin && (
                    <div className="grid mt-md" style={{ gap: '15px' }}>
                        <Link href="/asignar" style={{ textDecoration: 'none', color: 'inherit' }}>
                            <section className="card" style={{ border: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px' }}>
                                <div>
                                    <h4 style={{ fontSize: '0.8rem', opacity: 0.8 }}>Sin Etiquetar (QR)</h4>
                                    <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>{pendingQR} unidades pendientes</p>
                                </div>
                                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: pendingQR > 0 ? '#ef4444' : 'var(--accent)' }}>
                                    {pendingQR}
                                </span>
                            </section>
                        </Link>

                        <Link href="/despachar" style={{ textDecoration: 'none', color: 'inherit' }}>
                            <section className="card" style={{
                                border: '1px solid rgba(234, 179, 8, 0.3)',
                                background: 'rgba(234, 179, 8, 0.05)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '15px 20px'
                            }}>
                                <div>
                                    <h4 style={{ fontSize: '0.8rem', opacity: 0.8 }}>Despachos Pendientes</h4>
                                    <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>{pendingDispatches} pedidos Tiendanube</p>
                                </div>
                                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: pendingDispatches > 0 ? '#eab308' : 'var(--accent)' }}>
                                    {pendingDispatches}
                                </span>
                            </section>
                        </Link>

                        <Link href="/caja" style={{ textDecoration: 'none', color: 'inherit' }}>
                            <section className="card" style={{
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                background: 'rgba(59, 130, 246, 0.05)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '15px 20px'
                            }}>
                                <div>
                                    <h4 style={{ fontSize: '0.8rem', opacity: 0.8 }}>Movimientos de Caja</h4>
                                    <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Retiros y depósitos manuales</p>
                                </div>
                                <span style={{ fontSize: '1.5rem' }}>🏦</span>
                            </section>
                        </Link>
                    </div>
                )}
            </div>

            <div className="mt-lg">
                <h3 style={{ fontSize: '1rem', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Ventas de Hoy</span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.5, fontWeight: 'normal' }}>Lista detallada</span>
                </h3>

                <div className="grid" style={{ gap: '10px' }}>
                    {summary.items.length === 0 ? (
                        <p style={{ textAlign: 'center', opacity: 0.5, padding: '40px', background: 'var(--card-bg)', borderRadius: '16px', fontSize: '0.9rem' }}>
                            Aún no hay ventas registradas hoy
                        </p>
                    ) : (
                        summary.items.map((item) => (
                            <div key={item.id} className="card" style={{ padding: '12px 15px', marginBottom: '0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{item.modelo}</span>
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--secondary)', borderRadius: '4px', opacity: 0.8 }}>{item.talle}</span>
                                            {isAdmin && (
                                                <span style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', opacity: 0.6 }}>
                                                    👤 {item.vendedor_nombre}
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>{item.color} • {item.medio_pago}</p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '0.95rem' }}>$ {item.precio.toLocaleString()}</p>
                                        <p style={{ fontSize: '0.6rem', opacity: 0.4 }}>{new Date(item.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
