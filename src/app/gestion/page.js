'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { deleteSale, deleteUnit, updateVariant, registerTiendanubeWebhooks, getPendingInvoicesSummary, getMissingImagesList, uploadProductImage, getRecentSalesList } from '@/lib/actions'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'

export default function GestionPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const initialTab = searchParams.get('tab') || 'ventas'

    const [tab, setTab] = useState(initialTab)
    const [ventas, setVentas] = useState([])
    const [stock, setStock] = useState([])
    const [missingImages, setMissingImages] = useState([])
    const [loading, setLoading] = useState(false)
    const [editingVariant, setEditingVariant] = useState(null)
    const [editPrices, setEditPrices] = useState({ lista: 0, efectivo: 0 })
    const [activatingTN, setActivatingTN] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    // Task counters
    const [pendingQR, setPendingQR] = useState(0)
    const [pendingDispatches, setPendingDispatches] = useState(0)
    const [pendingLocation, setPendingLocation] = useState(0)
    const [pendingImages, setPendingImages] = useState(0)
    const [invoiceCounts, setInvoiceCounts] = useState({ sofi: 0, tomi: 0, lucas: 0, total: 0 })

    useEffect(() => {
        const handler = setTimeout(() => {
            if (tab === 'ventas') fetchVentas(searchQuery)
            else if (tab === 'stock') fetchStock(searchQuery)
            else if (tab === 'imagenes') fetchMissingImages(searchQuery)
        }, 400);

        return () => clearTimeout(handler);
    }, [tab, searchQuery])

    useEffect(() => {
        fetchCounters()
    }, [tab])

    async function fetchCounters() {
        // Units without QR
        const { count: qrCount } = await supabase
            .from('unidades')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'PENDIENTE_QR')
        setPendingQR(qrCount || 0)

        // Pending Online Dispatches
        const { count: dispatchCount } = await supabase
            .from('pedidos_online')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'PENDIENTE_DESPACHO')
        setPendingDispatches(dispatchCount || 0)

        // Units with QR but without Location
        const { count: locCount } = await supabase
            .from('unidades')
            .select('*', { count: 'exact', head: true })
            .not('codigo_qr', 'is', null)
            .is('ubicacion', null)
            .eq('estado', 'DISPONIBLE')
        setPendingLocation(locCount || 0)

        // Invoices
        const res = await getPendingInvoicesSummary()
        if (res.success) setInvoiceCounts(res.count)

        // Missing images
        const { count: imgCount } = await supabase
            .from('variantes')
            .select('*', { count: 'exact', head: true })
            .is('imagen_url', null)
        setPendingImages(imgCount || 0)
    }

    async function fetchVentas(search = '') {
        setLoading(true)
        try {
            const data = await getRecentSalesList(search)
            setVentas(data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    async function fetchStock(search = '') {
        setLoading(true)
        try {
            let variantData = []

            if (search) {
                // Stage 1: Search models by name
                const { data: matchedModels } = await supabase
                    .from('modelos')
                    .select('id')
                    .ilike('descripcion', `%${search}%`)

                const modelIds = matchedModels?.map(m => m.id) || []

                // Stage 2: Search variants that match model_id OR color
                let vQuery = supabase
                    .from('variantes')
                    .select('id, color, precio_lista, precio_efectivo, imagen_url, modelos (descripcion)')

                if (modelIds.length > 0) {
                    vQuery = vQuery.or(`color.ilike.%${search}%,modelo_id.in.(${modelIds.map(id => `"${id}"`).join(',')})`)
                } else {
                    vQuery = vQuery.ilike('color', `%${search}%`)
                }

                const { data: vData, error: vError } = await vQuery.limit(200)
                if (vError) throw vError
                variantData = vData || []
            } else {
                // Default: Just show recent variants with stock
                const { data: vData, error: vError } = await supabase
                    .from('variantes')
                    .select('id, color, precio_lista, precio_efectivo, imagen_url, modelos (descripcion)')
                    .order('created_at', { ascending: false })
                    .limit(100)
                if (vError) throw vError
                variantData = vData || []
            }

            if (variantData.length === 0) {
                setStock([])
                setLoading(false)
                return
            }

            // Stage 3: Get available units for these variants
            const variantIds = variantData.map(v => v.id)
            const { data: unitData, error: unitError } = await supabase
                .from('unidades')
                .select('id, talle_especifico, codigo_qr, variante_id')
                .eq('estado', 'DISPONIBLE')
                .in('variante_id', variantIds)

            if (unitError) throw unitError

            // Combine and filter those that actually have stock (or show all if searching?)
            // For editing prices, showing variants even without stock could be useful, 
            // but the user asked for "precio/stock" and expected to see stock.
            const results = variantData.map(v => {
                const units = (unitData || []).filter(u => u.variante_id === v.id)
                    .sort((a, b) => a.talle_especifico.localeCompare(b.talle_especifico, undefined, { numeric: true }))
                return { ...v, available_units: units }
            }).filter(v => search ? true : v.available_units.length > 0) // If searching, show even if 0 stock so they can edit price

            setStock(results)
        } catch (err) {
            console.error("Error fetching stock:", err)
        } finally {
            setLoading(false)
        }
    }

    async function fetchMissingImages() {
        setLoading(true)
        const res = await getMissingImagesList()
        if (res.success) setMissingImages(res.data)
        setLoading(false)
    }

    const handleImageUpload = async (variantId, e) => {
        const file = e.target.files[0]
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            setLoading(true)
            const res = await uploadProductImage(variantId, reader.result)
            if (res.success) {
                fetchMissingImages()
                fetchCounters()
            } else {
                alert(res.message)
            }
            setLoading(false)
        }
        reader.readAsDataURL(file);
    }

    const handleDeleteSale = async (saleId) => {
        if (!confirm('¿Seguro quieres anular esta venta? El producto volverá a estar disponible.')) return
        setLoading(true)
        try {
            const res = await deleteSale(saleId)
            if (res.success) {
                fetchVentas(searchQuery)
                fetchCounters()
            } else {
                alert(res.message)
            }
        } catch (err) {
            alert("Error de conexión: " + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteUnit = async (unitId) => {
        if (!confirm('¿Seguro quieres eliminar este par del stock?')) return
        try {
            const res = await deleteUnit(unitId)
            if (res.success) {
                fetchStock(searchQuery)
            } else {
                alert(res.message)
            }
        } catch (err) {
            alert("Error de conexión: " + err.message)
        }
    }

    const handleUpdatePrice = async (e) => {
        e.preventDefault()
        const updates = {
            precio_efectivo: parseFloat(editPrices.efectivo),
            precio_lista: parseFloat(editPrices.lista)
        }
        try {
            const res = await updateVariant(editingVariant.id, updates)
            if (res.success) {
                setEditingVariant(null)
                fetchStock(searchQuery)
            } else {
                alert(res.message)
            }
        } catch (err) {
            alert("Error de conexión: " + err.message)
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

    const renderCard = (type) => {
        let count = 0;
        let title = '';
        let href = '';
        let accentColor = '';
        let extra = null;

        if (type === 'QR') {
            count = pendingQR;
            title = 'Sin Etiquetar';
            href = '/asignar';
            accentColor = '#ef4444';
        } else if (type === 'LOC') {
            count = pendingLocation;
            title = 'Sin Ubicación';
            href = '/ubicacion';
            accentColor = '#10b981';
        } else if (type === 'DISPATCH') {
            count = pendingDispatches;
            title = 'Despachos';
            href = '/despachar';
            accentColor = '#eab308';
        } else if (type === 'INVOICE') {
            count = invoiceCounts.total;
            title = 'Facturación';
            href = '/facturacion';
            accentColor = '#8b5cf6';
            extra = (
                <div style={{ display: 'flex', gap: '5px', marginTop: '2px', fontSize: '0.6rem', opacity: 0.5 }}>
                    S:{invoiceCounts.sofi} T:{invoiceCounts.tomi} L:{invoiceCounts.lucas}
                </div>
            )
        } else if (type === 'IMAGE') {
            count = pendingImages;
            title = 'Faltan Fotos';
            href = '/gestion?tab=imagenes';
            accentColor = '#ec4899';
        }

        return (
            <Link href={href} key={type} style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => href.includes('tab=imagenes') && setTab('imagenes')}>
                <section className="card" style={{ padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    <h4 style={{ fontSize: '0.65rem', opacity: 0.7, margin: 0 }}>{title}</h4>
                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: count > 0 ? accentColor : 'var(--accent)', margin: '2px 0' }}>
                        {count}
                    </span>
                    {extra}
                </section>
            </Link>
        )
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Gestión y Ajustes</h1>
                <p style={{ opacity: 0.7 }}>Panel administrativo central</p>
            </header>

            <div className="grid mt-md" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                {['QR', 'LOC', 'DISPATCH', 'INVOICE', 'IMAGE'].map(renderCard)}
            </div>

            <nav style={{ display: 'flex', gap: '8px', marginTop: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
                <button
                    className={tab === 'ventas' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => { setTab('ventas'); setSearchQuery(''); }}
                    style={{ flex: 'none', padding: '8px 15px', fontSize: '0.8rem' }}
                >
                    Ventas
                </button>
                <button
                    className={tab === 'stock' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => { setTab('stock'); setSearchQuery(''); }}
                    style={{ flex: 'none', padding: '8px 15px', fontSize: '0.8rem' }}
                >
                    Precio/Stock
                </button>
                <button
                    className={tab === 'imagenes' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => { setTab('imagenes'); setSearchQuery(''); }}
                    style={{ flex: 'none', padding: '8px 15px', fontSize: '0.8rem' }}
                >
                    Cargar Fotos
                </button>
            </nav>

            <div className="card mt-md" style={{ padding: '10px' }}>
                <input
                    type="text"
                    placeholder={`Buscar en ${tab === 'ventas' ? 'ventas' : tab === 'stock' ? 'stock' : 'fotos'}...`}
                    className="input-field"
                    style={{ margin: 0, fontSize: '0.9rem' }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <section className="mt-lg">
                {loading ? (
                    <p className="text-center">Cargando...</p>
                ) : tab === 'ventas' ? (
                    <div className="grid" style={{ gap: '15px' }}>
                        {ventas.map(v => {
                            const sale = v.ventas;
                            return (
                                <div key={v.id} className="card" style={{ padding: '15px', borderLeft: v.estado === 'VENDIDO_ONLINE' ? '4px solid #eab308' : 'none' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1 }}>
                                            <h4 style={{ margin: 0 }}>{v.variantes?.modelos?.descripcion || 'Sin descripción'}</h4>
                                            <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                                {v.codigo_qr} • {new Date(v.fecha_venta).toLocaleString()} • {v.estado === 'VENDIDO_ONLINE' ? 'TIENDANUBE' : (sale?.medio_pago || 'S/D')}
                                            </p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '5px' }}>
                                                <div>
                                                    <p style={{ color: 'var(--accent)', fontWeight: 'bold', margin: 0 }}>
                                                        Neto: $ {(sale?.monto_neto || sale?.total || 0).toLocaleString()}
                                                    </p>
                                                    <p style={{ fontSize: '0.65rem', opacity: 0.4, margin: 0 }}>
                                                        Lista: $ {(sale?.total || 0).toLocaleString()}
                                                    </p>
                                                </div>
                                                {v.estado === 'VENDIDO_ONLINE' && <span className="badge" style={{ fontSize: '0.65rem', padding: '2px 8px', background: '#eab308', color: 'black' }}>ONLINE</span>}
                                            </div>
                                        </div>
                                        {sale && (
                                            <button
                                                onClick={() => handleDeleteSale(sale.id)}
                                                style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
                                            >
                                                Anular ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : tab === 'stock' ? (
                    <div className="grid" style={{ gap: '15px' }}>
                        {stock.length === 0 ? (
                            <div className="card text-center" style={{ padding: '40px', opacity: 0.6 }}>
                                <p>🔍 No se encontró stock para "{searchQuery}"</p>
                                <button className="btn-secondary" onClick={() => setSearchQuery('')} style={{ marginTop: '10px' }}>Limpiar búsqueda</button>
                            </div>
                        ) : (
                            stock.map(v => (
                                <div key={v.id} className="card" style={{ padding: '15px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ display: 'flex', gap: '15px', flex: 1 }}>
                                            {v.imagen_url && (
                                                <img src={v.imagen_url} alt="Prod" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />
                                            )}
                                            <div style={{ flex: 1 }}>
                                                <h4 style={{ margin: 0 }}>{v.modelos?.descripcion}</h4>
                                                <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>{v.color} • {v.available_units.length} pares en stock</p>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
                                                    {v.available_units.map(u => (
                                                        <div key={u.id} style={{
                                                            background: 'var(--secondary)',
                                                            fontSize: '0.65rem',
                                                            padding: '3px 6px',
                                                            borderRadius: '4px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            border: '1px solid var(--card-border)'
                                                        }}>
                                                            <span>T{u.talle_especifico}</span>
                                                            <button
                                                                onClick={() => handleDeleteUnit(u.id)}
                                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}
                                                                title="Eliminar este par"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setEditingVariant(v);
                                                setEditPrices({ lista: v.precio_lista, efectivo: v.precio_efectivo });
                                            }}
                                            style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}
                                        >
                                            Editar Precio
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="grid" style={{ gap: '15px' }}>
                        {missingImages.length === 0 ? (
                            <div className="card text-center" style={{ padding: '40px', opacity: 0.6 }}>
                                <p>✅ Todos los productos tienen foto</p>
                            </div>
                        ) : (
                            missingImages
                                .filter(v => {
                                    const q = searchQuery.toLowerCase();
                                    return (v.modelos?.descripcion || '').toLowerCase().includes(q) ||
                                        (v.color || '').toLowerCase().includes(q);
                                })
                                .map(v => (
                                    <div key={v.id} className="card" style={{ padding: '15px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h4 style={{ margin: 0 }}>{v.modelos?.descripcion}</h4>
                                                <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>{v.color}</p>
                                            </div>
                                            <label className="btn-primary" style={{ cursor: 'pointer', padding: '10px 15px', fontSize: '0.85rem' }}>
                                                📷 Subir Foto
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    capture="environment"
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => handleImageUpload(v.id, e)}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                ))
                        )}
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

                        <div className="grid" style={{ gap: '15px' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>EFECTIVO / TRANSFERENCIA 💵:</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={editPrices.efectivo}
                                    onChange={(e) => {
                                        const efe = e.target.value;
                                        // Redondear a los 100 más cercanos
                                        const lista = Math.round((efe * 1.21) / 100) * 100;
                                        setEditPrices({ efectivo: efe, lista: lista });
                                    }}
                                    autoFocus
                                />
                                <p style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: '2px' }}>Este es el precio final para billetes o transferencias.</p>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>PRECIO LISTA (TARJETAS 💳):</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={editPrices.lista}
                                    onChange={(e) => {
                                        const lista = e.target.value;
                                        // Derivar efectivo: (lista / 1.21) y redondear a mil más cercano p/ arriba
                                        const efe = Math.ceil((lista * (100 / 121)) / 1000) * 1000;
                                        setEditPrices({ lista: lista, efectivo: efe });
                                    }}
                                />
                                <p style={{ fontSize: '0.6rem', opacity: 0.4, marginTop: '2px' }}>Es el precio base con el 21% incluido para cobrar con tarjeta.</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button type="button" onClick={() => setEditingVariant(null)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                            <button type="submit" className="btn-primary" style={{ flex: 1 }}>Actualizar Todo ✅</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ height: '80px' }}></div>
        </div>
    )
}
