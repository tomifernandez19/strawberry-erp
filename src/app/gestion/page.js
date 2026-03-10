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
    const [activatingTN, setActivatingTN] = useState(false)

    // Task counters
    const [pendingQR, setPendingQR] = useState(0)
    const [pendingDispatches, setPendingDispatches] = useState(0)
    const [pendingLocation, setPendingLocation] = useState(0)
    const [pendingImages, setPendingImages] = useState(0)
    const [invoiceCounts, setInvoiceCounts] = useState({ sofi: 0, tomi: 0, lucas: 0, total: 0 })

    useEffect(() => {
        if (tab === 'ventas') fetchVentas()
        else if (tab === 'stock') fetchStock()
        else if (tab === 'imagenes') fetchMissingImages()

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

    async function fetchVentas() {
        setLoading(true)
        try {
            const data = await getRecentSalesList()
            setVentas(data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
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
            .limit(50)
        setStock(data || [])
        setLoading(false)
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
                    onClick={() => setTab('ventas')}
                    style={{ flex: 'none', padding: '8px 15px', fontSize: '0.8rem' }}
                >
                    Ventas
                </button>
                <button
                    className={tab === 'stock' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setTab('stock')}
                    style={{ flex: 'none', padding: '8px 15px', fontSize: '0.8rem' }}
                >
                    Precio/Stock
                </button>
                <button
                    className={tab === 'imagenes' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setTab('imagenes')}
                    style={{ flex: 'none', padding: '8px 15px', fontSize: '0.8rem' }}
                >
                    Cargar Fotos
                </button>
            </nav>

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
                                                {new Date(v.fecha_venta).toLocaleString()} • {v.estado === 'VENDIDO_ONLINE' ? 'TIENDANUBE' : (sale?.medio_pago || 'S/D')}
                                            </p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                                                <p style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                                                    $ {(sale?.total || 0).toLocaleString()}
                                                </p>
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
                        {stock.map(u => (
                            <div key={u.id} className="card" style={{ padding: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        {u.variantes?.imagen_url && (
                                            <img src={u.variantes.imagen_url} alt="Prod" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '8px' }} />
                                        )}
                                        <div>
                                            <h4 style={{ margin: 0 }}>{u.variantes?.modelos?.descripcion}</h4>
                                            <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                                QR: {u.codigo_qr} • Talle: {u.talle_especifico} • {u.variantes?.color}
                                            </p>
                                        </div>
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
                ) : (
                    <div className="grid" style={{ gap: '15px' }}>
                        {missingImages.length === 0 ? (
                            <div className="card text-center" style={{ padding: '40px', opacity: 0.6 }}>
                                <p>✅ Todos los productos tienen foto</p>
                            </div>
                        ) : (
                            missingImages.map(v => (
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
