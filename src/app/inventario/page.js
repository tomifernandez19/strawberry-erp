'use client'
import { useState, useEffect } from 'react'
import { syncProductToTiendanube, getAvailableStockDetailed, fixProveedorPrices } from '@/lib/actions'
import { useAuth } from '@/lib/context/AuthContext'

export default function InventarioPage() {
    const { isAdmin } = useAuth()
    const [stock, setStock] = useState([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(null)
    const [search, setSearch] = useState('')
    const [fixing, setFixing] = useState(false)

    useEffect(() => {
        fetchStock()
    }, [])

    async function fetchStock() {
        setLoading(true)
        const data = await getAvailableStockDetailed()

        const grouped = data.reduce((acc, unit) => {
            const key = unit.variantes?.id;
            if (!key) return acc;

            if (!acc[key]) {
                acc[key] = {
                    id: key,
                    modelo: unit.variantes.modelos,
                    color: unit.variantes.color,
                    precio_efectivo: unit.variantes.precio_efectivo,
                    precio_lista: unit.variantes.precio_lista,
                    count: 0,
                    talles: {},
                    ubicaciones: new Set()
                }
            }
            acc[key].count++;
            const talle = unit.talle_especifico;
            acc[key].talles[talle] = (acc[key].talles[talle] || 0) + 1;
            if (unit.ubicacion) acc[key].ubicaciones.add(unit.ubicacion);
            return acc;
        }, {});

        setStock(Object.values(grouped).map(item => ({
            ...item,
            ubicaciones: Array.from(item.ubicaciones).sort()
        })))
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

    const handleFixPrices = async () => {
        if (!confirm('¿Estás seguro de recalcular los precios de lista de todos los productos de "Proveedor"? (Redondeo a mil con salto en 100)')) return
        setFixing(true);
        try {
            const result = await fixProveedorPrices();
            if (result.success) {
                alert(`✅ Se actualizaron ${result.updated} variantes.`);
                fetchStock();
            } else {
                alert('❌ Error: ' + result.message);
            }
        } catch (e) {
            alert('❌ Error: ' + e.message);
        } finally {
            setFixing(false);
        }
    }

    const filteredStock = stock.filter(item =>
        item.modelo.descripcion.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Inventario</h1>
                <p style={{ opacity: 0.7 }}>Stock disponible por modelo</p>
                {isAdmin && (
                    <button
                        className="btn-secondary mt-md"
                        style={{ fontSize: '0.7rem', padding: '6px 12px' }}
                        onClick={handleFixPrices}
                        disabled={fixing}
                    >
                        {fixing ? '⌛ Recalculando...' : '⚙️ Recalcular Precios Listas (Proveedor)'}
                    </button>
                )}
            </header>

            <div className="card" style={{ padding: 'var(--spacing-md)' }}>
                <input
                    type="text"
                    placeholder="🔍 Buscar por modelo..."
                    className="input-field"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ marginBottom: 0 }}
                />
            </div>

            {loading ? (
                <p className="text-center mt-lg">Cargando stock...</p>
            ) : (
                <section className="grid">
                    {filteredStock.length === 0 ? (
                        <p className="text-center mt-lg">No se encontraron modelos.</p>
                    ) : (
                        filteredStock.map(item => (
                            <div key={item.id} className="card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
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

                                        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '8px' }}>
                                            <p style={{ fontSize: '0.65rem', opacity: 0.5 }}>Ubicación:</p>
                                            <p style={{ fontSize: '0.85rem', fontWeight: 'bold', color: item.ubicaciones.length > 0 ? 'var(--accent)' : '#ef4444' }}>
                                                {item.ubicaciones.length > 0 ? item.ubicaciones.join(', ') : '⚠️ No asignada'}
                                            </p>
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

                                {isAdmin && (
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
                                )}
                            </div>
                        ))
                    )}
                </section>
            )}
        </div>
    )
}
