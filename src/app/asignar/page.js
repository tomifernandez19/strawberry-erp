'use client'
import { useState, useEffect } from 'react'
import QRScanner from '@/components/QRScanner'
import { assignQRToUnit } from '@/lib/actions'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function AsignarQRPage() {
    const [pendingUnits, setPendingUnits] = useState([])
    const [selectedUnit, setSelectedUnit] = useState(null)
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState('')

    useEffect(() => {
        fetchPending()
    }, [])

    async function fetchPending() {
        const { data, error } = await supabase
            .from('unidades')
            .select('*, variantes(*, modelos(*))')
            .eq('estado', 'PENDIENTE_QR')
            .order('created_at', { ascending: true })

        if (error) console.error(error)
        else {
            setPendingUnits(data || [])
            if (data.length > 0) setSelectedUnit(data[0])
            else setSelectedUnit(null)
        }
        setLoading(false)
    }

    const [isProcessing, setIsProcessing] = useState(false)

    const handleScanSuccess = async (qrCode) => {
        if (!selectedUnit || isProcessing) return
        setIsProcessing(true)
        setMessage('')

        try {
            const res = await assignQRToUnit(selectedUnit.id, qrCode)
            if (res.success) {
                setMessage(`✅ ${selectedUnit.variantes.modelos.descripcion} (Talle ${selectedUnit.talle_especifico}) asignado!`)

                // Advance automatically
                setTimeout(() => {
                    const remaining = pendingUnits.filter(u => u.id !== selectedUnit.id)
                    setPendingUnits(remaining)
                    const next = remaining.length > 0 ? remaining[0] : null
                    setSelectedUnit(next)
                    setIsProcessing(false)
                    // Clear message after a while or leave it
                }, 500)
            } else {
                alert(res.message)
                setIsProcessing(false)
            }
        } catch (err) {
            alert(err.message)
            setIsProcessing(false)
        }
    }

    if (loading) return <p className="text-center mt-lg">Cargando unidades...</p>

    return (
        <div className="grid mt-lg">
            <header className="text-center">
                <h1>Asignar QR</h1>
                <p style={{ opacity: 0.7 }}>{pendingUnits.length} pares pendientes</p>
            </header>

            {message && (
                <div className="card text-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', borderColor: 'var(--primary)' }}>
                    {message}
                </div>
            )}

            {selectedUnit ? (
                <div className="grid">
                    <section className="card" style={{ border: '2px solid var(--primary)', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.9rem', opacity: 0.6, marginBottom: 'var(--spacing-xs)' }}>ASIGNAR AHORA:</p>
                        <h2 style={{ color: 'var(--primary)' }}>{selectedUnit.variantes.modelos.descripcion}</h2>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--spacing-md)', margin: 'var(--spacing-sm) 0' }}>
                            <span className="badge">Talle: {selectedUnit.talle_especifico}</span>
                            <span className="badge">Color: {selectedUnit.variantes.color}</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>Código: {selectedUnit.variantes.modelos.codigo_proveedor}</p>
                    </section>

                    <QRScanner
                        onScanSuccess={handleScanSuccess}
                        label="Escanee el QR para ESTE par"
                    />

                    <div className="card mt-md" style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '8px' }}>¿Problemas con la cámara?</p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                id="manualQR"
                                type="text"
                                placeholder="Escriba el código QR"
                                className="input-field"
                                style={{ flex: 1, margin: 0 }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleScanSuccess(e.target.value);
                                        e.target.value = '';
                                    }
                                }}
                            />
                            <button
                                className="btn-primary"
                                onClick={() => {
                                    const val = document.getElementById('manualQR').value;
                                    if (val) {
                                        handleScanSuccess(val);
                                        document.getElementById('manualQR').value = '';
                                    }
                                }}
                                style={{ padding: '8px 16px' }}
                            >
                                Ok
                            </button>
                        </div>
                    </div>

                    <button
                        className="btn-secondary"
                        onClick={() => {
                            const next = pendingUnits.find(u => u.id !== selectedUnit.id);
                            if (next) setSelectedUnit(next);
                        }}
                        style={{ marginTop: 'var(--spacing-md)' }}
                    >
                        Saltar este par
                    </button>
                </div>
            ) : (
                <div className="card text-center mt-lg">
                    <div style={{ fontSize: '3rem' }}>🎉</div>
                    <h3>¡Todo asignado!</h3>
                    <p>No quedan unidades pendientes de QR.</p>
                    <Link href="/">
                        <button className="btn-primary mt-lg">Volver al Inicio</button>
                    </Link>
                </div>
            )}
        </div>
    )
}
