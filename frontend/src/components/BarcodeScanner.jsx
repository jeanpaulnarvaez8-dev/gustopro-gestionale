import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, CameraOff, FlipHorizontal, Loader2 } from 'lucide-react'
import { Modal, Button } from './v2'

/**
 * BarcodeScanner — Modal full-screen con video stream + barcode decoder.
 *
 * Supporta: EAN-13, EAN-8, UPC-A, UPC-E, Code 128 (GS1-128), Code 39, ITF,
 * QR Code, Data Matrix (tutti i formati delle etichette MARR/Metro/altri
 * fornitori italiani).
 *
 * UX:
 *  - Apre la camera POSTERIORE del telefono (preferred per scan)
 *  - Mostra preview con overlay "viewfinder" guida (rettangolo bianco)
 *  - Suona feedback haptic al match (vibrate 30ms)
 *  - Chiama onScan(code) e chiude il modal
 *  - Bottone "Cambia camera" per switch tra fronte/retro
 *  - Bottone "Annulla" per uscire senza scan
 *
 * Props:
 *  - open: bool
 *  - onClose: () => void
 *  - onScan: (code: string) => void    chiamato col codice decoded
 *  - title: string                     header (default "Scansiona codice")
 *
 * Permission: la prima volta che si apre, il browser chiede accesso camera.
 * Negato → mostra messaggio + bottone "Riprova".
 */
export default function BarcodeScanner({ open, onClose, onScan, title = 'Scansiona codice' }) {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState(null)
  const [devices, setDevices] = useState([])
  const [deviceIdx, setDeviceIdx] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [lastCode, setLastCode] = useState(null)

  useEffect(() => {
    if (!open) {
      // Cleanup quando il modal si chiude
      try { controlsRef.current?.stop() } catch { /* */ }
      readerRef.current = null
      setScanning(false)
      setError(null)
      setLastCode(null)
      return
    }

    let cancelled = false
    async function start() {
      try {
        setError(null)
        setScanning(true)
        // Lista cameras (preferenza: 'environment' = camera posteriore mobile)
        const cams = await BrowserMultiFormatReader.listVideoInputDevices()
        if (cancelled) return
        if (!cams || cams.length === 0) {
          throw new Error('Nessuna camera trovata')
        }
        // Heuristic: cerca camera con label "back" / "rear" / "environment"
        const preferIdx = cams.findIndex((d) =>
          /back|rear|environment|posteriore/i.test(d.label || '')
        )
        const idx = preferIdx >= 0 ? preferIdx : 0
        setDevices(cams)
        setDeviceIdx(idx)

        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        const controls = await reader.decodeFromVideoDevice(
          cams[idx].deviceId,
          videoRef.current,
          (result, err) => {
            if (cancelled) return
            if (result) {
              const code = result.getText()
              setLastCode(code)
              // Haptic feedback mobile
              if (navigator.vibrate) {
                try { navigator.vibrate(30) } catch { /* */ }
              }
              // Stop scanning + callback
              try { controls.stop() } catch { /* */ }
              onScan(code)
            } else if (err && err.name !== 'NotFoundException') {
              // NotFoundException è normale (frame senza barcode visibile),
              // logghiamo solo gli altri errori reali.
              console.warn('[BarcodeScanner]', err.message)
            }
          }
        )
        if (cancelled) {
          try { controls.stop() } catch { /* */ }
          return
        }
        controlsRef.current = controls
      } catch (e) {
        if (cancelled) return
        setError(e.message || 'Errore camera')
        setScanning(false)
      }
    }
    start()

    return () => {
      cancelled = true
      try { controlsRef.current?.stop() } catch { /* */ }
    }
  }, [open, onScan])

  // Switch camera (front ↔ back su mobile)
  async function switchCamera() {
    if (!devices || devices.length <= 1 || !readerRef.current) return
    try { controlsRef.current?.stop() } catch { /* */ }
    const nextIdx = (deviceIdx + 1) % devices.length
    setDeviceIdx(nextIdx)
    try {
      const reader = readerRef.current
      const controls = await reader.decodeFromVideoDevice(
        devices[nextIdx].deviceId,
        videoRef.current,
        (result) => {
          if (result) {
            const code = result.getText()
            setLastCode(code)
            if (navigator.vibrate) { try { navigator.vibrate(30) } catch { /* */ } }
            try { controls.stop() } catch { /* */ }
            onScan(code)
          }
        }
      )
      controlsRef.current = controls
    } catch (e) {
      setError(e.message || 'Switch fallito')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Camera size={20} className="text-[var(--color-gold)]" />
          {title}
        </span>
      }
      size="lg"
      footer={
        <Modal.Actions>
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          {devices.length > 1 && (
            <Button
              variant="secondary"
              leftIcon={<FlipHorizontal size={16} />}
              onClick={switchCamera}
            >
              Cambia camera
            </Button>
          )}
        </Modal.Actions>
      }
    >
      {error ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CameraOff size={40} className="text-[var(--color-err)]" />
          <p className="text-[var(--color-text)] font-semibold">{error}</p>
          <p className="text-[var(--color-text-3)] text-xs">
            Verifica che il browser abbia accesso alla camera e ricarica la pagina.
          </p>
        </div>
      ) : (
        <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {/* Viewfinder overlay (rettangolo guida centrale) */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className="border-2 border-[var(--color-gold)] rounded-lg"
              style={{
                width: '78%',
                height: '40%',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
              }}
            />
          </div>
          {/* Status badge top-left */}
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/70 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            {scanning && !lastCode ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Scansione…
              </>
            ) : lastCode ? (
              <>✓ {lastCode.slice(0, 20)}</>
            ) : null}
          </div>
        </div>
      )}

      <p className="text-[var(--color-text-3)] text-xs text-center mt-3 leading-relaxed">
        Inquadra il codice a barre del prodotto. Funziona con EAN-13, GS1-128,
        QR e altri formati standard usati da MARR, Metro, ecc.
      </p>
    </Modal>
  )
}
