'use client'
import { useState, useEffect } from 'react'
import { getSearchSpecs, findUnitBySpecs } from '@/lib/actions'

export default function ManualSelector({ onSelect, loading: externalLoading, excludeQrs = [] }) {
    const [specs, setSpecs] = useState([])
    const [selection, setSelection] = useState({ model: '', color: '', size: '' })
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

    const currentModel = specs.find(m => m.name === selection.model)
    const availableColors = currentModel ? currentModel.colors : []
    const currentColor = availableColors.find(c => c.name === selection.color)
    const availableSizes = currentColor ? currentColor.sizes : []

    return (
        <div className="card mt-md">
            <p style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '12px' }}>
                Búsqueda por Atributos (Sin QR)
            </p>

            <div className="grid" style={{ gap: '10px' }}>
                <div>
                    <label style={labelStyle}>Modelo:</label>
                    <select
                        value={selection.model}
                        onChange={(e) => setSelection({ model: e.target.value, color: '', size: '' })}
                        style={selectStyle}
                    >
                        <option value="">Seleccionar Modelo</option>
                        {specs.map(m => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                        <label style={labelStyle}>Color:</label>
                        <select
                            value={selection.color}
                            disabled={!selection.model}
                            onChange={(e) => setSelection({ ...selection, color: e.target.value, size: '' })}
                            style={selectStyle}
                        >
                            <option value="">Color</option>
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
                    style={{ marginTop: '5px' }}
                >
                    {searching ? 'Buscando...' : 'Ver Producto'}
                </button>
            </div>
        </div>
    )
}

const labelStyle = {
    fontSize: '0.7rem',
    opacity: 0.5,
    display: 'block',
    marginBottom: '4px'
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
