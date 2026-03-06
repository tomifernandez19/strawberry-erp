'use client'
import { useState, useEffect } from 'react'
import { getPendingInvoicesList, markAsInvoiced } from '@/lib/actions'
import Link from 'next/link'

export default function FacturacionPage() {
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        loadInvoices()
    }, [])

    async function loadInvoices() {
        setLoading(true)
        const res = await getPendingInvoicesList()
        if (res.success) {
            setInvoices(res.data)
        } else {
            setError(res.message)
        }
        setLoading(false)
    }

    async function handleMarkDone(id) {
        if (!confirm('¿Marcar como facturado?')) return
        const res = await markAsInvoiced(id)
        if (res.success) {
            setInvoices(prev => prev.filter(v => v.id !== id))
        } else {
            alert(res.message)
        }
    }

    const getResponsible = (v) => {
        const mp = v.otro_medio_pago || v.medio_pago
        if (['TARJETA_DEBITO', 'TARJETA_CREDITO', 'QR'].includes(mp)) return { name: 'Sofi', color: '#ec4899' }
        if (mp === 'TRANSFERENCIA') return { name: 'Lucas', color: '#3b82f6' }
        return { name: 'Tomi', color: '#eab308' }
    }

    if (loading) return <div className="text-center mt-lg">Cargando pendientes...</div>

    return (
        <div className="grid mt-lg">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1>Facturación</h1>
                    <p style={{ opacity: 0.7 }}>Pendientes por medio de pago</p>
                </div>
                <Link href="/" className="btn-secondary" style={{ padding: '8px 15px' }}>Volver</Link>
            </header>

            {error && <div className="card" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>{error}</div>}

            {invoices.length === 0 ? (
                <div className="card text-center" style={{ padding: '50px', opacity: 0.5 }}>
                    <span style={{ fontSize: '3rem' }}>🎉</span>
                    <p>No hay facturas pendientes</p>
                </div>
            ) : (
                <div className="grid" style={{ gap: '12px' }}>
                    {invoices.map(v => {
                        const resp = getResponsible(v)
                        return (
                            <div key={v.id} className="card" style={{ padding: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <span style={{
                                                background: resp.color,
                                                color: 'white',
                                                fontSize: '0.65rem',
                                                padding: '2px 8px',
                                                borderRadius: '10px',
                                                fontWeight: 'bold'
                                            }}>
                                                {resp.name.toUpperCase()}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>
                                                {new Date(v.created_at).toLocaleDateString()} {new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <h4 style={{ margin: 0 }}>{v.variantes?.modelos?.descripcion || 'Venta Especial'}</h4>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>{v.variantes?.color} • {v.medio_pago.replace('_', ' ')}</p>
                                        <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent)', marginTop: '8px' }}>
                                            $ {v.total.toLocaleString()}
                                        </p>
                                    </div>
                                    <button
                                        className="btn-primary"
                                        style={{ padding: '8px 12px', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#10b981' }}
                                        onClick={() => handleMarkDone(v.id)}
                                    >
                                        Facturado ✅
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
