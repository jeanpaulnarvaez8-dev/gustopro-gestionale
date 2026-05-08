import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from './cn';

/**
 * Toast v2 — sistema lightweight con context API.
 *
 * Setup (in App root):
 *   import { ToastProvider } from '@/components/v2/Toast';
 *   <ToastProvider>...your app...</ToastProvider>
 *
 * Uso:
 *   const toast = useToast();
 *   toast.success('Ordine inviato', { duration: 3000 });
 *   toast.error('Connessione persa');
 *   toast.warn('Tavolo M2 in ritardo');
 *   toast.info('Nuova prenotazione');
 *   const id = toast.show({ tone: 'gold', title: 'Custom', text: '...', duration: 5000 });
 *   toast.dismiss(id);
 */
const ToastCtx = createContext(null);

const TONES = {
  success: { color: 'var(--color-ok)',  icon: CheckCircle2 },
  error:   { color: 'var(--color-err)', icon: AlertTriangle },
  warn:    { color: 'var(--color-warn)',icon: AlertTriangle },
  info:    { color: 'var(--color-info)',icon: Info },
  gold:    { color: 'var(--color-gold)',icon: Info },
};

let _id = 0;
const nextId = () => ++_id;

export function ToastProvider({ children, max = 4 }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    ({ tone = 'info', title, text, duration = 4000 }) => {
      const id = nextId();
      setToasts((list) => {
        const next = [...list, { id, tone, title, text }];
        return next.slice(-max);
      });
      if (duration > 0) {
        const tm = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, tm);
      }
      return id;
    },
    [dismiss, max]
  );

  // Helpers stabili tra render: con useMemo `api` mantiene identica la
  // reference finché `show`/`dismiss` non cambiano. CRITICO per consumer che
  // mettono `toast` nelle dependency di useCallback/useEffect (es.
  // StaffPerformancePage). Senza memoization → infinite re-render loop.
  const api = useMemo(() => ({
    show,
    dismiss,
    success: (text, opts = {}) => show({ tone: 'success', text, ...opts }),
    error:   (text, opts = {}) => show({ tone: 'error',   text, ...opts }),
    warn:    (text, opts = {}) => show({ tone: 'warn',    text, ...opts }),
    info:    (text, opts = {}) => show({ tone: 'info',    text, ...opts }),
    gold:    (text, opts = {}) => show({ tone: 'gold',    text, ...opts }),
  }), [show, dismiss]);

  // cleanup all timers on unmount
  useEffect(() => () => timers.current.forEach((tm) => clearTimeout(tm)), []);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // soft fallback (no provider): logghiamo, non crashiamo
    return {
      show: (t) => console.warn('[Toast] no provider:', t),
      dismiss: () => {},
      success: (m) => console.log('[ok]', m),
      error: (m) => console.error('[err]', m),
      warn: (m) => console.warn('[warn]', m),
      info: (m) => console.log('[info]', m),
      gold: (m) => console.log('[gold]', m),
    };
  }
  return ctx;
}

function ToastViewport({ toasts, dismiss }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed z-[120] right-4 bottom-4 flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: 380 }}
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => {
        const { color, icon: Icon } = TONES[t.tone] || TONES.info;
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto bg-[var(--color-surface)] rounded-[10px]',
              'shadow-[0_8px_24px_rgba(0,0,0,0.45)] flex items-start gap-2.5 p-3.5'
            )}
            style={{
              border: `1px solid ${color}`,
              borderLeft: `4px solid ${color}`,
              animation: 'slide-up 200ms ease-out',
            }}
            role="status"
          >
            <Icon size={18} style={{ color, flexShrink: 0, marginTop: 1 }} />
            <div className="flex-1 text-[13px] text-[var(--color-text)] leading-snug min-w-0">
              {t.title && <div className="font-semibold mb-0.5">{t.title}</div>}
              {t.text && <div className="text-[var(--color-text-2)]">{t.text}</div>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="flex-shrink-0 text-[var(--color-text-3)] hover:text-[var(--color-text)] p-0.5"
              aria-label="Chiudi notifica"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
