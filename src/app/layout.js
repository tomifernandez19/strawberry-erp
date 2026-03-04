'use client'
import '../styles/globals.css'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { AuthProvider, useAuth } from '@/lib/context/AuthContext'
import { usePathname } from 'next/navigation'

const inter = Inter({ subsets: ['latin'] })

function Nav() {
  const pathname = usePathname()
  const { isAdmin, logout } = useAuth()

  if (pathname === '/login') return null

  return (
    <nav className="nav">
      <Link href="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`}>
        <span>🏠</span>
        <span>Inicio</span>
      </Link>
      <Link href="/inventario" className={`nav-item ${pathname === '/inventario' ? 'active' : ''}`}>
        <span>📦</span>
        <span>Stock</span>
      </Link>
      <Link href="/consultar" className={`nav-item ${pathname === '/consultar' ? 'active' : ''}`}>
        <span>🔍</span>
        <span>Consulta</span>
      </Link>
      {isAdmin && (
        <Link href="/reportes" className={`nav-item ${pathname === '/reportes' ? 'active' : ''}`}>
          <span>📊</span>
          <span>Reportes</span>
        </Link>
      )}
      <Link href="/vender" className={`nav-item nav-cta ${pathname === '/vender' ? 'active' : ''}`}>
        <span>💰</span>
        <span>Venta</span>
      </Link>
      <button onClick={logout} className="nav-item">
        <span>🚪</span>
        <span>Salir</span>
      </button>
    </nav>
  )
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <AuthProvider>
          <main className="container">
            {children}
          </main>
          <Nav />
        </AuthProvider>
      </body>
    </html>
  )
}

