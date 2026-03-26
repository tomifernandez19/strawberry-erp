'use client'
import { useState, useEffect } from 'react'
import { syncProductToTiendanube, getAvailableStockDetailed, fixProveedorPrices, togglePendingOrder, syncImageToTiendanube, getTiendanubeImageStatuses } from '@/lib/actions'
import { useAuth } from '@/lib/context/AuthContext'

export default function InventarioPage() {
    const { isAdmin } = useAuth()
    const [stock, setStock] = useState([])
    const [tnImageIds, setTnImageIds] = useState(new Set())
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(null)
    const [syncingImage, setSyncingImage] = useState(null)
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState('ALL') // ALL, UNSYNCED, NO_LOCATION, LOW_STOCK, PEDIDOS

    useEffect(() => {
        fetchStock()
        fetchTNStatuses()
    }, [])

    async function fetchTNStatuses() {
        const statuses = await getTiendanubeImageStatuses()
        setTnImageIds(new Set(statuses))
    }

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
                    imagen_url: unit.variantes.imagen_url,
                    precio_efectivo: unit.variantes.precio_efectivo,
                    precio_lista: unit.variantes.precio_lista,
                    count: 0,
                    ventas_30_dias: salesLast30[key] || 0,
                    pedido_pendiente: unit.variantes.pedido_pendiente,
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

    const handleTogglePedido = async (variantId, currentStatus) => {
        try {
            await togglePendingOrder(variantId, !currentStatus)
            // Update local state for immediate feedback
            setStock(prev => prev.map(item =>
                item.id === variantId ? { ...item, pedido_pendiente: !currentStatus } : item
            ))
        } catch (e) {
            alert('❌ Error al actualizar estado: ' + e.message)
        }
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

    const handleSyncImage = async (modeloId, imageUrl, variantId) => {
        setSyncingImage(variantId)
        try {
            const result = await syncImageToTiendanube(modeloId, imageUrl)
            if (result.success) {
                alert('✅ ' + result.message)
                setTnImageIds(prev => new Set([...prev, String(modeloId)]))
            } else {
                alert('❌ ' + result.message)
            }
        } catch (e) {
            alert('❌ Error: ' + e.message)
        } finally {
            setSyncingImage(null)
        }
    }

    // Pre-calculate additional flags for items for filtering
    const processedStock = stock.map(item => ({
        ...item,
        isSynced: !!item.modelo?.tiendanube_id,
        hasNoLocation: item.ubicaciones.length === 0,
        isLowStock: item.count <= 3 && item.ventas_30_dias >= 2,
        isOrdered: !!item.pedido_pendiente
    }));

    const filteredStock = processedStock.filter(item => {
        // Text Match
        const matchesText = (item.modelo.descripcion || '').toLowerCase().includes(search.toLowerCase());
        const matchesColor = (item.color || '').toLowerCase().includes(search.toLowerCase());
        if (!matchesText && !matchesColor) return false;

        // Button Filter
        if (filter === 'UNSYNCED') return !item.isSynced;
        if (filter === 'NO_LOCATION') return item.hasNoLocation;
        if (filter === 'LOW_STOCK') return item.isLowStock && !item.isOrdered;
        if (filter === 'PEDIDOS') return item.isOrdered;

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
                    placeholder="🔍 Buscar por modelo o color..."
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
                    <button
                        className={`btn-secondary ${filter === 'PEDIDOS' ? 'active-filter' : ''}`}
                        style={{ padding: '6px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: filter === 'PEDIDOS' ? '#f59e0b' : 'rgba(255,255,255,0.05)', borderColor: filter === 'PEDIDOS' ? '#f59e0b' : 'rgba(255,255,255,0.1)', color: filter === 'PEDIDOS' ? 'white' : 'inherit' }}
                        onClick={() => setFilter('PEDIDOS')}
                    >
                        🛒 Ya Pedidos
                    </button>
                </div>
            </div>

            {loading ? (
                <p className="text-center mt-lg">Cargando stock...</p>
            ) : (
                <section className="grid" style={{ gridTemplateColumns: '1fr' }}>
                    {filteredStock.length === 0 ? (
                        <p className="text-center mt-lg">No se encontraron modelos.</p>
                    ) : (
                        filteredStock.map(item => (
                            <div key={item.id} className="card" style={{
                                border: item.isOrdered ? '2px solid #f59e0b' : '1px solid var(--card-border)',
                                background: item.isOrdered ? 'rgba(245, 158, 11, 0.03)' : 'var(--card-bg)',
                                padding: '15px'
                            }}>
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    {/* Imagen a la izquierda */}
                                    <div style={{ width: '80px', height: '80px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        {item.imagen_url ? (
                                            <img src={item.imagen_url} alt={item.modelo.descripcion} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <span style={{ fontSize: '1.5rem', opacity: 0.2 }}>📷</span>
                                        )}
                                    </div>

                                    {/* Información central */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                                            <h4 style={{ color: item.isOrdered ? '#f59e0b' : 'var(--primary)', margin: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.modelo.descripcion}</h4>
                                            {item.isOrdered && <span style={{ fontSize: '0.65rem', background: '#f59e0b', color: 'black', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>PEDIDO</span>}
                                        </div>
                                        <p style={{ fontSize: '0.85rem', opacity: 0.8, margin: 0 }}>{item.modelo.marca} • {item.color}</p>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                                            {Object.entries(item.talles).sort((a, b) => a[0] - b[0]).map(([t, q]) => (
                                                <span key={t} style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)', padding: '2px 5px', borderRadius: '4px' }}>T{t}: <b>{q}</b></span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Acciones Rápidas */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                                        <p style={{ fontSize: '1rem', fontWeight: 'bold', margin: '0' }}>{item.count} <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>u.</span></p>
                                        <button
                                            className="btn-secondary"
                                            onClick={() => handleTogglePedido(item.id, item.pedido_pendiente)}
                                            style={{
                                                padding: '5px 10px',
                                                fontSize: '0.7rem',
                                                background: item.isOrdered ? '#ef4444' : 'transparent',
                                                borderColor: item.isOrdered ? '#ef4444' : '#f59e0b',
                                                color: item.isOrdered ? 'white' : '#f59e0b',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            {item.isOrdered ? '✕ Quitar' : '🛒 Pedir'}
                                        </button>
                                    </div>
                                </div>

                                {isAdmin && (
                                    <div style={{ marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px', display: 'flex', gap: '10px' }}>
                                        {!item.isSynced ? (
                                            <button
                                                className="btn-secondary"
                                                style={{ flex: 1, fontSize: '0.75rem', padding: '8px' }}
                                                onClick={() => handleSync(item.modelo.id)}
                                                disabled={syncing === item.modelo.id}
                                            >
                                                {syncing === item.modelo.id ? '⏳ Creando...' : '☁️ Publicar en Tiendanube'}
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    className="btn-secondary"
                                                    style={{ flex: 1, fontSize: '0.75rem', padding: '8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: '#10b981' }}
                                                    onClick={() => handleSync(item.modelo.id)}
                                                    disabled={syncing === item.modelo.id}
                                                >
                                                    {syncing === item.modelo.id ? '⏳' : '🔄 Actualizar Nube'}
                                                </button>
                                                {item.imagen_url && !tnImageIds.has(String(item.modelo.tiendanube_id)) && (
                                                    <button
                                                        className="btn-secondary"
                                                        style={{ flex: 1, fontSize: '0.75rem', padding: '8px', borderColor: '#3b82f6', color: '#3b82f6' }}
                                                        onClick={() => handleSyncImage(item.modelo.id, item.imagen_url, item.id)}
                                                        disabled={syncingImage === item.id}
                                                    >
                                                        {syncingImage === item.id ? '⏳' : '📤 Subir Foto'}
                                                    </button>
                                                )}
                                                {item.imagen_url && tnImageIds.has(String(item.modelo.tiendanube_id)) && (
                                                   <span style={{ fontSize: '0.65rem', color: '#10b981', padding: '8px', opacity: 0.8 }}>📸 En Nube</span>
                                                )}
                                            </>
                                        )}
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
