'use client'
import { useState, useEffect } from 'react'
import { getPendingDispatches, completeDispatch, getUnitForSale } from '@/lib/actions'
import QRScanner from '@/components/QRScanner'
import { useRouter } from 'next/navigation'

export default function DespacharPage() {
    const router = useRouter()
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedOrder, setSelectedOrder] = useState(null)
    const [scanning, setScanning] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        loadOrders()
    }, [])

    async function loadOrders() {
        setLoading(true)
        const data = await getPendingDispatches()
        setOrders(data)
        setLoading(false)
    }

    const handleScanComplete = async (qrCode) => {
        setScanning(false)
        setError('')
        try {
            // 1. Show preview of unit scanned (Include Reserved ones!)
            const result = await getUnitForSale(qrCode, true)

            if (!result.success) {
                setError(result.message)
                return
            }

            const unit = result.data
            const modelName = unit.variantes?.modelos?.descripcion || 'Modelo desconocido'
            const color = unit.variantes?.color || 'Color desconocido'
            const size = unit.talle_especifico || '?'
            const listPrice = unit.variantes?.precio_lista || 0

            // 2. Confirm if user wants to use THIS unit for THIS order
            const confirmMsg = `¿Desea despachar el pedido #${selectedOrder.nro_pedido} con el producto ${modelName} (${color} Talle ${size})?`

            if (confirm(confirmMsg)) {
                // 3. Optional: Ask for Price
                let finalPrice = listPrice
                const priceInput = prompt(`Confirmar precio de venta (Precio de lista: $${listPrice}):`, listPrice)

                if (priceInput !== null) {
                    finalPrice = parseFloat(priceInput) || listPrice
                } else {
                    return // Cancel dispatch if prompt cancelled
                }

                const completeResult = await completeDispatch(selectedOrder.id, qrCode, finalPrice)

                if (completeResult.success) {
                    alert('✅ Pedido despachado con éxito')
                    setSelectedOrder(null)
                    loadOrders()
                } else {
                    setError(completeResult.message || 'Error desconocido al procesar el despacho.')
                }
            }
        } catch (err) {
            console.error(err)
            setError(err.message || 'Error inesperado durante el despacho.')
        }
    }

    if (loading) return <div className="text-center mt-xl">Cargando pedidos...</div>

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Despachos Online</h1>
                <p style={{ opacity: 0.7 }}>Control de salidas Tiendanube</p>
            </header>

            {error && <div className="card text-center" style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>{error}</div>}

            {selectedOrder ? (
                <div className="grid">
                    <section className="card" style={{ border: '2px solid var(--accent)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Pedido #{selectedOrder.nro_pedido}</h3>
                            <button className="btn-secondary" onClick={() => setSelectedOrder(null)} style={{ padding: '4px 12px' }}>Volver</button>
                        </div>
                        <p style={{ opacity: 0.7, fontSize: '0.9rem', marginTop: '5px' }}>Cliente: {selectedOrder.cliente_nombre}</p>

                        <div className="mt-lg">
                            <h4 style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '10px' }}>PRODUCTOS SOLICITADOS:</h4>
                            {selectedOrder.items_raw.map((item, i) => (
                                <div key={i} className="card mt-xs" style={{ padding: '10px', backgroundColor: 'var(--secondary)' }}>
                                    <p style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{item.name}</p>
                                    <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>{item.variant_values.join(' • ')}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-xl text-center">
                            <p style={{ marginBottom: '15px', fontSize: '0.9rem' }}>Para completar el despacho, escanee el QR del par que va a enviar:</p>
                            {!scanning ? (
                                <button className="btn-primary btn-large" onClick={() => setScanning(true)}>📷 Escanear QR del Par</button>
                            ) : (
                                <div className="card">
                                    <QRScanner onScanSuccess={handleScanComplete} label="Escaneando para despacho..." />
                                    <button className="btn-secondary mt-md" onClick={() => setScanning(false)}>Cancelar Escaneo</button>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            ) : (
                <div className="grid mt-md">
                    {orders.length === 0 ? (
                        <div className="card text-center" style={{ padding: '40px', opacity: 0.5 }}>
                            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🎉</div>
                            <p>¡No hay despachos pendientes!</p>
                        </div>
                    ) : (
                        orders.map(order => (
                            <div key={order.id} className="card" style={{ padding: '20px', position: 'relative', borderLeft: order.unidad_reservada_id ? '5px solid #4ade80' : '5px solid #eab308' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Pedido #{order.nro_pedido}</h3>
                                            {order.unidad_reservada_id && (
                                                <span style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', borderRadius: '4px', border: '1px solid rgba(74, 222, 128, 0.2)', fontWeight: 'bold' }}>
                                                    ✅ STOCK RESERVADO
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: '4px' }}>👤 {order.cliente_nombre}</p>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                                            <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>📅 {new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                            {order.medio_pago && (
                                                <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold', opacity: 0.8 }}>💰 {order.medio_pago}</span>
                                            )}
                                        </div>
                                    </div>
                                    <button className="btn-primary" style={{ padding: '10px 20px' }} onClick={() => setSelectedOrder(order)}>Despachar</button>
                                </div>
                                <div style={{ marginTop: '15px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {order.items_raw.map((item, i) => {
                                        const cleanName = item.name.split('(')[0].trim();
                                        return (
                                            <div key={i} style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '4px'
                                            }}>
                                                <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{cleanName}</span>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    {item.variant_values.map((val, j) => (
                                                        <span key={j} style={{ fontSize: '0.7rem', opacity: 0.7, background: 'var(--secondary)', padding: '2px 6px', borderRadius: '4px' }}>
                                                            {val}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
