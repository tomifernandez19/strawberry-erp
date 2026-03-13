'use client'
import { useState, useEffect } from 'react'
import { getPendingInvoicesList, markAsInvoiced, generateInvoice, sendToInvoiceSheet } from '@/lib/actions'
import { getAfipPersonFromAccount } from '@/lib/afip-utils'
import Link from 'next/link'

export default function FacturacionPage() {
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [generating, setGenerating] = useState(null) // ID of invoice being generated
    const [sending, setSending] = useState(null) // ID of invoice being sent to sheet

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

    async function handleSendToSheet(venta) {
        if (!confirm('¿Mandar esta venta a la planilla de Google Sheets para procesar con Python?')) return
        setSending(venta.id)
        try {
            const res = await sendToInvoiceSheet(venta.id)
            if (res.success) {
                alert('¡Venta enviada a la planilla con éxito!')
                setInvoices(prev => prev.filter(v => v.id !== venta.id))
            } else {
                alert(`Error al enviar a la planilla: ${res.message}\n\nAsegurate de configurar las credenciales de Google en el Dashboard de Vercel.`)
            }
        } catch (err) {
            alert(err.message)
        } finally {
            setSending(null)
        }
    }

    async function handleAFIPInvoice(venta) {
        if (!confirm('¿Generar Factura Electrónica C en ARCA (AFIP)?')) return
        setGenerating(venta.id)
        try {
            const res = await generateInvoice(venta.id)
            if (res.success) {
                // Offer download/open
                const win = window.open();
                if (win) win.document.write(`<iframe src="${res.pdf}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`)

                // Update UI list
                setInvoices(prev => prev.filter(v => v.id !== venta.id))
            } else {
                const person = getAfipPersonFromAccount(venta.cuenta_destino).toUpperCase();
                alert(`Error ARCA: ${res.message}\n\nNota: Si estás en Vercel, recordá cargar los Certificados en el Dashboard de Vercel.`)
            }
        } catch (err) {
            alert(err.message)
        } finally {
            setGenerating(null)
        }
    }

    const getResponsible = (v) => {
        if (v.cuenta_destino === 'SOFI_MP') return { name: 'Sofi', color: '#ec4899' }
        if (v.cuenta_destino === 'LUCAS') return { name: 'Lucas', color: '#3b82f6' }
        if (v.cuenta_destino === 'TOMI') return { name: 'Tomi', color: '#eab308' }

        // Fallback or Legacy
        const mp = v.otro_medio_pago || v.medio_pago
        if (['TARJETA_DEBITO', 'TARJETA_CREDITO', 'QR'].includes(mp)) return { name: 'Sofi', color: '#ec4899' }
        if (mp === 'TRANSFERENCIA') return { name: 'Lucas', color: '#3b82f6' }
        return { name: 'Tomi', color: '#eab308' }
    }

    if (loading) return <div className="text-center mt-lg">Cargando pendientes...</div>

    return (
        <div className="grid mt-lg">
            <header style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1>Facturación</h1>
                        <p style={{ opacity: 0.7 }}>Pendientes por medio de pago</p>
                    </div>
                    <Link href="/" className="btn-secondary" style={{ padding: '8px 15px' }}>Volver</Link>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.65rem', opacity: 0.5, fontWeight: 'bold', width: '100%', marginBottom: '5px' }}>HERRAMIENTAS DE DIAGNÓSTICO (ARCA/AFIP):</span>
                    {['tomi', 'lucas', 'sofi'].map(p => (
                        <div key={p} style={{ display: 'flex', gap: '4px' }}>
                            <button
                                className="btn-secondary"
                                style={{ fontSize: '0.65rem', padding: '6px 10px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
                                onClick={async () => {
                                    const { debugAFIP } = await import('@/lib/actions')
                                    alert(`Chequeando ${p.toUpperCase()}...\n\nSi tarda más de 30s es problema de conexión con AFIP.`)
                                    const res = await debugAFIP(p, false)
                                    alert(`Status ${p.toUpperCase()}:\n${JSON.stringify(res, null, 2)}`)
                                }}
                            >
                                Status {p}
                            </button>
                            <button
                                className="btn-secondary"
                                style={{ fontSize: '0.65rem', padding: '6px 8px', borderColor: 'rgba(255,255,255,0.1)' }}
                                title="Forzar nuevo Token (TA)"
                                onClick={async () => {
                                    const { debugAFIP } = await import('@/lib/actions')
                                    if (!confirm(`¿Forzar nuevo token para ${p}? Usar solo si da error de autorización.`)) return
                                    alert(`Generando nuevo token para ${p}...`)
                                    const res = await debugAFIP(p, true)
                                    alert(`Resultado Force Token:\n${JSON.stringify(res, null, 2)}`)
                                }}
                            >
                                🔄
                            </button>
                        </div>
                    ))}
                </div>
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
                                        <h4 style={{ margin: 0 }}>
                                            {v.unidades?.[0]?.variantes?.modelos?.descripcion || 'Venta Especial'}
                                        </h4>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                                            {v.unidades?.[0]?.variantes?.color} • {v.medio_pago.replace(/_/g, ' ')}
                                        </p>

                                        {(v.nombre_cliente || v.telefono_cliente || v.email_cliente) && (
                                            <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <p style={{ fontSize: '0.65rem', opacity: 0.5, textTransform: 'uppercase', marginBottom: '5px' }}>Datos Cliente:</p>
                                                {v.nombre_cliente && <p style={{ fontSize: '0.75rem' }}>👤 {v.nombre_cliente}</p>}
                                                {v.telefono_cliente && <p style={{ fontSize: '0.75rem' }}>📞 {v.telefono_cliente}</p>}
                                                {v.email_cliente && <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>✉️ {v.email_cliente}</p>}
                                            </div>
                                        )}

                                        <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent)', marginTop: '10px' }}>
                                            $ {(v.medio_pago === 'DIVIDIR_PAGOS' ? v.monto_otro : v.total).toLocaleString()}
                                        </p>
                                        {v.medio_pago === 'DIVIDIR_PAGOS' && (
                                            <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>
                                                (Monto total: ${v.total.toLocaleString()} - Solo se factura la parte no-efectivo)
                                            </p>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <button
                                            className="btn-primary"
                                            style={{ padding: '12px', fontSize: '0.8rem', background: 'var(--accent)', fontWeight: 'bold' }}
                                            onClick={() => handleAFIPInvoice(v)}
                                            disabled={generating === v.id || sending === v.id}
                                        >
                                            {generating === v.id ? 'Generando...' : `Emitir ARCA 🏛️ (${resp.name})`}
                                        </button>
                                        <button
                                            className="btn-primary"
                                            style={{ padding: '10px', fontSize: '0.75rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid #0ea5e9', color: '#0ea5e9', fontWeight: 'bold' }}
                                            onClick={() => handleSendToSheet(v)}
                                            disabled={generating === v.id || sending === v.id}
                                        >
                                            {sending === v.id ? 'Enviando...' : 'Mandar a Planilla 🐍'}
                                        </button>
                                        <button
                                            className="btn-secondary"
                                            style={{ padding: '8px 12px', fontSize: '0.75rem', opacity: 0.6 }}
                                            onClick={() => handleMarkDone(v.id)}
                                            disabled={generating === v.id || sending === v.id}
                                        >
                                            Facturado Manual ✅
                                        </button>
                                    </div>
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
