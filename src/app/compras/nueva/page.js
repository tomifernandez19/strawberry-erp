'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { createPurchase, uploadProductImage, getLastRemito, getStockAutocompleteData } from '@/lib/actions'
import { useRouter } from 'next/navigation'
import Tesseract from 'tesseract.js';

export default function NuevaCompraPage() {
    const router = useRouter()
    const [ocrStep, setOcrStep] = useState('')
    const [isScanning, setIsScanning] = useState(false)
    const [formData, setFormData] = useState({
        proveedor: '',
        nro_remito: ''
    })
    const [items, setItems] = useState([
        { variante_id: '', cantidad: 1, costo_unitario: 0, descripcion: '', color: '', codigo_proveedor: '', curva: '35-39(37)' }
    ])
    const [loading, setLoading] = useState(false)

    const [autoData, setAutoData] = useState({ descriptions: [], colors: [], lookup: {} })

    useEffect(() => {
        loadInitialStats()
    }, [])

    async function loadInitialStats() {
        const [lastRem, suggestions] = await Promise.all([
            getLastRemito(),
            getStockAutocompleteData()
        ])
        setFormData(prev => ({ ...prev, nro_remito: lastRem }))
        setAutoData(suggestions)
    }

    const handleOCR = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsScanning(true);
        setOcrStep('Analizando remito con IA...');
        try {
            // Reverting to 'spa' as it might help with Spanish descriptions
            const { data: { text } } = await Tesseract.recognize(file, 'spa');
            console.log("OCR Raw Text:", text);
            setOcrStep('Extrayendo productos...');
            parseInvoiceText(text);
        } catch (error) {
            console.error("OCR Error:", error);
            setOcrStep('Error en el proceso');
            alert("Error al procesar la imagen. Asegúrate de que el remito esté bien iluminado.");
        } finally {
            setIsScanning(false);
            setOcrStep('');
        }
    };

    const parseInvoiceText = (text) => {
        const allLines = text.split('\n').map(l => l.trim().toUpperCase()).filter(l => l.length > 0);
        let nro_remito = '';
        const detectedItems = [];
        const knownColors = [
            'NEGRO', 'CAMEL', 'BLANCO', 'AZUL', 'ROJO', 'GRIS', 'MARRON', 'BEIGE', 'ORO', 'PLATA', 'COBRE',
            'CHOCOLATE', 'VISON', 'FUCSIA', 'LILA', 'MOSTAZA', 'TERRACOTA', 'VERDE', 'SUELA', 'NUDE', 'LIMA'
        ];

        // 1. Extract Remito (Pattern 0000-00000000)
        for (const line of allLines) {
            const remitoMatch = line.match(/\d{3,}-\d{8}/);
            if (remitoMatch && !nro_remito) nro_remito = remitoMatch[0];
        }

        // 2. Resilient Product Extraction
        // We look for any line that starts with a potential product code and has numbers
        allLines.forEach(line => {
            const words = line.split(/\s+/).filter(w => w.length >= 2);
            if (words.length < 3) return;

            const codeCandidate = words[0];
            // Resilient Code check: At least 4 chars, starts with letters or has alphanumeric mix
            const isCode = codeCandidate.length >= 4 && /^[A-Z]{1,3}/.test(codeCandidate);

            if (isCode && !line.includes('PAGINA') && !line.includes('TELEFONO')) {
                // Extract Numbers for Qty and Price
                const numbers = line.match(/[\d.,]+/g) || [];
                const cleanNumbers = numbers
                    .map(n => parseFloat(n.replace(/\./g, '').replace(',', '.')))
                    .filter(v => !isNaN(v));

                if (cleanNumbers.length === 0) return;

                // Heuristic: Qty is usually a small integer (1-48), Price is > 500
                const cantidad = cleanNumbers.find(v => v > 0 && v <= 48) || 1;
                const cleanMoney = cleanNumbers.filter(v => v > 500);
                const unitPrice = cleanMoney.length > 0 ? Math.min(...cleanMoney) : 0;

                const color = knownColors.find(c => line.includes(c)) || 'S/D';

                // Clean description (remove code, color and numbers)
                let description = line
                    .replace(codeCandidate, '')
                    .replace(color, '')
                    .replace(/[\d.,]+/g, '')
                    .replace(/===+/g, '')
                    .trim();

                if (description.length > 2) {
                    detectedItems.push({
                        codigo_proveedor: codeCandidate,
                        descripcion: description,
                        color: color,
                        cantidad: Math.round(cantidad),
                        costo_unitario: unitPrice,
                        curva: cantidad === 6 ? '35-39(37)' : (cantidad === 12 ? '35-39(37)' : 'manual')
                    });
                }
            }
        });

        if (nro_remito) setFormData(prev => ({ ...prev, nro_remito }));

        if (detectedItems.length > 0) {
            setItems(detectedItems);
        } else {
            console.log("OCR Parsing failed to find items in text:", text);
            alert("No pude detectar los productos automáticamente. Por favor, cargalos manualmente o intente con una foto más clara.");
            if (items.length === 0) addItem();
        }
    };

    const handleItemPhoto = async (index, e) => {
        const file = e.target.files[0]
        if (!file) return;

        setLoading(true)
        try {
            // Client-side compression with Canvas
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1000;
                    const scaleSize = MAX_WIDTH / img.width;
                    canvas.width = MAX_WIDTH;
                    canvas.height = img.height * scaleSize;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                    updateItem(index, 'localImage', compressedBase64);
                    setLoading(false);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error("Compression error:", err);
            setLoading(false);
        }
    }

    const addItem = () => {
        setItems([...items, { variante_id: '', cantidad: 1, costo_unitario: 0, curva: '35-39(37)', localImage: null, descripcion: '', color: '', codigo_proveedor: '' }])
    }

    const removeItem = (index) => {
        if (items.length === 1) return; // Don't remove the last one
        const newItems = items.filter((_, i) => i !== index)
        setItems(newItems)
    }

    const updateItem = (index, field, value) => {
        const newItems = [...items]
        newItems[index][field] = value

        // Smart Autocomplete Logic
        if (field === 'descripcion' || field === 'color') {
            const desc = newItems[index].descripcion?.toUpperCase();
            const color = newItems[index].color?.toUpperCase();

            if (autoData.lookup[desc]) {
                // If we found a description match, suggest the code
                if (!newItems[index].codigo_proveedor) {
                    newItems[index].codigo_proveedor = autoData.lookup[desc].codigo;
                }

                // If we also have a color match, suggest the cost
                if (color && autoData.lookup[desc].colors[color]) {
                    newItems[index].costo_unitario = autoData.lookup[desc].colors[color];
                }
            }
        }

        // Auto-set quantity to 6 ONLY for full curves
        const curves = ['35-39(37)', '36-40(38)', '35-39(38)', '36-40(37)'];
        if (field === 'curva' && curves.includes(value)) {
            newItems[index].cantidad = 6
        }

        setItems(newItems)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            const formattedItems = []
            for (const item of items) {
                if (!item.codigo_proveedor) continue;

                let imagen_url = null;
                if (item.localImage) {
                    // Upload to a generic bucket or use item code as reference
                    // Since we don't have variantId yet, we can't use uploadProductImage(variantId, ...)
                    // Let's modify uploadProductImage to be more generic if needed.
                    // For now, let's use a temp ID or wait after createPurchase?
                    // Better: call uploadProductImage with a null id and get URL, then update after.
                    const res = await uploadProductImage(null, item.localImage)
                    if (res.success) imagen_url = res.url
                }

                let talles = [];
                if (item.curva === '35-39(37)') {
                    talles = ['35', '36', '37', '37', '38', '39'];
                } else if (item.curva === '36-40(38)') {
                    talles = ['36', '37', '38', '38', '39', '40'];
                } else if (item.curva === '35-39(38)') {
                    talles = ['35', '36', '37', '38', '38', '39'];
                } else if (item.curva === '36-40(37)') {
                    talles = ['36', '37', '37', '38', '39', '40'];
                } else if (['35', '36', '37', '38', '39', '40'].includes(item.curva)) {
                    talles = Array(item.cantidad || 1).fill(item.curva);
                } else {
                    talles = Array(item.cantidad || 1).fill('U');
                }
                formattedItems.push({
                    codigo_proveedor: item.codigo_proveedor,
                    descripcion: item.descripcion,
                    color: item.color,
                    costo_unitario: item.costo_unitario,
                    cantidad: talles.length,
                    talles,
                    imagen_url: imagen_url
                });
            }

            const resComp = await createPurchase({
                nro_remito: formData.nro_remito,
                items: formattedItems
            })
            if (resComp.success) {
                router.push('/asignar')
            } else {
                alert("Error al guardar: " + resComp.message)
            }
        } catch (error) {
            alert(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Alta Stock</h1>
                <p style={{ opacity: 0.7 }}>Ingreso automático por Foto</p>
            </header>

            <section className="card" style={{ border: '2px dashed var(--primary)', textAlign: 'center' }}>
                <label style={{ cursor: 'pointer', display: 'block', padding: 'var(--spacing-md)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{isScanning ? '⌛' : '📷'}</span>
                        <span>{isScanning ? ocrStep || 'Procesando...' : 'Escanear o Subir Remito'}</span>
                    </div>
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleOCR}
                        style={{ display: 'none' }}
                        disabled={isScanning}
                    />
                </label>
            </section>

            <form onSubmit={handleSubmit} className="grid mt-lg">
                <div className="card grid">
                    <input
                        type="text"
                        placeholder="Proveedor (Opcional)"
                        value={formData.proveedor}
                        onChange={e => setFormData({ ...formData, proveedor: e.target.value.toUpperCase() })}
                        style={{ ...inputStyle, textTransform: 'uppercase' }}
                    />
                    <input
                        type="text"
                        placeholder="Nro Remito"
                        required
                        value={formData.nro_remito}
                        onChange={e => setFormData({ ...formData, nro_remito: e.target.value.toUpperCase() })}
                        style={{ ...inputStyle, textTransform: 'uppercase' }}
                    />
                </div>

                <h3>Detalle de productos</h3>
                {items.map((item, index) => (
                    <div key={index} className="card grid" style={{ position: 'relative' }}>
                        {items.length > 1 && (
                            <button
                                type="button"
                                onClick={() => removeItem(index)}
                                style={{
                                    position: 'absolute',
                                    top: '10px',
                                    right: '10px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    color: '#ef4444',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '24px',
                                    height: '24px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 10
                                }}
                            >
                                ✕
                            </button>
                        )}
                        <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                            <div style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {item.localImage ? (
                                    <img src={item.localImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <label style={{ cursor: 'pointer', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '1.2rem' }}>📷</span>
                                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleItemPhoto(index, e)} />
                                    </label>
                                )}
                            </div>
                            <input
                                type="text"
                                placeholder="Código"
                                value={item.codigo_proveedor}
                                onChange={e => updateItem(index, 'codigo_proveedor', e.target.value.toUpperCase())}
                                style={{ ...inputStyle, flex: 1, fontWeight: 'bold', color: 'var(--primary)', textTransform: 'uppercase' }}
                            />
                            <div style={{
                                flex: 0.5,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(255,255,255,0.05)',
                                borderRadius: 'var(--radius)',
                                fontSize: '0.8rem'
                            }}>
                                Prov: {item.codigo_proveedor?.substring(0, 2) || '--'}
                            </div>
                        </div>

                        <SearchableInput
                            placeholder="Descripción (Nombre)"
                            value={item.descripcion}
                            options={autoData.descriptions}
                            onChange={val => updateItem(index, 'descripcion', val)}
                        />

                        <SearchableInput
                            placeholder="Color"
                            value={item.color}
                            options={autoData.colors}
                            onChange={val => updateItem(index, 'color', val)}
                        />

                        <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                            <select
                                value={item.curva}
                                onChange={e => updateItem(index, 'curva', e.target.value)}
                                style={{ ...inputStyle, flex: 2 }}
                            >
                                <option value="35-39(37)">35 al 39 (doble 37)</option>
                                <option value="36-40(38)">36 al 40 (doble 38)</option>
                                <option value="35-39(38)">35 al 39 (doble 38)</option>
                                <option value="36-40(37)">36 al 40 (doble 37)</option>
                                <option value="35">Solo Talle 35</option>
                                <option value="36">Solo Talle 36</option>
                                <option value="37">Solo Talle 37</option>
                                <option value="38">Solo Talle 38</option>
                                <option value="39">Solo Talle 39</option>
                                <option value="40">Solo Talle 40</option>
                                <option value="manual">Manual (Talle U)</option>
                            </select>

                            {(item.curva === 'manual' || ['35', '36', '37', '38', '39', '40'].includes(item.curva)) && (
                                <input
                                    type="number"
                                    placeholder="Cant"
                                    value={item.cantidad}
                                    onChange={e => updateItem(index, 'cantidad', parseInt(e.target.value))}
                                    style={{ ...inputStyle, flex: 1 }}
                                />
                            )}
                        </div>

                        <input
                            type="number"
                            placeholder="Costo Unitario"
                            value={item.costo_unitario}
                            onChange={e => updateItem(index, 'costo_unitario', parseFloat(e.target.value))}
                            style={inputStyle}
                        />
                    </div>
                ))}

                <div className="card text-center" style={{ marginTop: 'var(--spacing-lg)', backgroundColor: 'var(--secondary)' }}>
                    <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>TOTAL COMPRA</p>
                    <h2 style={{ color: 'var(--accent)' }}>
                        $ {items.reduce((acc, curr) => acc + (curr.cantidad * curr.costo_unitario), 0).toLocaleString()}
                    </h2>
                </div>

                <button type="button" className="btn-secondary" onClick={addItem} style={{ width: '100%', marginTop: 'var(--spacing-md)' }}>
                    + Agregar Producto
                </button>

                <button type="submit" className="btn-primary btn-large" disabled={loading} style={{ marginTop: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
                    {loading ? 'Guardando...' : 'Confirmar y Generar Unidades'}
                </button>
            </form>
            <div style={{ height: '80px' }}></div> {/* Spacer for mobile nav */}
        </div>
    )
}

const inputStyle = {
    width: '100%',
    padding: 'var(--spacing-md)',
    borderRadius: 'var(--radius)',
    backgroundColor: 'var(--secondary)',
    color: 'white',
    border: '1px solid var(--card-border)',
    fontSize: '1rem'
}

function SearchableInput({ placeholder, value = '', options = [], onChange }) {
    const [isOpen, setIsOpen] = useState(false)
    const filtered = (options || []).filter(o =>
        o && o.toLowerCase().includes((value || '').toLowerCase())
    )

    return (
        <div style={{ position: 'relative' }}>
            <input
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={e => {
                    onChange(e.target.value.toUpperCase())
                    setIsOpen(true)
                }}
                onFocus={() => setIsOpen(true)}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                style={{ ...inputStyle, textTransform: 'uppercase' }}
            />
            {isOpen && filtered.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#1E293B',
                    border: '1px solid var(--card-border)',
                    borderRadius: 'var(--radius)',
                    zIndex: 100,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    marginTop: '4px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                }}>
                    {filtered.map(opt => (
                        <div
                            key={opt}
                            onClick={() => {
                                onChange(opt.toUpperCase())
                                setIsOpen(false)
                            }}
                            style={{
                                padding: '10px',
                                cursor: 'pointer',
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                fontSize: '0.9rem'
                            }}
                        >
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
