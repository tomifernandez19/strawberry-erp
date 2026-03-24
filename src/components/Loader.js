'use client'

export default function Loader() {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            width: '100%',
            position: 'fixed',
            top: 0,
            left: 0,
            background: 'var(--background)',
            zIndex: 9999
        }}>
            <div className="loader"></div>
            <style jsx>{`
                .loader {
                    border: 4px solid rgba(255, 255, 255, 0.1);
                    border-left-color: var(--accent);
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}
