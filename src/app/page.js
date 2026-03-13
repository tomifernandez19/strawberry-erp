'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getDailySummary, registerTiendanubeWebhooks, getPendingInvoicesSummary, getRecentUnifiedCaja } from '@/lib/actions'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/context/AuthContext'

export default function HomePage() {
    const { isAdmin, user } = useAuth()
    const [summary, setSummary] = useState({ count: 0, total: 0, neto: 0, cash: 0, items: [] })
    const [pendingQR, setPendingQR] = useState(0)
    const [pendingDispatches, setPendingDispatches] = useState(0)
    const [pendingLocation, setPendingLocation] = useState(0)
    const [pendingImages, setPendingImages] = useState(0)
    const [showCashDetail, setShowCashDetail] = useState(false)
    const [recentMovements, setRecentMovements] = useState([])
    const [loadingMovements, setLoadingMovements] = useState(false)
    const [invoiceCounts, setInvoiceCounts] = useState({ sofi: 0, tomi: 0, lucas: 0, total: 0 })

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

                // Task 3: Units with QR but without Location
                const { count: locCount } = await supabase
                    .from('unidades')
                    .select('*', { count: 'exact', head: true })
                    .not('codigo_qr', 'is', null)
                    .is('ubicacion', null)
                    .eq('estado', 'DISPONIBLE')
                setPendingLocation(locCount || 0)

                // Task 4: Invoices
                const res = await getPendingInvoicesSummary()
                if (res.success) setInvoiceCounts(res.count)

                // Task 5: Variants missing images
                const { count: imgCount } = await supabase
                    .from('variantes')
                    .select('*', { count: 'exact', head: true })
                    .is('imagen_url', null)
                setPendingImages(imgCount || 0)
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

    async function fetchCashDetail() {
        setLoadingMovements(true)
        setShowCashDetail(true)
        const data = await getRecentUnifiedCaja()
        setRecentMovements(data || [])
        setLoadingMovements(false)
    }

    const renderCard = (type, mode = 'TOP') => {
        let count = 0;
        let title = '';
        let subtitle = '';
        let href = '';
        let borderColor = '';
        let bg = '';
        let accentColor = '';
        let extra = null;

        if (type === 'QR') {
            count = pendingQR;
            title = 'Sin Etiquetar (QR)';
            subtitle = `${count} unidades pendientes`;
            href = '/asignar';
            borderColor = 'rgba(255,255,255,0.1)';
            accentColor = '#ef4444';
        } else if (type === 'LOC') {
            count = pendingLocation;
            title = 'Sin Ubicación (Depósito)';
            subtitle = `${count} unidades pendientes`;
            href = '/ubicacion';
            borderColor = 'rgba(16, 185, 129, 0.3)';
            bg = 'rgba(16, 185, 129, 0.05)';
            accentColor = '#10b981';
        } else if (type === 'DISPATCH') {
            count = pendingDispatches;
            title = 'Despachos Pendientes';
            subtitle = `${count} pedidos Tiendanube`;
            href = '/despachar';
            borderColor = 'rgba(234, 179, 8, 0.3)';
            bg = 'rgba(234, 179, 8, 0.05)';
            accentColor = '#eab308';
        } else if (type === 'INVOICE') {
            count = invoiceCounts.total;
            title = 'Facturación Pendiente';
            subtitle = '';
            href = '/facturacion';
            borderColor = 'rgba(139, 92, 246, 0.3)';
            bg = 'rgba(139, 92, 246, 0.05)';
            accentColor = '#8b5cf6';
            extra = (
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>Sofi: {invoiceCounts.sofi}</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>Tomi: {invoiceCounts.tomi}</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>Lucas: {invoiceCounts.lucas}</span>
                </div>
            )
        } else if (type === 'IMAGE') {
            count = pendingImages;
            title = 'Faltan Fotos';
            subtitle = `${count} productos sin imagen`;
            href = '/gestion?tab=imagenes';
            borderColor = 'rgba(236, 72, 153, 0.3)';
            bg = 'rgba(236, 72, 153, 0.05)';
            accentColor = '#ec4899';
        }

        const isCounting = count > 0;
        if (mode === 'TOP' && !isCounting) return null;
        if (mode === 'BOTTOM' && isCounting) return null;

        return (
            <Link href={href} key={type} style={{ textDecoration: 'none', color: 'inherit' }}>
                <section className="card" style={{ border: borderColor, background: bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', marginBottom: 0 }}>
                    <div>
                        <h4 style={{ fontSize: '0.8rem', opacity: 0.8 }}>{title}</h4>
                        {subtitle && <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>{subtitle}</p>}
                        {extra}
                    </div>
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: count > 0 ? accentColor : 'var(--accent)' }}>
                        {count}
                    </span>
                </section>
            </Link>
        )
    }

    const PendingGrid = ({ mode }) => {
        const items = ['QR', 'LOC', 'DISPATCH', 'INVOICE', 'IMAGE'].map(t => renderCard(t, mode)).filter(Boolean)
        if (items.length === 0) return null;
        return (
            <div className="grid mt-md" style={{ gap: '15px' }}>
                {items}
            </div>
        )
    }

    const isAdminAndHasTasks = isAdmin && (pendingQR > 0 || pendingDispatches > 0 || pendingLocation > 0 || invoiceCounts.total > 0 || pendingImages > 0)

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Strawberry Trejo</h1>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                    <p style={{ opacity: 0.7, margin: 0, fontSize: '0.85rem' }}>Gestión de Calzado</p>
                    {user && (
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            padding: '2px 10px',
                            borderRadius: '20px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            marginTop: '4px'
                        }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 'bold' }}>●</span>
                            <span style={{ fontSize: '0.7rem', opacity: 0.9 }}>{user.email}</span>
                            <span style={{ fontSize: '0.6rem', opacity: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                {user.role === 'PROPIETARIA' ? 'Admin' : 'Ventas'}
                            </span>
                        </div>
                    )}
                </div>
            </header>

            {/* Section 1: Top Pending (only those > 0) */}
            {isAdmin && <PendingGrid mode="TOP" />}

            <section className={`mt-lg grid ${isAdmin ? 'grid-cols-2 grid-mobile-stack' : ''}`} style={{ gap: '15px' }}>
                <Link href="/consultar" className="btn-primary" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🔍</span>
                    <span style={{ fontSize: '0.9rem' }}>Consultar Stock</span>
                </Link>
                <Link href="/vender" className="btn-primary" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'var(--accent)' }}>
                    <span style={{ fontSize: '1.2rem' }}>💰</span>
                    <span style={{ fontSize: '0.9rem' }}>Nueva Venta</span>
                </Link>

                {isAdmin && (
                    <>
                        <Link href="/compras/nueva" className="btn-secondary" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '1.2rem' }}>📦</span>
                            <span style={{ fontSize: '0.9rem' }}>Alta Stock</span>
                        </Link>
                        <Link href="/cambios" className="btn-secondary" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '1.2rem' }}>🔄</span>
                            <span style={{ fontSize: '0.9rem' }}>Cambios</span>
                        </Link>
                        <Link href="/gestion" className="btn-secondary" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                            <span style={{ fontSize: '1.2rem' }}>⚙️</span>
                            <span style={{ fontSize: '0.9rem' }}>Gestionar</span>
                        </Link>
                    </>
                )}
            </section>

            {isAdmin && (
                <Link href="/caja" style={{ textDecoration: 'none', color: 'inherit' }} className="mt-md">
                    <section className="card" style={{
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        background: 'rgba(59, 130, 246, 0.05)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 20px'
                    }}>
                        <div>
                            <h4 style={{ fontSize: '0.75rem', opacity: 0.8 }}>Movimientos de Caja</h4>
                            <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Retiros y depósitos manuales</p>
                        </div>
                        <span style={{ fontSize: '1.2rem' }}>🏦</span>
                    </section>
                </Link>
            )}

            <div className="grid">
                <div className={`grid grid-cols-2 grid-mobile-stack`} style={{ gap: '15px', marginTop: '15px' }}>
                    <section
                        className="card"
                        style={{ border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)', cursor: 'pointer', marginBottom: 0, padding: '15px' }}
                        onClick={fetchCashDetail}
                    >
                        <h4 style={{ fontSize: '0.7rem', opacity: 0.8, color: 'var(--accent)' }}>Caja en Local</h4>
                        <div style={{ marginTop: '5px' }}>
                            <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                                $ {summary.cash.toLocaleString()}
                            </p>
                            <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>📊 Detalle</p>
                        </div>
                    </section>

                    <Link href={isAdmin ? "/reportes" : "#"} style={{ textDecoration: 'none', color: 'inherit', cursor: isAdmin ? 'pointer' : 'default' }}>
                        <section className="card" style={{ border: '1px solid rgba(255,255,255,0.1)', marginBottom: 0, padding: '15px' }}>
                            <h4 style={{ fontSize: '0.7rem', opacity: 0.8 }}>Ingreso Neto Hoy</h4>
                            <div style={{ marginTop: '5px' }}>
                                <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white' }}>
                                    $ {summary.neto.toLocaleString()}
                                </p>
                                <p style={{ fontSize: '0.6rem', opacity: 0.4 }}>Lista: $ {summary.total.toLocaleString()}</p>
                            </div>
                        </section>
                    </Link>
                </div>

                {/* Section 2: Bottom Pending removed as requested by user - only show if count > 0 */}
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

            {/* Modal for Cash Detail */}
            {showCashDetail && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 2000, padding: '20px'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3>Movimientos de Efectivo</h3>
                            <button onClick={() => setShowCashDetail(false)} className="btn-secondary" style={{ padding: '4px 12px' }}>Cerrar</button>
                        </div>

                        {loadingMovements ? (
                            <p className="text-center py-lg">Cargando...</p>
                        ) : (
                            <div className="grid" style={{ gap: '10px' }}>
                                {recentMovements.length === 0 ? (
                                    <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No hay movimientos recientes.</p>
                                ) : (
                                    recentMovements.map((m, i) => (
                                        <div key={i} style={{
                                            padding: '12px 10px',
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{m.tipo === 'INGRESO' ? '📥 Ingreso' : (m.tipo === 'EGRESO' ? '📤 Retiro' : m.tipo)}</p>
                                                    {m.tag === 'VENTA' && <span style={{ fontSize: '0.6rem', padding: '1px 5px', background: 'var(--accent)', borderRadius: '4px', color: 'white' }}>VENTA</span>}
                                                </div>
                                                <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>{m.motivo || 'Sin descripción'}</p>
                                                <p style={{ fontSize: '0.65rem', opacity: 0.4 }}>{new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} • {m.persona} • 🏦 {m.cuenta?.replace('_', ' ')}</p>
                                            </div>
                                            <p style={{
                                                fontWeight: 'bold',
                                                color: m.tipo === 'INGRESO' ? 'var(--accent)' : '#ef4444'
                                            }}>
                                                {m.tipo === 'INGRESO' ? '+' : '-'} $ {Math.abs(m.monto).toLocaleString()}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
