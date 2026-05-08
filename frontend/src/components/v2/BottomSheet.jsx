import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

/**
 * BottomSheet v2 — pannello mobile-first che sale dal basso.
 * Use case: azioni tavolo, dettagli ordine, filtri rapidi.
 *
 * Props:
 *  - open, onClose (required)
 *  - title?: string | ReactNode
 *  - dragHandle: default true
 *  - maxHeight: default '85vh' (con safe-area-inset-bottom)
 *  - rounded: default 18 (px)
 *  - closeOnBackdrop: default true
 *
 * NOTE: il drag-to-dismiss reale (pan gesture) è da Phase 2 — ora il drag handle è solo visivo.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  dragHandle = true,
  maxHeight = '85vh',
  rounded = 18,
  closeOnBackdrop = true,
  className = '',
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        style={{ animation: 'fade-in 150ms ease-out' }}
        onClick={() => closeOnBackdrop && onClose?.()}
      />
      {/* sheet */}
      <div
        className={cn(
          'absolute left-0 right-0 bottom-0 bg-[var(--color-surface)]',
          'border-t border-[var(--color-border-strong)]',
          'shadow-[0_-20px_40px_rgba(0,0,0,0.45)]',
          'safe-area-bottom',
          className
        )}
        style={{
          borderTopLeftRadius: rounded,
          borderTopRightRadius: rounded,
          maxHeight,
          overflowY: 'auto',
          animation: 'slide-up 220ms ease-out',
        }}
        role="dialog"
        aria-modal="true"
      >
        {dragHandle && (
          <div className="pt-3 pb-1 flex justify-center">
            <span
              className="block bg-white/15 rounded-full"
              style={{ width: 48, height: 5 }}
              aria-hidden="true"
            />
          </div>
        )}
        {title && (
          <div className="px-5 pt-3 pb-2">
            <h3 className="text-lg font-bold text-[var(--color-text)] serif tracking-tight">
              {title}
            </h3>
          </div>
        )}
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
