'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { getCurrentUser, signOutAction } from '@/lib/actions'
import { useRouter, usePathname } from 'next/navigation'

const AuthContext = createContext()

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        const checkUser = async () => {
            const u = await getCurrentUser()
            setUser(u)
            setLoading(false)

            if (!u && pathname !== '/login') {
                router.push('/login')
            }
            if (u && pathname === '/login') {
                router.push('/')
            }
        }
        checkUser()
    }, [pathname])

    const logout = async () => {
        await signOutAction()
        setUser(null)
        router.push('/login')
    }

    if (loading && pathname !== '/login') {
        return <div className="grid mt-lg text-center" style={{ margin: '100px auto' }}>Cargando 🍓...</div>
    }

    return (
        <AuthContext.Provider value={{ user, logout, isAdmin: user?.role === 'PROPIETARIA' }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
