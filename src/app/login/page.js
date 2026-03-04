'use client'
import { useState } from 'react'
import { signIn } from '@/lib/actions'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const router = useRouter()

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            await signIn(email, password)
            window.location.href = '/' // Force fresh load to clear layouts
        } catch (err) {
            setError(err.toString())
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="grid mt-lg" style={{ maxWidth: '400px', margin: '100px auto' }}>
            <header className="text-center">
                <h1 style={{ fontSize: '2.5rem' }}>🍓</h1>
                <h2>Strawberry Trejo</h2>
                <p style={{ opacity: 0.7 }}>Ingreso al Sistema</p>
            </header>

            <form onSubmit={handleLogin} className="card mt-lg grid" style={{ gap: '15px' }}>
                {error && <p style={{ color: '#ef4444', textAlign: 'center', fontSize: '0.85rem' }}>{error}</p>}

                <div>
                    <label style={{ opacity: 0.6, fontSize: '0.8rem' }}>Email:</label>
                    <input
                        type="email"
                        required
                        className="input-field"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="tu@email.com"
                    />
                </div>

                <div>
                    <label style={{ opacity: 0.6, fontSize: '0.8rem' }}>Contraseña:</label>
                    <input
                        type="password"
                        required
                        className="input-field"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                    />
                </div>

                <button type="submit" className="btn-primary" style={{ padding: '15px' }} disabled={loading}>
                    {loading ? 'Ingresando...' : 'Entrar'}
                </button>
            </form>
        </div>
    )
}
