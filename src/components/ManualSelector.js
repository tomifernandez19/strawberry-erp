'use client'
import { useState, useEffect } from 'react'
import { getSearchSpecs, findUnitBySpecs } from '@/lib/actions'

export default function ManualSelector({ onSelect, loading: externalLoading, excludeQrs = [], buttonLabel = 'Ver Producto' }) {
    const [specs, setSpecs] = useState([])
    const [selection, setSelection] = useState({ model: '', color: '', size: '' })
    const [modelSearch, setModelSearch] = useState('')
    const [showModelSuggestions, setShowModelSuggestions] = useState(false)
    const [loading, setLoading] = useState(true)
    const [searching, setSearching] = useState(false)

    useEffect(() => {
        async function loadSpecs() {
            setLoading(true)
            const data = await getSearchSpecs()
            setSpecs(data)
            setLoading(false)
        }
        loadSpecs()
    }, [])

    const handleSearch = async () => {
        if (!selection.model || !selection.color || !selection.size) return

        setSearching(true)
        try {
            const result = await findUnitBySpecs(selection.model, selection.color, selection.size, excludeQrs)
            if (result.success) {
                onSelect(result.qr_code)
                // Clear state after selection for next use? No, maybe they want to see it.
                // Resetting color/size but keeping model might be handy for scanning many sizes of same model.
                setSelection(prev => ({ ...prev, size: '' }))
            } else {
                alert(result.message)
            }
        } catch (err) {
            alert("Error de conexión: " + err.message)
        } finally {
            setSearching(false)
        }
    }

    if (loading) return (
        <div className="card mt-md text-center" style={{ opacity: 0.5, fontSize: '0.8rem' }}>
            Cargando opciones de modelos...
        </div>
    )

    if (specs.length === 0) return (
        <div className="card mt-md text-center" style={{ opacity: 0.5, fontSize: '0.8rem' }}>
            No hay stock disponible para búsqueda manual.
        </div>
    )

    const filteredModels = specs.filter(m =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase())
    )

    const currentModel = specs.find(m => m.name === selection.model)
    const availableColors = currentModel ? currentModel.colors : []
    const currentColor = availableColors.find(c => c.name === selection.color)
    const availableSizes = currentColor ? currentColor.sizes : []

    return (
        <div className="card mt-md" style={{ position: 'relative' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>👟</span> Búsqueda por Modelo / Talle
            </p>

            <div className="grid" style={{ gap: '15px' }}>
                <div style={{ position: 'relative' }}>
                    <label style={labelStyle}>Escribir Modelo:</label>
                    <input
                        type="text"
                        placeholder="Ej: Roma, Adidas..."
                        className="input-field"
                        style={{ margin: 0, width: '100%' }}
                        value={selection.model || modelSearch}
                        onChange={(e) => {
                            setSelection({ model: '', color: '', size: '' })
                            setModelSearch(e.target.value)
                            setShowModelSuggestions(true)
                        }}
                        onFocus={() => setShowModelSuggestions(true)}
                    />

                    {showModelSuggestions && modelSearch && !selection.model && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            backgroundColor: 'var(--secondary)',
                            zIndex: 100,
                            borderRadius: '0 0 12px 12px',
                            border: '1px solid var(--card-border)',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)'
                        }}>
                            {filteredModels.length > 0 ? filteredModels.map(m => (
                                <div
                                    key={m.name}
                                    onClick={() => {
                                        setSelection({ model: m.name, color: '', size: '' })
                                        setModelSearch(m.name)
                                        setShowModelSuggestions(false)
                                    }}
                                    style={{ padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem' }}
                                >
                                    {m.name}
                                </div>
                            )) : (
                                <div style={{ padding: '10px 15px', opacity: 0.5, fontSize: '0.8rem' }}>Sin coincidencias con stock</div>
                            )}
                        </div>
                    )}
                </div>

                {selection.model && (
                    <div style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={labelStyle}>Color:</label>
                                <select
                                    value={selection.color}
                                    onChange={(e) => setSelection({ ...selection, color: e.target.value, size: '' })}
                                    style={selectStyle}
                                >
                                    <option value="">Seleccionar Color</option>
                                    {availableColors.map(c => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={labelStyle}>Talle:</label>
                                <select
                                    value={selection.size}
                                    disabled={!selection.color}
                                    onChange={(e) => setSelection({ ...selection, size: e.target.value })}
                                    style={selectStyle}
                                >
                                    <option value="">Talle</option>
                                    {availableSizes.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <button
                            className="btn-primary"
                            onClick={handleSearch}
                            disabled={!selection.size || searching || externalLoading}
                            style={{ marginTop: '15px', width: '100%', background: 'var(--accent)' }}
                        >
                            {searching ? 'Buscando...' : buttonLabel}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

const labelStyle = {
    fontSize: '0.7rem',
    opacity: 0.5,
    display: 'block',
    marginBottom: '4px',
    fontWeight: 'bold',
    textTransform: 'uppercase'
}

const selectStyle = {
    width: '100%',
    padding: '10px',
    borderRadius: '12px',
    backgroundColor: 'var(--secondary)',
    color: 'white',
    border: '1px solid var(--card-border)',
    fontSize: '0.85rem'
}
