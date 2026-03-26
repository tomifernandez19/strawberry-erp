'use client'
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
                    modelo: unit.variantes.modelos || { descripcion: "Sin nombre", marca: "S/M" },
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
    const processedStock = stock.map(item => ({
        ...item,
        isSynced: !!item.modelo?.tiendanube_id,
        hasNoLocation: (item.ubicaciones || []).length === 0,
        isLowStock: item.count <= 3 && item.ventas_30_dias >= 2,
        isOrdered: !!item.pedido_pendiente
    }));

    const filteredStock = processedStock.filter(item => {
        // Text Match
        const matchesText = (item.modelo?.descripcion || '').toLowerCase().includes(search.toLowerCase());
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
                                    {/* Imagen a la izquierda con botón de cambio */}
                                    <div style={{ position: 'relative', width: '85px', height: '85px', flexShrink: 0, borderRadius: '12px', overflow: 'hidden', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        {item.imagen_url ? (
                                            <img src={item.imagen_url} alt={item.modelo?.descripcion || ""} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploading === item.id ? 0.3 : 1 }} />
                                        ) : (
                                            <span style={{ fontSize: '1.5rem', opacity: 0.2 }}>📷</span>
                                        )}
                                        
                                        {/* Overlay para cambiar foto */}
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

                                        {uploading === item.id && (
                                            <div style={{ position: 'absolute', fontSize: '0.7rem', color: 'var(--accent)' }}>⏳...</div>
                                        )}

                                        <input 
                                            id={`file-input-${item.id}`}
                                            type="file" 
                                            accept="image/*" 
                                            capture="environment" 
                                            style={{ display: 'none' }} 
                                            onChange={(e) => handleFileChange(item.id, item.modelo.id, e)} 
                                        />
                                    </div>

                                    {/* Información central */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                                            <h4 style={{ color: item.isOrdered ? '#f59e0b' : 'var(--primary)', margin: 0, whiteSpace: 'normal', wordBreak: 'break-word', fontSize: '1rem' }}>{item.modelo?.descripcion || 'Sin nombre'}</h4>
                                            {item.isOrdered && <span style={{ fontSize: '0.65rem', background: '#f59e0b', color: 'black', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>PEDIDO</span>}
                                        </div>
                                        <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>{item.modelo?.marca || 'S/M'} • {item.color}</p>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                                            {Object.entries(item.talles).sort((a, b) => a[0] - b[0]).map(([t, q]) => (
                                                <span key={t} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>T{t}: <b>{q}</b></span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Acciones Rápidas */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', minWidth: '80px' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{item.count}</span>
                                            <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: '4px' }}>u.</span>
                                        </div>
                                        <button
                                            className="btn-secondary"
                                            onClick={() => handleTogglePedido(item.id, item.pedido_pendiente)}
                                            style={{
                                                padding: '6px 10px',
                                                fontSize: '0.7rem',
                                                background: item.isOrdered ? '#ef4444' : 'rgba(255,255,255,0.05)',
                                                borderColor: item.isOrdered ? '#ef4444' : 'rgba(255,255,255,0.1)',
                                                color: item.isOrdered ? 'white' : 'inherit',
                                                fontWeight: 'bold',
                                                borderRadius: '8px'
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
                                                style={{ flex: 1, fontSize: '0.75rem', padding: '10px', borderRadius: '10px' }}
                                                onClick={() => handleSync(item.modelo.id)}
                                                disabled={syncing === item.modelo.id}
                                            >
                                                {syncing === item.modelo.id ? '⏳ Creando...' : '☁️ Publicar en Tiendanube'}
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    className="btn-secondary"
                                                    style={{ flex: 1, fontSize: '0.75rem', padding: '10px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.05)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)' }}
                                                    onClick={() => handleSync(item.modelo.id)}
                                                    disabled={syncing === item.modelo.id}
                                                >
                                                    {syncing === item.modelo.id ? '⏳' : '🔄 Actualizar Nube'}
                                                </button>
                                                
                                                {!tnImageIds.has(String(item.modelo.tiendanube_id)) ? (
                                                    <button
                                                        className="btn-secondary"
                                                        style={{ flex: 1, fontSize: '0.75rem', padding: '10px', borderRadius: '10px', borderColor: '#3b82f6', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.05)' }}
                                                        onClick={() => handleSyncImage(item.modelo.id, item.imagen_url, item.id)}
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
