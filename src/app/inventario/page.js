'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { syncProductToTiendanube } from '@/lib/actions'

export default function InventarioPage() {
    const [stock, setStock] = useState([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(null)

    useEffect(() => {
        fetchStock()
    }, [])

    async function fetchStock() {
        const { data, error } = await supabase
            .from('unidades')
            .select(`
                id, talle_especifico,
                variantes (id, color, precio_efectivo, precio_lista, modelos (id, descripcion, marca)),
                compras (propietario)
            `)
            .eq('estado', 'DISPONIBLE')

        if (error) {
            console.error(error)
        } else {
            const grouped = data.reduce((acc, unit) => {
                const key = `${unit.variantes.id}-${unit.compras?.propietario || 'Propia'}`;
                if (!acc[key]) {
                    acc[key] = {
                        id: key,
                        modelo: unit.variantes.modelos,
                        color: unit.variantes.color,
                        precio_efectivo: unit.variantes.precio_efectivo,
                        precio_lista: unit.variantes.precio_lista,
                        propietario: unit.compras?.propietario || 'Propia',
                        count: 0,
                        talles: {}
                    }
                }
                acc[key].count++;
                const talle = unit.talle_especifico;
                acc[key].talles[talle] = (acc[key].talles[talle] || 0) + 1;
                return acc;
            }, {});
            setStock(Object.values(grouped))
        }
        setLoading(false)
    }

    const handleSync = async (modeloId) => {
        setSyncing(modeloId)
        try {
            const result = await syncProductToTiendanube(modeloId)
            if (result.success) {
                alert('✅ ' + result.message)
            } else {
                alert('❌ ' + result.message + (result.details ? '\n\nDetalles: ' + result.details : ''))
            }
        } catch (e) {
            alert('❌ Error inesperado: ' + e.message)
        } finally {
            setSyncing(null)
        }
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Inventario</h1>
                <p style={{ opacity: 0.7 }}>Stock disponible por modelo y dueño</p>
            </header>

            {loading ? (
                <p className="text-center mt-lg">Cargando stock...</p>
            ) : (
                <section className="grid">
                    {stock.length === 0 ? (
                        <p className="text-center mt-lg">No hay stock disponible.</p>
                    ) : (
                        stock.map(item => (
                            <div key={item.id} className="card" style={{ borderLeft: `5px solid ${item.propietario === 'Carolina' ? '#8b5cf6' : '#ec4899'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                            <span className="badge" style={{ fontSize: '0.6rem', backgroundColor: item.propietario === 'Carolina' ? '#8b5cf6' : '#ec4899' }}>
                                                {item.propietario}
                                            </span>
                                            <h4 style={{ color: 'var(--primary)', margin: 0 }}>{item.modelo.descripcion}</h4>
                                        </div>
                                        <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>{item.modelo.marca} • {item.color}</p>

                                        <div style={{ marginTop: '10px' }}>
                                            <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>Talles disponibles:</p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '4px' }}>
                                                {Object.entries(item.talles).sort((a, b) => a[0] - b[0]).map(([t, q]) => (
                                                    <span key={t} style={{ fontSize: '0.8rem', background: 'var(--secondary)', padding: '2px 6px', borderRadius: '4px' }}>
                                                        T{t}: <strong>{q}</strong>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{
                                            fontSize: '1.2rem',
                                            fontWeight: 'bold',
                                            background: 'rgba(59, 130, 246, 0.1)',
                                            padding: '8px 12px',
                                            borderRadius: '12px',
                                            color: 'var(--primary)',
                                            border: '1px solid rgba(59, 130, 246, 0.3)'
                                        }}>
                                            {item.count}u.
                                        </div>
                                        <div style={{ marginTop: '10px', fontSize: '0.8rem', textAlign: 'right' }}>
                                            <p style={{ color: 'var(--accent)' }}>Ef: ${item.precio_efectivo?.toLocaleString()}</p>
                                            <p style={{ opacity: 0.6 }}>Li: ${item.precio_lista?.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px' }}>
                                    <button
                                        className="btn-secondary"
                                        style={{ width: '100%', fontSize: '0.75rem', padding: '8px' }}
                                        onClick={() => handleSync(item.modelo.id)}
                                        disabled={syncing === item.modelo.id}
                                    >
                                        {syncing === item.modelo.id ? '⏳ Sincronizando...' : '🔄 Sincronizar con Tiendanube'}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </section>
            )}
        </div>
    )
}
