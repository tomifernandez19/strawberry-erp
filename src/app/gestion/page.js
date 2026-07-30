'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { deleteSale, deleteUnit, updateVariant, getPendingInvoicesSummary, getMissingImagesList, uploadProductImage, getRecentSalesList, getPendingSenasList, completeSena, cancelarSena, getFallasPendientes, registrarFalla, resolverFalla, updateSale } from '@/lib/actions'
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
    const [searchQuery, setSearchQuery] = useState('')
    const [senas, setSenas] = useState([])
    const [fallas, setFallas] = useState([])
    const [fallaQR, setFallaQR] = useState('')
    const [fallaNotas, setFallaNotas] = useState('')
    const [fallaLoading, setFallaLoading] = useState(false)
    const [fallaMsg, setFallaMsg] = useState(null)
    const [resolviendo, setResolviendo] = useState(null)
    const [montoCredito, setMontoCredito] = useState('')
    const [qrReemplazo, setQrReemplazo] = useState('')
    const [editingVenta, setEditingVenta] = useState(null) // ventaId being edited
    const [editVentaData, setEditVentaData] = useState({})
    const [editVentaLoading, setEditVentaLoading] = useState(false)

    // MercadoLibre
    const [mlConnected, setMlConnected] = useState(false)
    const [mlItems, setMlItems] = useState([]) // { modelo_id, ml_item_id, modelos:{descripcion} }
    const [mlModelos, setMlModelos] = useState([]) // all modelos for mapping
    const [mlNewItemId, setMlNewItemId] = useState('')
    const [mlNewModeloId, setMlNewModeloId] = useState('')
    const [mlNewColor, setMlNewColor] = useState('')
    const [mlMsg, setMlMsg] = useState(null)
    const [mlSyncing, setMlSyncing] = useState(false)
    const [mlPublishModeloId, setMlPublishModeloId] = useState('')
    const [mlPublishing, setMlPublishing] = useState(false)
    const [mlSyncingVariations, setMlSyncingVariations] = useState(null) // modelo_id being synced

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
            else if (tab === 'senas') fetchSenas()
            else if (tab === 'fallas') fetchFallas()
            else if (tab === 'ml') fetchMlData()
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

        // Count pending senas
        const s = await getPendingSenasList()
        setSenas(s)

        // Count pending fallas
        const f = await getFallasPendientes()
        setFallas(f)
    }

    async function fetchSenas() {
        setLoading(true)
        const data = await getPendingSenasList()
        setSenas(data)
        setLoading(false)
    }

    async function fetchFallas() {
        setLoading(true)
        const data = await getFallasPendientes()
        setFallas(data)
        setLoading(false)
    }

    async function fetchMlData() {
        setLoading(true)
        // Check if ML is connected
        const { data: token } = await supabase.from('mercadolibre_tokens').select('id').eq('id', 1).maybeSingle()
        setMlConnected(!!token)
        // Load existing mappings
        const { data: items } = await supabase
            .from('mercadolibre_items')
            .select('id, modelo_id, ml_item_id, color, modelos(descripcion)')
        setMlItems(items || [])
        // Load all modelos for the selector
        const { data: modelos } = await supabase.from('modelos').select('id, descripcion').order('descripcion')
        setMlModelos(modelos || [])
        setLoading(false)

        // Check ml_auth param
        const mlAuth = searchParams.get('ml_auth')
        if (mlAuth === 'success') setMlMsg({ ok: true, text: '✅ MercadoLibre conectado correctamente.' })
        if (mlAuth === 'error') setMlMsg({ ok: false, text: '❌ Error al conectar MercadoLibre. Intentá de nuevo.' })
    }

    async function handleMlLink() {
        if (!mlNewModeloId || !mlNewItemId.trim()) return
        setMlMsg(null)
        const mlId = mlNewItemId.trim().toUpperCase()
        const { error } = await supabase.from('mercadolibre_items').upsert({
            modelo_id: mlNewModeloId,
            ml_item_id: mlId,
            color: mlNewColor.trim().toUpperCase() || null,
        }, { onConflict: 'ml_item_id' })
        if (error) {
            setMlMsg({ ok: false, text: 'Error al vincular: ' + error.message })
        } else {
            setMlNewItemId('')
            setMlNewModeloId('')
            setMlNewColor('')
            setMlMsg({ ok: true, text: `Producto vinculado a ${mlId}.` })
            fetchMlData()
        }
    }

    async function handleMlUnlink(id) {
        if (!confirm('¿Desvincular esta publicación de ML?')) return
        await supabase.from('mercadolibre_items').delete().eq('id', id)
        fetchMlData()
    }

    async function handleMlSyncOne(modeloId, mlItemId) {
        setMlSyncingVariations(modeloId)
        setMlMsg(null)
        const res = await fetch('/api/ml/sync-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modeloId }),
        })
        const data = await res.json()
        setMlSyncingVariations(null)
        setMlMsg({ ok: data.success, text: data.success ? `✅ Stock actualizado en ${mlItemId}` : `❌ Error: ${data.message}` })
    }

    async function handleMlSyncVariations(modeloId) {
        setMlSyncingVariations(modeloId)
        setMlMsg(null)
        const res = await fetch('/api/ml/sync-variations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modeloId }),
        })
        const data = await res.json()
        setMlSyncingVariations(null)
        setMlMsg({ ok: data.success, text: data.success ? `✅ ${data.message}` : `❌ ${data.message}` })
    }

    async function handleMlPublish() {
        if (!mlPublishModeloId) return
        setMlPublishing(true)
        setMlMsg(null)
        const res = await fetch('/api/ml/publish-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modeloId: mlPublishModeloId }),
        })
        const data = await res.json()
        setMlPublishing(false)
        if (data.success) {
            setMlPublishModeloId('')
            setMlMsg({ ok: true, text: `✅ Publicado en ML: ${data.ml_item_id}${data.permalink ? ` — ${data.permalink}` : ''}` })
            fetchMlData()
        } else {
            setMlMsg({ ok: false, text: `❌ Error al publicar: ${data.message}` })
        }
    }

    async function handleMlSyncAll() {
        setMlSyncing(true)
        setMlMsg(null)
        let ok = 0, fail = 0
        for (const item of mlItems) {
            const res = await fetch('/api/ml/sync-product', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modeloId: item.modelo_id }),
            })
            if (res.ok) ok++; else fail++;
        }
        setMlSyncing(false)
        setMlMsg({ ok: fail === 0, text: `Sincronización completa: ${ok} OK, ${fail} con error.` })
    }

    async function handleRegistrarFalla() {
        if (!fallaQR.trim()) return
        setFallaLoading(true)
        setFallaMsg(null)
        const res = await registrarFalla(fallaQR.trim(), fallaNotas)
        setFallaLoading(false)
        if (res.success) {
            setFallaMsg({ tipo: 'ok', texto: `✅ Falla registrada correctamente` })
            setFallaQR('')
            setFallaNotas('')
            fetchFallas()
            fetchCounters()
        } else {
            setFallaMsg({ tipo: 'error', texto: res.message })
        }
    }

    async function handleEditVenta(sale) {
        setEditingVenta(sale.id)
        setEditVentaData({
            medio_pago: sale.medio_pago || '',
            monto_neto: sale.monto_neto ?? '',
            fecha_acreditacion: sale.fecha_acreditacion
                ? new Date(sale.fecha_acreditacion).toISOString().slice(0, 10)
                : ''
        })
    }

    async function handleSaveVenta() {
        setEditVentaLoading(true)
        const res = await updateSale(editingVenta, editVentaData)
        setEditVentaLoading(false)
        if (res.success) {
            setEditingVenta(null)
            fetchVentas(searchQuery)
        } else {
            alert(res.message)
        }
    }

    async function handleResolverFalla(fallaId, tipo) {
        const res = await resolverFalla(fallaId, tipo, {
            monto: tipo === 'NOTA_CREDITO' ? montoCredito : null,
            qrReemplazo: tipo === 'REEMPLAZADO' ? qrReemplazo : null
        })
        if (res.success) {
            setResolviendo(null)
            setMontoCredito('')
            setQrReemplazo('')
            fetchFallas()
            fetchCounters()
        } else {
            alert(res.message)
        }
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
                    .select('id, color, precio_lista, precio_efectivo, costo_promedio, imagen_url, modelos (descripcion)')

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
                    .select('id, color, precio_lista, precio_efectivo, costo_promedio, imagen_url, modelos (descripcion)')
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
                .select('id, talle_especifico, codigo_qr, variante_id, estado')
                .in('estado', ['DISPONIBLE', 'RESERVADO_ONLINE', 'VENDIDO_ONLINE'])
                .in('variante_id', variantIds)

            if (unitError) throw unitError

            // Combine and filter those that actually have stock (or show all if searching?)
            // For editing prices, showing variants even without stock could be useful, 
            // but the user asked for "precio/stock" and expected to see stock.
            const results = variantData.map(v => {
                const units = (unitData || []).filter(u => u.variante_id === v.id)
                    .sort((a, b) => a.talle_especifico.localeCompare(b.talle_especifico, undefined, { numeric: true }))
                return { ...v, available_units: units }
            }).filter(v => search ? true : v.available_units.length > 0)

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
            precio_lista: parseFloat(editPrices.lista),
            costo_promedio: parseFloat(editPrices.costo)
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

    const calcPricesFromCost = (cost) => {
        const c = parseFloat(cost) || 0;
        const efe = (c * 2) + 3000;
        const rawLista = c * 2 * 1.21;
        const lista = (rawLista % 1000 >= 100)
            ? Math.ceil(rawLista / 1000) * 1000
            : Math.floor(rawLista / 1000) * 1000;
        const may = Math.round(efe * 0.9);
        return { costo: cost, efectivo: efe, lista: lista, mayorista: may };
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
        } else if (type === 'SENA') {
            count = senas.length;
            title = 'Señas';
            href = '/gestion?tab=senas';
            accentColor = '#eab308';
        }

        return (
            <Link href={href} key={type} style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => {
                if (href.includes('tab=imagenes')) setTab('imagenes');
                if (href.includes('tab=senas')) setTab('senas');
            }}>
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

            <div className="grid mt-md" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {['QR', 'LOC', 'DISPATCH', 'SENA', 'INVOICE', 'IMAGE'].map(renderCard)}
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
                    className={tab === 'senas' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => { setTab('senas'); setSearchQuery(''); }}
                    style={{ flex: 'none', padding: '8px 15px', fontSize: '0.8rem' }}
                >
                    Señas/Reservas{senas.length > 0 ? ` (${senas.length})` : ''}
                </button>
                <button
                    className={tab === 'imagenes' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => { setTab('imagenes'); setSearchQuery(''); }}
                    style={{ flex: 'none', padding: '8px 15px', fontSize: '0.8rem' }}
                >
                    Cargar Fotos
                </button>
                <button
                    className={tab === 'fallas' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => { setTab('fallas'); setSearchQuery(''); }}
                    style={{ flex: 'none', padding: '8px 15px', fontSize: '0.8rem', borderColor: fallas.length > 0 ? '#ef4444' : undefined }}
                >
                    ⚠️ Fallas{fallas.length > 0 ? ` (${fallas.length})` : ''}
                </button>
                <button
                    className={tab === 'ml' ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => { setTab('ml'); setSearchQuery(''); }}
                    style={{ flex: 'none', padding: '8px 15px', fontSize: '0.8rem', borderColor: tab === 'ml' ? undefined : 'rgba(255,196,0,0.4)', color: tab === 'ml' ? undefined : '#ffc400' }}
                >
                    🛒 ML
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
                ) : tab === 'senas' ? (
                    <div className="grid" style={{ gap: '15px' }}>
                        {senas.length === 0 ? (
                            <p className="text-center py-lg opacity-50">No hay señas pendientes.</p>
                        ) : (
                            senas.map(sena => (
                                <div key={sena.id} className="card" style={{ padding: '15px', borderLeft: '4px solid #eab308' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <h4 style={{ margin: 0 }}>👤 {sena.nombre_cliente || 'Sin nombre'}</h4>
                                            <p style={{ fontSize: '0.8rem', opacity: 0.6, margin: '2px 0' }}>
                                                {new Date(sena.fecha).toLocaleDateString()} • {sena.telefono_cliente || 'Sin tel'}
                                            </p>
                                            <div style={{ marginTop: '8px', fontSize: '0.8rem' }}>
                                                {sena.unidades?.map(u => (
                                                    <p key={u.id} style={{ margin: 0 }}>• {u.variantes?.modelos?.descripcion} ({u.variantes?.color}) T{u.talle_especifico}</p>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ color: '#eab308', fontWeight: 'bold', fontSize: '1.1rem', margin: 0 }}>
                                                Faltan: $ {(sena.total - (Number(sena.monto_efectivo) + Number(sena.monto_otro))).toLocaleString()}
                                            </p>
                                            <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>Total: ${sena.total.toLocaleString()} • Seña: ${(Number(sena.monto_efectivo) + Number(sena.monto_otro)).toLocaleString()}</p>
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="btn-primary"
                                                    style={{ fontSize: '0.75rem', padding: '6px 12px', background: '#eab308', color: 'black' }}
                                                    onClick={() => {
                                                        if (confirm('¿Deseas completar esta seña ahora? El saldo se cobrará en EFECTIVO.')) {
                                                            const due = sena.total - (Number(sena.monto_efectivo) + Number(sena.monto_otro));
                                                            completeSena(sena.id, {
                                                                monto_efectivo: due,
                                                                medio_pago: 'EFECTIVO',
                                                                cuenta_destino: 'CAJA_LOCAL'
                                                            }).then(() => {
                                                                fetchSenas();
                                                                fetchCounters();
                                                            });
                                                        }
                                                    }}
                                                >
                                                    Cobrar saldo
                                                </button>
                                                <button
                                                    className="btn-secondary"
                                                    style={{ fontSize: '0.75rem', padding: '6px 12px', color: '#ef4444', borderColor: '#ef4444' }}
                                                    onClick={() => {
                                                        const senaMonto = Number(sena.monto_efectivo) + Number(sena.monto_otro);
                                                        if (confirm(`¿Confirmar que el cliente no completó la compra?\n\nEl producto vuelve a estar disponible.\nLa seña ($${senaMonto.toLocaleString()}) queda registrada como ingreso del día ${new Date(sena.fecha).toLocaleDateString()}.`)) {
                                                            cancelarSena(sena.id).then(() => {
                                                                fetchSenas();
                                                                fetchCounters();
                                                            });
                                                        }
                                                    }}
                                                >
                                                    No completó
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : tab === 'fallas' ? (
                    <div className="grid" style={{ gap: '20px' }}>
                        {/* Registrar nueva falla */}
                        <div className="card" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.03)' }}>
                            <p style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '12px' }}>⚠️ Registrar Producto con Falla</p>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="Código QR (ej: ST-123456)"
                                value={fallaQR}
                                onChange={e => setFallaQR(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleRegistrarFalla()}
                                style={{ marginBottom: '8px' }}
                                autoFocus
                            />
                            <textarea
                                className="input-field"
                                placeholder="Descripción de la falla (opcional)"
                                value={fallaNotas}
                                onChange={e => setFallaNotas(e.target.value)}
                                rows={2}
                                style={{ marginBottom: '10px', resize: 'vertical' }}
                            />
                            {fallaMsg && (
                                <p style={{ fontSize: '0.8rem', color: fallaMsg.tipo === 'ok' ? 'var(--accent)' : '#ef4444', marginBottom: '8px' }}>
                                    {fallaMsg.texto}
                                </p>
                            )}
                            <button
                                className="btn-primary"
                                style={{ background: '#ef4444', width: '100%' }}
                                onClick={handleRegistrarFalla}
                                disabled={fallaLoading || !fallaQR.trim()}
                            >
                                {fallaLoading ? 'Registrando...' : 'Registrar Falla'}
                            </button>
                        </div>

                        {/* Lista de fallas pendientes */}
                        <div>
                            <p style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '10px', fontWeight: 'bold' }}>
                                PENDIENTES CON PROVEEDOR ({fallas.length})
                            </p>
                            {fallas.length === 0 ? (
                                <p className="text-center" style={{ opacity: 0.4, padding: '30px' }}>No hay fallas pendientes.</p>
                            ) : (
                                fallas.map(f => {
                                    const u = f.unidades
                                    const v = u?.variantes
                                    const isResolving = resolviendo === f.id || resolviendo === f.id + '_reemplazo' || resolviendo === f.id + '_credito'
                                    return (
                                        <div key={f.id} className="card" style={{ marginBottom: '10px', borderLeft: '4px solid #ef4444' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ flex: 1 }}>
                                                    <p style={{ fontWeight: 'bold', margin: 0, fontSize: '0.95rem' }}>
                                                        {v?.modelos?.descripcion || '—'} ({v?.color}) T{u?.talle_especifico}
                                                    </p>
                                                    <p style={{ fontSize: '0.75rem', opacity: 0.5, margin: '2px 0' }}>
                                                        QR: {u?.codigo_qr} • {new Date(f.created_at).toLocaleDateString()}
                                                    </p>
                                                    {f.notas && (
                                                        <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '4px 0 0' }}>{f.notas}</p>
                                                    )}
                                                </div>
                                                {!isResolving && (
                                                    <button
                                                        className="btn-secondary"
                                                        style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                                                        onClick={() => { setResolviendo(f.id); setMontoCredito('') }}
                                                    >
                                                        Resolver
                                                    </button>
                                                )}
                                            </div>
                                            {isResolving && (
                                                <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                                                    <p style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '10px' }}>¿Cómo se resolvió?</p>
                                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                        <button
                                                            className="btn-primary"
                                                            style={{ flex: 1, background: 'var(--accent)', fontSize: '0.8rem' }}
                                                            onClick={() => setResolviendo(f.id + '_reemplazo')}
                                                        >
                                                            ✅ Reemplazado por uno nuevo
                                                        </button>
                                                        <button
                                                            className="btn-secondary"
                                                            style={{ flex: 1, fontSize: '0.8rem', borderColor: '#f59e0b', color: '#f59e0b' }}
                                                            onClick={() => setResolviendo(f.id + '_credito')}
                                                        >
                                                            📄 Nota de Crédito
                                                        </button>
                                                        <button
                                                            className="btn-secondary"
                                                            style={{ fontSize: '0.8rem', color: '#ef4444' }}
                                                            onClick={() => setResolviendo(null)}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                    {resolviendo === f.id + '_reemplazo' && (
                                                        <div style={{ marginTop: '10px' }}>
                                                            <label style={{ fontSize: '0.75rem', opacity: 0.7 }}>QR del producto de reemplazo:</label>
                                                            <input
                                                                type="text"
                                                                className="input-field"
                                                                placeholder="ST-000000"
                                                                value={qrReemplazo}
                                                                onChange={e => setQrReemplazo(e.target.value)}
                                                                style={{ marginTop: '4px', marginBottom: '8px' }}
                                                                autoFocus
                                                            />
                                                            <p style={{ fontSize: '0.7rem', opacity: 0.5, margin: '0 0 8px' }}>
                                                                El par nuevo va a entrar al stock con costo $0.
                                                            </p>
                                                            <button
                                                                className="btn-primary"
                                                                style={{ width: '100%', fontSize: '0.85rem' }}
                                                                onClick={() => handleResolverFalla(f.id, 'REEMPLAZADO')}
                                                                disabled={!qrReemplazo.trim()}
                                                            >
                                                                Confirmar Reemplazo
                                                            </button>
                                                        </div>
                                                    )}
                                                    {resolviendo === f.id + '_credito' && (
                                                        <div style={{ marginTop: '10px' }}>
                                                            <label style={{ fontSize: '0.75rem', opacity: 0.7 }}>Monto de la nota de crédito ($):</label>
                                                            <input
                                                                type="number"
                                                                className="input-field"
                                                                placeholder={`Precio ref: $${(v?.precio_efectivo || 0).toLocaleString()}`}
                                                                value={montoCredito}
                                                                onChange={e => setMontoCredito(e.target.value)}
                                                                style={{ marginTop: '4px', marginBottom: '8px' }}
                                                                autoFocus
                                                            />
                                                            <button
                                                                className="btn-primary"
                                                                style={{ width: '100%', background: '#f59e0b', color: 'black', fontSize: '0.85rem' }}
                                                                onClick={() => handleResolverFalla(f.id, 'NOTA_CREDITO')}
                                                                disabled={!montoCredito}
                                                            >
                                                                Confirmar Nota de Crédito — ${Number(montoCredito || 0).toLocaleString()}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                ) : tab === 'ventas' ? (
                    <div className="grid" style={{ gap: '15px' }}>
                        {ventas.map(v => {
                            const sale = v.ventas;
                            const isEditing = editingVenta === sale?.id;
                            const needsNeto = editVentaData.medio_pago && !['EFECTIVO', 'MAYORISTA_EFECTIVO', 'TRANSFERENCIA_TOMI', 'TRANSFERENCIA_LUCAS', 'TRANSFERENCIA_PROVEEDOR'].includes(editVentaData.medio_pago);
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
                                                        {sale?.fecha_acreditacion && ` • Acred: ${new Date(sale.fecha_acreditacion).toLocaleDateString()}`}
                                                    </p>
                                                </div>
                                                {v.estado === 'VENDIDO_ONLINE' && <span className="badge" style={{ fontSize: '0.65rem', padding: '2px 8px', background: '#eab308', color: 'black' }}>ONLINE</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            {sale && !isEditing && (
                                                <button
                                                    onClick={() => handleEditVenta(sale)}
                                                    style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                >
                                                    Editar
                                                </button>
                                            )}
                                            {sale && !isEditing && (
                                                <button
                                                    onClick={() => handleDeleteSale(sale.id)}
                                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                >
                                                    Anular ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Inline edit form */}
                                    {isEditing && (
                                        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px', display: 'grid', gap: '10px' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>Medio de Pago:</label>
                                                <select
                                                    className="input-field"
                                                    style={{ marginTop: '4px' }}
                                                    value={editVentaData.medio_pago}
                                                    onChange={e => setEditVentaData(d => ({ ...d, medio_pago: e.target.value }))}
                                                >
                                                    <option value="EFECTIVO">Efectivo 💵</option>
                                                    <option value="MAYORISTA_EFECTIVO">Mayorista Efectivo 📦</option>
                                                    <option value="TRANSFERENCIA_TOMI">Transferencia Tomi 📱</option>
                                                    <option value="TRANSFERENCIA_LUCAS">Transferencia Lucas 📱</option>
                                                    <option value="TRANSFERENCIA_PROVEEDOR">Transferencia Proveedor 🚚</option>
                                                    <option value="TARJETA_DEBITO">Tarjeta Débito (Sofi) 💳</option>
                                                    <option value="TARJETA_CREDITO">Tarjeta Crédito (Sofi) 💳</option>
                                                    <option value="QR_LISTA">QR Pago / Otros (Sofi) 🔘</option>
                                                    <option value="GOCUOTAS_TOMI">GoCuotas (Tomi) 🟣</option>
                                                    <option value="DIVIDIR_PAGOS">Dividir Pago ⚖️</option>
                                                </select>
                                            </div>
                                            {needsNeto && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                    <div>
                                                        <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>Monto Neto ($):</label>
                                                        <input
                                                            type="number"
                                                            className="input-field"
                                                            style={{ marginTop: '4px' }}
                                                            value={editVentaData.monto_neto}
                                                            onChange={e => setEditVentaData(d => ({ ...d, monto_neto: e.target.value }))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>Fecha Acreditación:</label>
                                                        <input
                                                            type="date"
                                                            className="input-field"
                                                            style={{ marginTop: '4px' }}
                                                            value={editVentaData.fecha_acreditacion}
                                                            onChange={e => setEditVentaData(d => ({ ...d, fecha_acreditacion: e.target.value }))}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    className="btn-primary"
                                                    style={{ flex: 1 }}
                                                    onClick={handleSaveVenta}
                                                    disabled={editVentaLoading}
                                                >
                                                    {editVentaLoading ? 'Guardando...' : 'Guardar'}
                                                </button>
                                                <button
                                                    className="btn-secondary"
                                                    onClick={() => setEditingVenta(null)}
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : tab === 'ml' ? (
                    <div className="grid" style={{ gap: '20px' }}>
                        {/* Conexión */}
                        <div className="card" style={{ border: `1px solid ${mlConnected ? 'rgba(255,196,0,0.4)' : 'rgba(239,68,68,0.3)'}`, background: mlConnected ? 'rgba(255,196,0,0.03)' : 'rgba(239,68,68,0.03)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <p style={{ fontWeight: 'bold', fontSize: '0.9rem', margin: 0 }}>
                                        {mlConnected ? '🟡 MercadoLibre conectado' : '⚫ MercadoLibre no conectado'}
                                    </p>
                                    <p style={{ fontSize: '0.75rem', opacity: 0.6, margin: '4px 0 0' }}>
                                        {mlConnected ? 'Tokens activos. Se renuevan automáticamente.' : 'Autorizá la app para sincronizar publicaciones y recibir ventas.'}
                                    </p>
                                </div>
                                <a
                                    href="/api/auth/mercadolibre/start"
                                    className="btn-primary"
                                    style={{ fontSize: '0.8rem', padding: '8px 14px', background: '#ffc400', color: 'black', textDecoration: 'none', whiteSpace: 'nowrap' }}
                                >
                                    {mlConnected ? 'Reconectar' : 'Conectar'}
                                </a>
                            </div>
                            {mlMsg && (
                                <p style={{ marginTop: '10px', fontSize: '0.8rem', color: mlMsg.ok ? 'var(--accent)' : '#ef4444' }}>{mlMsg.text}</p>
                            )}
                        </div>

                        {/* Publicar en ML */}
                        <div className="card">
                            <p style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '8px' }}>🚀 Publicar modelo en MercadoLibre</p>
                            <p style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '12px' }}>Sube automáticamente todas las variantes de color y talle del modelo, con fotos y precio de lista.</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <select
                                    className="input-field"
                                    value={mlPublishModeloId}
                                    onChange={e => setMlPublishModeloId(e.target.value)}
                                >
                                    <option value="">— Seleccionar modelo —</option>
                                    {mlModelos.map(m => (
                                        <option key={m.id} value={m.id}>{m.descripcion}</option>
                                    ))}
                                </select>
                                <button
                                    className="btn-primary"
                                    style={{ background: '#ffc400', color: 'black' }}
                                    disabled={!mlPublishModeloId || mlPublishing || !mlConnected}
                                    onClick={handleMlPublish}
                                >
                                    {mlPublishing ? 'Publicando...' : '📤 Publicar en ML'}
                                </button>
                            </div>
                        </div>

                        {/* Vinculación de productos */}
                        <div className="card">
                            <p style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '12px' }}>🔗 Vincular producto del ERP con publicación de ML</p>
                            <p style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '12px' }}>El Item ID lo encontrás en la URL de tu publicación: mercadolibre.com.ar/.../<strong>MLA123456789</strong></p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <select
                                    className="input-field"
                                    value={mlNewModeloId}
                                    onChange={e => setMlNewModeloId(e.target.value)}
                                >
                                    <option value="">— Seleccionar modelo del ERP —</option>
                                    {mlModelos.map(m => (
                                        <option key={m.id} value={m.id}>{m.descripcion}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Item ID de ML (ej: MLA123456789)"
                                    value={mlNewItemId}
                                    onChange={e => setMlNewItemId(e.target.value.toUpperCase())}
                                />
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Color de este item (ej: NEGRO, CHOCOLATE) — opcional si el modelo tiene un solo color"
                                    value={mlNewColor}
                                    onChange={e => setMlNewColor(e.target.value.toUpperCase())}
                                />
                                <button
                                    className="btn-primary"
                                    style={{ background: '#ffc400', color: 'black' }}
                                    disabled={!mlNewModeloId || !mlNewItemId.trim()}
                                    onClick={handleMlLink}
                                >
                                    Vincular
                                </button>
                            </div>
                        </div>

                        {/* Lista de vínculos */}
                        {mlItems.length > 0 && (
                            <div className="card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <p style={{ fontWeight: 'bold', fontSize: '0.85rem', margin: 0 }}>📋 Publicaciones vinculadas ({mlItems.length})</p>
                                    <button
                                        className="btn-primary"
                                        style={{ fontSize: '0.75rem', padding: '6px 12px', background: '#ffc400', color: 'black' }}
                                        disabled={mlSyncing || !mlConnected}
                                        onClick={handleMlSyncAll}
                                    >
                                        {mlSyncing ? 'Sincronizando...' : '🔄 Sincronizar todo'}
                                    </button>
                                </div>
                                <div className="grid" style={{ gap: '8px' }}>
                                    {mlItems.map(item => (
                                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'var(--secondary)', borderRadius: '8px' }}>
                                            <div>
                                                <p style={{ fontSize: '0.85rem', fontWeight: 'bold', margin: 0 }}>{item.modelos?.descripcion}{item.color ? ` — ${item.color}` : ''}</p>
                                                <p style={{ fontSize: '0.7rem', opacity: 0.6, margin: '2px 0 0' }}>{item.ml_item_id}</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button
                                                    className="btn-secondary"
                                                    style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                                    disabled={mlSyncingVariations === item.modelo_id || !mlConnected}
                                                    onClick={() => handleMlSyncOne(item.modelo_id, item.ml_item_id)}
                                                >
                                                    {mlSyncingVariations === item.modelo_id ? '...' : '🔄 Stock'}
                                                </button>
                                                <button
                                                    className="btn-secondary"
                                                    style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                                    disabled={mlSyncingVariations === item.modelo_id || !mlConnected}
                                                    onClick={() => handleMlSyncVariations(item.modelo_id)}
                                                >
                                                    {mlSyncingVariations === item.modelo_id ? '...' : '➕ Variantes'}
                                                </button>
                                                <button
                                                    className="btn-secondary"
                                                    style={{ fontSize: '0.7rem', padding: '4px 10px', color: '#ef4444', borderColor: '#ef4444' }}
                                                    onClick={() => handleMlUnlink(item.id)}
                                                >
                                                    Desvincular
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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

                                                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                                                    <div>
                                                        <span style={{ opacity: 0.5 }}>Costo:</span>
                                                        <span style={{ fontWeight: 'bold', marginLeft: '3px' }}>${v.costo_promedio?.toLocaleString() || '0'}</span>
                                                    </div>
                                                    <div>
                                                        <span style={{ opacity: 0.5 }}>Efe:</span>
                                                        <span style={{ color: 'var(--primary)', fontWeight: 'bold', marginLeft: '3px' }}>${v.precio_efectivo?.toLocaleString()}</span>
                                                    </div>
                                                    <div>
                                                        <span style={{ opacity: 0.5 }}>May:</span>
                                                        <span style={{ color: '#fbbf24', fontWeight: 'bold', marginLeft: '3px' }}>${Math.round(v.precio_efectivo * 0.9).toLocaleString()}</span>
                                                    </div>
                                                    <div>
                                                        <span style={{ opacity: 0.5 }}>Lista:</span>
                                                        <span style={{ fontWeight: 'bold', marginLeft: '3px' }}>${v.precio_lista?.toLocaleString()}</span>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '12px' }}>
                                                    {v.available_units.map(u => (
                                                        <div key={u.id} style={{
                                                            background: u.estado === 'RESERVADO_ONLINE' ? 'rgba(234, 179, 8, 0.1)' : 'var(--secondary)',
                                                            fontSize: '0.65rem',
                                                            padding: '3px 6px',
                                                            borderRadius: '4px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            border: u.estado === 'RESERVADO_ONLINE' ? '1px solid #eab308' : '1px solid var(--card-border)',
                                                            position: 'relative'
                                                        }}>
                                                            {u.estado === 'RESERVADO_ONLINE' && <span title="Reservado" style={{ fontSize: '10px' }}>⏳</span>}
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
                                                setEditPrices({
                                                    costo: v.costo_promedio || 0,
                                                    lista: v.precio_lista,
                                                    efectivo: v.precio_efectivo,
                                                    mayorista: Math.round(v.precio_efectivo * 0.9)
                                                });
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
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '10px', border: '1px solid var(--primary)' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>COSTO UNITARIO:</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={editPrices.costo}
                                    onChange={(e) => setEditPrices(calcPricesFromCost(e.target.value))}
                                    autoFocus
                                    style={{ fontSize: '1.2rem', fontWeight: 'bold' }}
                                />
                                <p style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '4px' }}>Al cambiar el costo, se recalculan el resto automáticamente.</p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>EFECTIVO:</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={editPrices.efectivo}
                                        onChange={(e) => {
                                            const efe = parseFloat(e.target.value) || 0;
                                            setEditPrices({ ...editPrices, efectivo: efe, mayorista: Math.round(efe * 0.9) });
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>MAYORISTA (-10%):</label>
                                    <input
                                        type="number"
                                        disabled
                                        className="input-field"
                                        value={editPrices.mayorista}
                                        style={{ opacity: 0.7 }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.75rem', opacity: 0.6 }}>TARJETA (LISTA):</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={editPrices.lista}
                                    onChange={(e) => setEditPrices({ ...editPrices, lista: e.target.value })}
                                />
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
