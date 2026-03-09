'use client'
import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function QRScanner({ onScanSuccess, label = "Escanee un código QR" }) {
    const [isScanning, setIsScanning] = useState(false)
    const scannerRef = useRef(null)
    const containerId = "qr-reader"

    const isMounted = useRef(true)
    const scannerInstance = useRef(null)

    useEffect(() => {
        isMounted.current = true

        const startScanner = async () => {
            try {
                // Initialize only if not already done
                if (!scannerInstance.current) {
                    scannerInstance.current = new Html5Qrcode(containerId)
                }

                // Start with back camera (environment) by default
                await scannerInstance.current.start(
                    { facingMode: "environment" },
                    {
                        fps: 15,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0,
                    },
                    (decodedText) => {
                        onScanSuccess(decodedText)
                    },
                    () => { /* ignore silent failure */ }
                )

                if (isMounted.current) {
                    setIsScanning(true)
                }
            } catch (err) {
                if (isMounted.current) {
                    console.error("Error starting scanner:", err)
                }
            }
        }

        startScanner()

        return () => {
            isMounted.current = false
            if (scannerInstance.current) {
                const stopAndClear = async () => {
                    try {
                        if (scannerInstance.current.isScanning) {
                            await scannerInstance.current.stop()
                        }
                        scannerInstance.current.clear()
                        scannerInstance.current = null
                    } catch (e) {
                        // This usually happens if called while initializing
                        console.warn("Cleanup warning:", e)
                    }
                }
                stopAndClear()
            }
        }
    }, [onScanSuccess])

    return (
        <div className="scanner-outer-container">
            <h3 className="text-center mb-md">{label}</h3>

            <div className="scanner-frame">
                <div id={containerId}></div>
                {!isScanning && <div className="scanner-placeholder">Iniciando cámara...</div>}
                <div className="scanner-overlay"></div>
            </div>

            <style jsx>{`
                .scanner-outer-container {
                    width: 100%;
                    max-width: 400px;
                    margin: 0 auto;
                    background: var(--card-bg);
                    padding: 20px;
                    border-radius: 24px;
                    border: 1px solid var(--card-border);
                }
                .scanner-frame {
                    position: relative;
                    width: 100%;
                    aspect-ratio: 1;
                    background: #000;
                    border-radius: 20px;
                    overflow: hidden;
                    border: 2px solid var(--card-border);
                }
                #qr-reader {
                    width: 100%;
                    height: 100%;
                }
                .scanner-placeholder {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: white;
                    font-size: 0.9rem;
                    opacity: 0.6;
                }
                .scanner-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border: 40px solid rgba(0,0,0,0.3);
                    pointer-events: none;
                }
                .scanner-overlay::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    border: 2px solid var(--accent);
                    margin: -2px;
                    border-radius: 4px;
                }
            `}</style>
        </div>
    )
}
