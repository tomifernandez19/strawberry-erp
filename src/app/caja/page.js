'use client'
import { useState, useEffect } from 'react'
import { recordCashMovement, getCashMovements } from '@/lib/actions'
import { useRouter } from 'next/navigation'

export default function CajaPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [movements, setMovements] = useState([])
    const [suggestions, setSuggestions] = useState([])
    const [formData, setFormData] = useState({
        monto: '',
        tipo: 'EGRESO', // Default to withdrawal as its most common for 'pagos'
        motivo: '',
        persona: ''
    })

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        // Dynamic import to avoid waterfall if possible, though here we need getRecentPersonas
        const [movs, { getRecentPersonas }] = await Promise.all([
            getCashMovements(),
            import('@/lib/actions')
        ])
        setMovements(movs)
        const pers = await getRecentPersonas()
        setSuggestions(pers)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.monto || !formData.motivo || !formData.persona) return

        setLoading(true)
        try {
            await recordCashMovement({
                monto: parseFloat(formData.monto),
                tipo: formData.tipo,
                motivo: formData.motivo,
                persona: formData.persona
            })
            setFormData({ monto: '', tipo: 'EGRESO', motivo: '', persona: '' })
            await loadData()
            alert('Movimiento registrado con éxito')
        } catch (err) {
            alert('Error: ' + err.message)
        } finally {
            router.refresh()
            setLoading(false)
        }
    }

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Gestión de Efectivo</h1>
                <p style={{ opacity: 0.7 }}>Ingresos y Egresos Manuales</p>
            </header>

            <section className="card mt-lg">
                <form onSubmit={handleSubmit} className="grid">
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {['EGRESO', 'INGRESO'].map(tipo => (
                            <button
                                key={tipo}
                                type="button"
                                onClick={() => setFormData({ ...formData, tipo })}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    borderRadius: '12px',
                                    border: '1px solid',
                                    borderColor: formData.tipo === tipo ? (tipo === 'EGRESO' ? '#ef4444' : 'var(--accent)') : 'var(--card-border)',
                                    backgroundColor: formData.tipo === tipo ? (tipo === 'EGRESO' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)') : 'transparent',
                                    color: formData.tipo === tipo ? (tipo === 'EGRESO' ? '#ef4444' : 'var(--accent)') : 'white',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                {tipo === 'EGRESO' ? '💸 Retirar' : '💰 Agregar'}
                            </button>
                        ))}
                    </div>

                    <div className="grid mt-md" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={labelStyle}>Monto ($):</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                required
                                value={formData.monto}
                                onChange={e => setFormData({ ...formData, monto: e.target.value })}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Responsable:</label>
                            <input
                                type="text"
                                list="personas-list"
                                placeholder="Nombre"
                                required
                                value={formData.persona}
                                onChange={e => setFormData({ ...formData, persona: e.target.value })}
                                style={inputStyle}
                            />
                            <datalist id="personas-list">
                                {suggestions.map(p => <option key={p} value={p} />)}
                            </datalist>
                        </div>
                    </div>

                    <div className="mt-md">
                        <label style={labelStyle}>Motivo / Descripción:</label>
                        <input
                            type="text"
                            placeholder="Ej: Pago de flete, Cambio inicial, etc."
                            required
                            value={formData.motivo}
                            onChange={e => setFormData({ ...formData, motivo: e.target.value })}
                            style={inputStyle}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn-primary btn-large mt-lg"
                        disabled={loading}
                    >
                        {loading ? 'Procesando...' : 'Confirmar Movimiento'}
                    </button>
                </form>
            </section>

            <div className="mt-xl">
                <h3 style={{ fontSize: '1rem', marginBottom: '15px' }}>Historial de Hoy</h3>
                <div className="grid" style={{ gap: '10px' }}>
                    {movements.length === 0 ? (
                        <p style={{ textAlign: 'center', opacity: 0.5, padding: '20px' }}>No hay movimientos manuales registrados hoy.</p>
                    ) : (
                        movements.map(mov => (
                            <div key={mov.id} className="card" style={{ padding: '12px 15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <p style={{ fontWeight: 'bold', fontSize: '0.9rem', margin: 0 }}>{mov.motivo}</p>
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', opacity: 0.7 }}>
                                                👤 {mov.persona || 'S/D'}
                                            </span>
                                        </div>
                                        <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>
                                            {new Date(mov.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{
                                            fontWeight: 'bold',
                                            color: mov.tipo === 'EGRESO' ? '#ef4444' : 'var(--accent)',
                                            fontSize: '1rem'
                                        }}>
                                            {mov.tipo === 'EGRESO' ? '-' : '+'} $ {Math.abs(mov.monto).toLocaleString()}
                                        </p>
                                        <p style={{ fontSize: '0.6rem', opacity: 0.4 }}>{mov.tipo}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div style={{ height: '80px' }}></div>
        </div>
    )
}

const labelStyle = {
    fontSize: '0.8rem',
    opacity: 0.6,
    display: 'block',
    marginBottom: '8px'
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
