'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { deleteSale, deleteUnit, updateVariant } from '@/lib/actions'

export default function GestionPage() {
    const [tab, setTab] = useState('ventas') // 'ventas' or 'stock'
    const [ventas, setVentas] = useState([])
    const [stock, setStock] = useState([])
    const [loading, setLoading] = useState(false)
    const [editingVariant, setEditingVariant] = useState(null)

    useEffect(() => {
        if (tab === 'ventas') fetchVentas()
        else fetchStock()
    }, [tab])

    async function fetchVentas() {
        setLoading(true)
        const { data } = await supabase
            .from('unidades')
            .select(`
                id, fecha_venta,
                ventas (id, total, medio_pago),
                variantes (color, modelos (descripcion))
            `)
            .eq('estado', 'VENDIDO')
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
        const updates = {
            precio_efectivo: parseFloat(formData.get('efectivo')),
            precio_lista: parseFloat(formData.get('lista'))
        }
        try {
            await updateVariant(editingVariant.id, updates)
            setEditingVariant(null)
            fetchStock()
        } catch (err) {
            alert(err.message)
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
                            <div key={v.id} className="card" style={{ padding: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h4 style={{ margin: 0 }}>{v.variantes.modelos.descripcion}</h4>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                            {new Date(v.fecha_venta).toLocaleString()} • {v.ventas.medio_pago}
                                        </p>
                                        <p style={{ color: 'var(--accent)', fontWeight: 'bold', marginTop: '5px' }}>
                                            $ {v.ventas.total.toLocaleString()}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteSale(v.ventas.id)}
                                        style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                                    >
                                        Anular
                                    </button>
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
                                        <h4 style={{ margin: 0 }}>{u.variantes.modelos.descripcion}</h4>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                            QR: {u.codigo_qr} • Talle: {u.talle_especifico} • {u.variantes.color}
                                        </p>
                                        <p style={{ fontSize: '0.8rem', marginTop: '5px' }}>
                                            Ef: ${u.variantes.precio_efectivo} | List: ${u.variantes.precio_lista}
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

            {editingVariant && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '20px'
                }}>
                    <form onSubmit={handleUpdatePrice} className="card" style={{ width: '100%', maxWidth: '400px' }}>
                        <h3>Editar Precios</h3>
                        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '15px' }}>{editingVariant.modelos.descripcion} - {editingVariant.color}</p>

                        <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Efec / Transf:</label>
                        <input name="efectivo" type="number" step="0.01" className="input-field" defaultValue={editingVariant.precio_efectivo} />

                        <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Lista / Tarjeta:</label>
                        <input name="lista" type="number" step="0.01" className="input-field" defaultValue={editingVariant.precio_lista} />

                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button type="button" onClick={() => setEditingVariant(null)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                            <button type="submit" className="btn-primary" style={{ flex: 1 }}>Guardar</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
