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
    const [filter, setFilter] = useState('ALL') // ALL, UNSYNCED, NO_LOCATION, LOW_STOCK

    useEffect(() => {
        fetchStock()
    }, [])

    async function fetchStock() {
        setLoading(true)
        const response = await getAvailableStockDetailed()
        const dataArr = response.stock || (Array.isArray(response) ? response : []);
        const salesLast30 = response.salesVelocity || {};

        const grouped = dataArr.reduce((acc, unit) => {
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
                    ventas_30_dias: salesLast30[key] || 0,
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

    // Pre-calculate additional flags for items for filtering
    const processedStock = stock.map(item => ({
        ...item,
        isSynced: !!item.modelo?.tiendanube_id,
        hasNoLocation: item.ubicaciones.length === 0,
        isLowStock: item.count <= 3 && item.ventas_30_dias >= 2 // Adaptive Logic
    }));

    const filteredStock = processedStock.filter(item => {
        // Text Match
        const matchesText = item.modelo.descripcion.toLowerCase().includes(search.toLowerCase());
        if (!matchesText) return false;

        // Button Filter
        if (filter === 'UNSYNCED') return !item.isSynced;
        if (filter === 'NO_LOCATION') return item.hasNoLocation;
        if (filter === 'LOW_STOCK') return item.isLowStock;

        return true;
    });

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Inventario</h1>
                <p style={{ opacity: 0.7 }}>Stock disponible por modelo</p>
            </header>

            <div className="card mt-md" style={{ padding: 'var(--spacing-md)', overflow: 'hidden' }}>
                <input
                    type="text"
                    placeholder="🔍 Buscar por modelo..."
                    className="input-field"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ marginBottom: '15px' }}
                />

                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' }}>
                    <button
                        className={`btn-secondary ${filter === 'ALL' ? 'active-filter' : ''}`}
                        style={{ padding: '6px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: filter === 'ALL' ? 'var(--accent)' : 'rgba(255,255,255,0.05)', borderColor: filter === 'ALL' ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: filter === 'ALL' ? 'white' : 'inherit' }}
                        onClick={() => setFilter('ALL')}
                    >
                        Todos
                    </button>
                    <button
                        className={`btn-secondary ${filter === 'UNSYNCED' ? 'active-filter' : ''}`}
                        style={{ padding: '6px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: filter === 'UNSYNCED' ? '#3b82f6' : 'rgba(255,255,255,0.05)', borderColor: filter === 'UNSYNCED' ? '#3b82f6' : 'rgba(255,255,255,0.1)', color: filter === 'UNSYNCED' ? 'white' : 'inherit' }}
                        onClick={() => setFilter('UNSYNCED')}
                    >
                        ☁️ Faltan en Nube
                    </button>
                    <button
                        className={`btn-secondary ${filter === 'NO_LOCATION' ? 'active-filter' : ''}`}
                        style={{ padding: '6px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: filter === 'NO_LOCATION' ? '#ef4444' : 'rgba(255,255,255,0.05)', borderColor: filter === 'NO_LOCATION' ? '#ef4444' : 'rgba(255,255,255,0.1)', color: filter === 'NO_LOCATION' ? 'white' : 'inherit' }}
                        onClick={() => setFilter('NO_LOCATION')}
                    >
                        ⚠️ Sin Ubicación
                    </button>
                    <button
                        className={`btn-secondary ${filter === 'LOW_STOCK' ? 'active-filter' : ''}`}
                        style={{ padding: '6px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: filter === 'LOW_STOCK' ? '#f59e0b' : 'rgba(255,255,255,0.05)', borderColor: filter === 'LOW_STOCK' ? '#f59e0b' : 'rgba(255,255,255,0.1)', color: filter === 'LOW_STOCK' ? 'white' : 'inherit' }}
                        onClick={() => setFilter('LOW_STOCK')}
                    >
                        📉 Poco Stock
                    </button>
                </div>
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                            <h4 style={{ color: 'var(--primary)', margin: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.modelo.descripcion}</h4>
                                        </div>
                                        <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '2px' }}>{item.modelo.marca} • {item.color}</p>
                                        <p style={{ fontSize: '0.7rem', color: item.ventas_30_dias >= 2 ? '#10b981' : 'rgba(255,255,255,0.4)', marginTop: 0 }}>
                                            {item.ventas_30_dias > 0 ? `🔥 Vendió ${item.ventas_30_dias} últ. 30 días` : `❄️ Sin ventas últ. 30 días`}
                                        </p>

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
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
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

                                {isAdmin && filter !== 'LOW_STOCK' && !item.isSynced && (
                                    <div style={{ marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px' }}>
                                        <button
                                            className="btn-secondary"
                                            style={{ width: '100%', fontSize: '0.75rem', padding: '8px' }}
                                            onClick={() => handleSync(item.modelo.id)}
                                            disabled={syncing === item.modelo.id}
                                        >
                                            {syncing === item.modelo.id ? '⏳ Creando publicación...' : '☁️ Publicar en Tiendanube'}
                                        </button>
                                    </div>
                                )}
                                {isAdmin && filter !== 'LOW_STOCK' && item.isSynced && (
                                    <div style={{ marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px', textAlign: 'center' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '20px' }}>
                                            ✅ Sincronizado en Tiendanube
                                        </span>
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
