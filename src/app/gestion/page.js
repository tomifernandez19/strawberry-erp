'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { deleteSale, deleteUnit, updateVariant, registerTiendanubeWebhooks } from '@/lib/actions'

export default function GestionPage() {
    const [tab, setTab] = useState('ventas') // 'ventas' or 'stock'
    const [ventas, setVentas] = useState([])
    const [stock, setStock] = useState([])
    const [loading, setLoading] = useState(false)
    const [editingVariant, setEditingVariant] = useState(null)
    const [activatingTN, setActivatingTN] = useState(false)

    useEffect(() => {
        if (tab === 'ventas') fetchVentas()
        else fetchStock()
    }, [tab])

    async function fetchVentas() {
        setLoading(true)
        const { data } = await supabase
            .from('unidades')
            .select(`
                id, fecha_venta, estado,
                ventas (id, total, medio_pago),
                variantes (color, modelos (descripcion))
            `)
            .in('estado', ['VENDIDO', 'VENDIDO_ONLINE'])
            .order('fecha_venta', { ascending: false })
            .limit(20)
        setVentas(data || [])
        setLoading(false)
    }

    async function fetchStock() {
        setLoading(true)
        const { data } = await supabase
            .from('unidades')
            .select(`
                id, codigo_qr, talle_especifico,
                variantes (*, modelos (descripcion))
            `)
            .eq('estado', 'DISPONIBLE')
            .order('id', { ascending: false })
            .limit(20)
        setStock(data || [])
        setLoading(false)
    }

    const handleDeleteSale = async (saleId) => {
        if (!confirm('¿Seguro quieres anular esta venta? El producto volverá a estar disponible.')) return
        try {
            await deleteSale(saleId)
            fetchVentas()
        } catch (err) {
            alert(err.message)
        }
    }

    const handleDeleteUnit = async (unitId) => {
        if (!confirm('¿Seguro quieres eliminar este par del stock?')) return
        try {
            await deleteUnit(unitId)
            fetchStock()
        } catch (err) {
            alert(err.message)
        }
    }

    const handleUpdatePrice = async (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        const newLista = parseFloat(formData.get('lista'))

        // Auto-calculate cash price for consistency (100/121) rounded up to 1000
        const newEfectivo = Math.ceil((newLista * (100 / 121)) / 1000) * 1000;

        const updates = {
            precio_efectivo: newEfectivo,
            precio_lista: newLista
        }
        try {
            await updateVariant(editingVariant.id, updates)
            setEditingVariant(null)
            fetchStock()
        } catch (err) {
            alert(err.message)
        }
    }

    const handleActivateTN = async () => {
        if (!confirm('¿Activar conexión automática con Tiendanube?')) return
        setActivatingTN(true)
        try {
            const ok = await registerTiendanubeWebhooks()
            if (ok) {
                alert('✅ ¡Conexión activada con éxito! Tiendanube ahora enviará los pedidos automáticamente.')
            } else {
                alert('❌ Error al activar. Verifique las credenciales en Vercel.')
            }
        } catch (err) {
            alert('❌ Error: ' + err.message)
        } finally {
            setActivatingTN(false)
        }
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Gestión y Ajustes</h1>
                <p style={{ opacity: 0.7 }}>Corregir errores de ventas o stock</p>
            </header>

            <nav style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                    className={tab === 'ventas' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setTab('ventas')}
                    style={{ flex: 1 }}
                >
                    Ventas Recientes
                </button>
                <button
                    className={tab === 'stock' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setTab('stock')}
                    style={{ flex: 1 }}
                >
                    Stock Reciente
                </button>
            </nav>

            <section className="mt-lg">
                {loading ? (
                    <p className="text-center">Cargando...</p>
                ) : tab === 'ventas' ? (
                    <div className="grid" style={{ gap: '15px' }}>
                        {ventas.map(v => (
                            <div key={v.id} className="card" style={{ padding: '15px', borderLeft: v.estado === 'VENDIDO_ONLINE' ? '4px solid #eab308' : 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ margin: 0 }}>{v.variantes?.modelos?.descripcion || 'Sin descripción'}</h4>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                            {new Date(v.fecha_venta).toLocaleString()} • {v.estado === 'VENDIDO_ONLINE' ? 'TIENDANUBE' : (v.ventas?.medio_pago || 'S/D')}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                                            <p style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                                                $ {(v.ventas?.total || 0).toLocaleString()}
                                            </p>
                                            {v.estado === 'VENDIDO_ONLINE' && <span className="badge" style={{ fontSize: '0.6rem', padding: '2px 6px', background: '#eab308', color: 'black' }}>ONLINE</span>}
                                        </div>
                                    </div>
                                    {v.ventas && (
                                        <button
                                            onClick={() => handleDeleteSale(v.ventas.id)}
                                            style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
                                        >
                                            Anular
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid" style={{ gap: '15px' }}>
                        {stock.map(u => (
                            <div key={u.id} className="card" style={{ padding: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h4 style={{ margin: 0 }}>{u.variantes?.modelos?.descripcion}</h4>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                            QR: {u.codigo_qr} • Talle: {u.talle_especifico} • {u.variantes?.color}
                                        </p>
                                        <p style={{ fontSize: '0.8rem', marginTop: '5px' }}>
                                            Ef: ${u.variantes?.precio_efectivo} | List: ${u.variantes?.precio_lista}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => setEditingVariant(u.variantes)}
                                            style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                                        >
                                            Precio
                                        </button>
                                        <button
                                            onClick={() => handleDeleteUnit(u.id)}
                                            style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="mt-xl card" style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <h3>Configuración Avanzada</h3>
                <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '20px' }}>Ajustes del sistema y conexiones externas.</p>
                <button
                    onClick={handleActivateTN}
                    disabled={activatingTN}
                    className="btn-primary"
                    style={{ background: '#059669', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
                >
                    <span>{activatingTN ? '⏳ Conectando...' : '🔌 Activar Conexión Tiendanube'}</span>
                </button>
            </section>

            {editingVariant && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '20px'
                }}>
                    <form onSubmit={handleUpdatePrice} className="card" style={{ width: '100%', maxWidth: '400px' }}>
                        <h3>Editar Precios</h3>
                        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '15px' }}>{editingVariant.modelos?.descripcion} - {editingVariant.color}</p>

                        <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>PRECIO LISTA (BASE):</label>
                        <input name="lista" type="number" step="1" className="input-field" defaultValue={editingVariant.precio_lista} autoFocus />

                        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                            <div className="card" style={{ padding: '10px', background: 'rgba(255,255,255,0.02)' }}>
                                <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>Efectivo (Automá.)</p>
                                <p style={{ fontSize: '0.9rem' }}>$ {Math.ceil((editingVariant.precio_lista * (100 / 121)) / 1000) * 1000}</p>
                            </div>
                            <div className="card" style={{ padding: '10px', background: 'rgba(255,255,255,0.02)' }}>
                                <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>Transf. (Automá.)</p>
                                <p style={{ fontSize: '0.9rem' }}>$ {Math.round(editingVariant.precio_lista * (100 / 110)).toLocaleString()}</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button type="button" onClick={() => setEditingVariant(null)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                            <button type="submit" className="btn-primary" style={{ flex: 1 }}>Actualizar Todo</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
