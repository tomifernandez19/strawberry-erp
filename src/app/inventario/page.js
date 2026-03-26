'use client'
import { useState, useEffect } from 'react'
import { 
    syncProductToTiendanube, 
    getAvailableStockDetailed, 
    fixProveedorPrices, 
    togglePendingOrder, 
    syncImageToTiendanube, 
    getTiendanubeImageStatuses,
    uploadProductImage
} from '@/lib/actions'
import { useAuth } from '@/lib/context/AuthContext'

export default function InventarioPage() {
    const { isAdmin } = useAuth()
    const [stock, setStock] = useState([])
    const [tnImageIds, setTnImageIds] = useState(new Set())
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(null)
    const [syncingImage, setSyncingImage] = useState(null)
    const [uploading, setUploading] = useState(null)
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState('ALL') // ALL, UNSYNCED, NO_LOCATION, LOW_STOCK, PEDIDOS
    const [sortBy, setSortBy] = useState('ABC') // ABC, STOCK, SALES

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
        try {
            const response = await getAvailableStockDetailed()
            if (!response) {
                setLoading(false)
                return
            }
            const dataArr = response.stock || (Array.isArray(response) ? response : [])
            const salesLast30 = response.salesVelocity || {}

            const grouped = dataArr.reduce((acc, unit) => {
                if (!unit || !unit.variantes?.id) return acc;
                const key = unit.variantes.id;

                if (!acc[key]) {
                    acc[key] = {
                        id: key,
                        modelo: unit.variantes.modelos || { descripcion: "Sin nombre", marca: "S/M" },
                        color: unit.variantes.color || 'S/D',
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
                const talle = unit.talle_especifico || 'U';
                acc[key].talles[talle] = (acc[key].talles[talle] || 0) + 1;
                if (unit.ubicacion) acc[key].ubicaciones.add(unit.ubicacion);
                return acc;
            }, {});

            setStock(Object.values(grouped).map(item => ({
                ...item,
                ubicaciones: Array.from(item.ubicaciones || []).sort()
            })))
        } catch (err) {
            console.error("Error fetching stock:", err);
        } finally {
            setLoading(false)
        }
    }

    const handleUploadClick = (variantId) => {
        document.getElementById(`file-input-${variantId}`).click();
    }

    const handleFileChange = async (variantId, modeloId, e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(variantId);
        try {
            // Client-side compression with Canvas (same as NuevaCompra)
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = async () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1000;
                    const scaleSize = MAX_WIDTH / img.width;
                    canvas.width = MAX_WIDTH;
                    canvas.height = img.height * scaleSize;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                    
                    const res = await uploadProductImage(variantId, compressedBase64);
                    if (res.success) {
                        // 1. Update local state image
                        setStock(prev => prev.map(item => 
                            item.id === variantId ? { ...item, imagen_url: res.url } : item
                        ));
                        
                        // 2. Allow re-syncing to Tiendanube (reset the TN status locally)
                        setTnImageIds(prev => {
                            const next = new Set(prev);
                            next.delete(String(modeloId));
                            return next;
                        });

                        alert("✅ Foto actualizada en el ERP. Ahora puedes volver a subirla a Tiendanube.");
                    } else {
                        alert("❌ Error al subir: " + res.message);
                    }
                    setUploading(null);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error("Upload error:", err);
            setUploading(null);
        }
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
    const processedStock = stock.map(item => {
        const tnIdStr = String(item.modelo?.tiendanube_id || '');
        const hasPhotoInNube = tnImageIds.has(tnIdStr);
        
        return {
            ...item,
            isSynced: !!item.modelo?.tiendanube_id,
            hasPhotoInNube,
            hasNoLocation: (item.ubicaciones || []).length === 0,
            // Intelligent Low Stock: 1 unit always, or <4 units IF it sells well (velocity > 1)
            isLowStock: (item.count <= 1) || (item.count <= 3 && item.ventas_30_dias >= 1.5),
            isOrdered: !!item.pedido_pendiente
        }
    });

    const filteredAndSortedStock = processedStock
        .filter(item => {
            // Text Match
            const matchesText = (item.modelo?.descripcion || '').toLowerCase().includes(search.toLowerCase());
            const matchesColor = (item.color || '').toLowerCase().includes(search.toLowerCase());
            if (!matchesText && !matchesColor) return false;

            // Button Filter
            if (filter === 'UNSYNCED') return !item.isSynced || !item.hasPhotoInNube;
            if (filter === 'NO_LOCATION') return item.hasNoLocation;
            if (filter === 'LOW_STOCK') return item.isLowStock && !item.isOrdered;
            if (filter === 'PEDIDOS') return item.isOrdered;

            return true;
        })
        .sort((a, b) => {
            if (sortBy === 'STOCK') return b.count - a.count;
            if (sortBy === 'SALES') return b.ventas_30_dias - a.ventas_30_dias;
            // Alphabetical
            return (a.modelo?.descripcion || '').localeCompare(b.modelo?.descripcion || '');
        });

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Inventario</h1>
                <p style={{ opacity: 0.7 }}>Gestión inteligente de productos</p>
            </header>

            <div className="card mt-md" style={{ padding: 'var(--spacing-md)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <input
                        type="text"
                        placeholder="🔍 Buscar..."
                        className="input-field"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ flex: 2, marginBottom: 0 }}
                    />
                    <select 
                        className="input-field" 
                        style={{ flex: 1, marginBottom: 0, paddingRight: '10px' }}
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                    >
                        <option value="ABC">A-Z</option>
                        <option value="STOCK">Mucho Stock</option>
                        <option value="SALES">Ventas 30d</option>
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' }}>
                    <button
                        className={`btn-secondary ${filter === 'ALL' ? 'active-filter' : ''}`}
                        style={{ padding: '8px 15px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: filter === 'ALL' ? 'var(--accent)' : 'rgba(255,255,255,0.05)', borderColor: filter === 'ALL' ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: filter === 'ALL' ? 'white' : 'inherit' }}
                        onClick={() => setFilter('ALL')}
                    >
                        Ver Todos
                    </button>
                    <button
                        className={`btn-secondary ${filter === 'UNSYNCED' ? 'active-filter' : ''}`}
                        style={{ padding: '8px 15px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: filter === 'UNSYNCED' ? '#3b82f6' : 'rgba(255,255,255,0.05)', borderColor: filter === 'UNSYNCED' ? '#3b82f6' : 'rgba(255,255,255,0.1)', color: filter === 'UNSYNCED' ? 'white' : 'inherit' }}
                        onClick={() => setFilter('UNSYNCED')}
                    >
                        ☁️ Sincronizar Nube
                    </button>
                    <button
                        className={`btn-secondary ${filter === 'LOW_STOCK' ? 'active-filter' : ''}`}
                        style={{ padding: '8px 15px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: filter === 'LOW_STOCK' ? '#f59e0b' : 'rgba(255,255,255,0.05)', borderColor: filter === 'LOW_STOCK' ? '#f59e0b' : 'rgba(255,255,255,0.1)', color: filter === 'LOW_STOCK' ? 'white' : 'inherit' }}
                        onClick={() => setFilter('LOW_STOCK')}
                    >
                        📈 Reponer (Smart)
                    </button>
                    <button
                        className={`btn-secondary ${filter === 'PEDIDOS' ? 'active-filter' : ''}`}
                        style={{ padding: '8px 15px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: filter === 'PEDIDOS' ? '#10b981' : 'rgba(255,255,255,0.05)', borderColor: filter === 'PEDIDOS' ? '#10b981' : 'rgba(255,255,255,0.1)', color: filter === 'PEDIDOS' ? 'white' : 'inherit' }}
                        onClick={() => setFilter('PEDIDOS')}
                    >
                        🛒 Ya Pedidos
                    </button>
                    <button
                        className={`btn-secondary ${filter === 'NO_LOCATION' ? 'active-filter' : ''}`}
                        style={{ padding: '8px 15px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: filter === 'NO_LOCATION' ? '#ef4444' : 'rgba(255,255,255,0.05)', borderColor: filter === 'NO_LOCATION' ? '#ef4444' : 'rgba(255,255,255,0.1)', color: filter === 'NO_LOCATION' ? 'white' : 'inherit' }}
                        onClick={() => setFilter('NO_LOCATION')}
                    >
                        ⚠️ Sin Ubicación
                    </button>
                </div>
            </div>

            {loading ? (
                <p className="text-center mt-lg">Cargando stock...</p>
            ) : (
                <section className="grid" style={{ gridTemplateColumns: '1fr' }}>
                    {filteredAndSortedStock.length === 0 ? (
                        <p className="text-center mt-lg">No se encontraron modelos.</p>
                    ) : (
                        filteredAndSortedStock.map(item => (
                            <div key={item.id} className="card" style={{
                                border: item.isOrdered ? '2px solid #10b981' : '1px solid var(--card-border)',
                                background: item.isOrdered ? 'rgba(16, 185, 129, 0.03)' : 'var(--card-bg)',
                                padding: '15px'
                            }}>
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    {/* Imagen a la izquierda con botón de cambio (solo fuera de ALL) */}
                                    <div style={{ position: 'relative', width: '85px', height: '85px', flexShrink: 0, borderRadius: '12px', overflow: 'hidden', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        {item.imagen_url ? (
                                            <img src={item.imagen_url} alt={item.modelo?.descripcion || ""} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploading === item.id ? 0.3 : 1 }} />
                                        ) : (
                                            <span style={{ fontSize: '1.5rem', opacity: 0.2 }}>📷</span>
                                        )}
                                        
                                        {/* Overlay para cambiar foto (Solo en filtros de gestión) */}
                                        {filter !== 'ALL' && (
                                            <div 
                                                onClick={() => handleUploadClick(item.id)}
                                                style={{ 
                                                    position: 'absolute', bottom: 0, left: 0, right: 0, 
                                                    background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '0.6rem', 
                                                    padding: '4px', textAlign: 'center', cursor: 'pointer',
                                                    fontWeight: 'bold', display: uploading === item.id ? 'none' : 'block'
                                                }}
                                            >
                                                {item.imagen_url ? 'CAMBIAR' : 'SUBIR'}
                                            </div>
                                        )}

                                        {uploading === item.id && (
                                            <div style={{ position: 'absolute', fontSize: '0.7rem', color: 'var(--accent)' }}>⏳...</div>
                                        )}

                                        <input 
                                            id={`file-input-${item.id}`}
                                            type="file" 
                                            accept="image/*" 
                                            capture="environment" 
                                            style={{ display: 'none' }} 
                                            onChange={(e) => handleFileChange(item.id, item.modelo?.id, e)} 
                                        />
                                    </div>

                                    {/* Información central */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                                            <h4 style={{ color: item.isOrdered ? '#10b981' : 'var(--primary)', margin: 0, whiteSpace: 'normal', wordBreak: 'break-word', fontSize: '1rem' }}>{item.modelo?.descripcion || 'Sin nombre'}</h4>
                                            {item.isOrdered && <span style={{ fontSize: '0.65rem', background: '#10b981', color: 'black', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>PEDIDO</span>}
                                        </div>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>{item.modelo?.marca || 'S/M'} • {item.color}</p>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                                            {Object.entries(item.talles || {}).sort((a, b) => a[0] - b[0]).map(([t, q]) => (
                                                <span key={t} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>T{t}: <b>{q}</b></span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Estadísticas Rápidas */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', minWidth: '85px' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)', lineHeight: 1 }}>{item.count} <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>u.</span></div>
                                            <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '2px' }}>Ventas 30d: <b>{item.ventas_30_dias}</b></div>
                                        </div>
                                        
                                        {/* Botón de Pedido SOLO en filtros específicos */}
                                        {(filter === 'LOW_STOCK' || filter === 'PEDIDOS') && (
                                            <button
                                                className="btn-secondary"
                                                onClick={() => handleTogglePedido(item.id, item.pedido_pendiente)}
                                                style={{
                                                    padding: '6px 10px',
                                                    fontSize: '0.7rem',
                                                    background: item.isOrdered ? '#ef4444' : 'rgba(16, 185, 129, 0.1)',
                                                    borderColor: item.isOrdered ? '#ef4444' : '#10b981',
                                                    color: item.isOrdered ? 'white' : '#10b981',
                                                    fontWeight: 'bold',
                                                    borderRadius: '8px'
                                                }}
                                            >
                                                {item.isOrdered ? '✕ Quitar' : '🛒 Pedir'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Acciones de Nube SOLO en filtro de Nube */}
                                {isAdmin && filter === 'UNSYNCED' && (
                                    <div style={{ marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px', display: 'flex', gap: '10px' }}>
                                        {!item.isSynced ? (
                                            <button
                                                className="btn-secondary"
                                                style={{ flex: 1, fontSize: '0.75rem', padding: '10px', borderRadius: '10px' }}
                                                onClick={() => handleSync(item.modelo?.id)}
                                                disabled={syncing === item.modelo?.id}
                                            >
                                                {syncing === item.modelo?.id ? '⏳ Creando...' : '☁️ Publicar en Tiendanube'}
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    className="btn-secondary"
                                                    style={{ flex: 1, fontSize: '0.75rem', padding: '10px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.05)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)' }}
                                                    onClick={() => handleSync(item.modelo?.id)}
                                                    disabled={syncing === item.modelo?.id}
                                                >
                                                    {syncing === item.modelo?.id ? '⏳' : '🔄 Actualizar Nube'}
                                                </button>
                                                
                                                {!item.hasPhotoInNube ? (
                                                    <button
                                                        className="btn-secondary"
                                                        style={{ flex: 1, fontSize: '0.75rem', padding: '10px', borderRadius: '10px', borderColor: '#3b82f6', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.05)' }}
                                                        onClick={() => handleSyncImage(item.modelo?.id, item.imagen_url, item.id)}
                                                        disabled={syncingImage === item.id || !item.imagen_url}
                                                    >
                                                        {syncingImage === item.id ? '⏳' : '📤 Subir Foto'}
                                                    </button>
                                                ) : (
                                                   <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.03)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                                                       <span style={{ fontSize: '0.7rem', color: '#10b981', opacity: 0.9 }}>✅ Foto en Nube</span>
                                                   </div>
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
