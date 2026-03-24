'use client'

export default function Loader() {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            width: '100vw',
            position: 'fixed',
            top: 0,
            left: 0,
            background: '#121212',
            zIndex: 9999,
            flexDirection: 'column',
            gap: '20px'
        }}>
            <div style={{
                width: '40px',
                height: '40px',
                border: '4px solid rgba(255, 255, 255, 0.1)',
                borderLeftColor: '#ffbf00',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
            }}></div>
            <p style={{ color: '#888', fontSize: '0.9rem', fontWeight: 'bold' }}>CARGANDO DATOS...</p>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            ` }} />
        </div>
    )
}
