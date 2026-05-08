import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import Button from './Button';

/**
 * Modal v2 — overlay centrato con fade-in + slide-up.
 *
 * Props:
 *  - open (required), onClose (required)
 *  - title?: string | ReactNode
 *  - description?: string | ReactNode (mostrato sotto al titolo)
 *  - size: sm (380) | md (480) ← default | lg (640) | xl (840)
 *  - tone?: 'default' | 'danger' (border rosso, per conferme distruttive)
 *  - hideClose: nasconde la X (gestisce solo footer)
 *  - footer?: ReactNode (override del footer; in alternativa usa <Modal.Actions>)
 *  - closeOnBackdrop: default true
 *  - closeOnEsc: default true
 *  - children: corpo modale
 *
 * Sub-components:
 *  - Modal.Actions: layout flex per footer button standard
 */
const SIZES = {
  sm: 'max-w-[380px]',
  md: 'max-w-[480px]',
  lg: 'max-w-[640px]',
  xl: 'max-w-[840px]',
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  tone = 'default',
  hideClose = false,
  footer,
  closeOnBackdrop = true,
  closeOnEsc = true,
  className = '',
}) {
  // ESC handler
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeOnEsc, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const isDanger = tone === 'danger';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ animation: 'fade-in 150ms ease-out' }}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[4px]"
        onClick={() => closeOnBackdrop && onClose?.()}
      />
      {/* dialog */}
      <div
        className={cn(
          'relative w-full bg-[var(--color-surface)] rounded-[14px]',
          'border-2 shadow-[0_24px_60px_rgba(0,0,0,0.6)]',
          isDanger ? 'border-[var(--color-err)]' : 'border-[var(--color-border-strong)]',
          SIZES[size],
          className
        )}
        style={{ animation: 'slide-up 220ms ease-out' }}
      >
        {(title || !hideClose) && (
          <div className="flex items-start gap-3 p-6 pb-4">
            <div className="flex-1 min-w-0">
              {title && (
                <h2 className="text-xl font-bold text-[var(--color-text)] serif tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1.5 text-sm text-[var(--color-text-2)] leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center',
                  'text-[var(--color-text-2)] hover:text-[var(--color-text)]',
                  'hover:bg-[rgba(255,255,255,0.06)] transition-colors'
                )}
                aria-label="Chiudi"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div className={cn(title || !hideClose ? 'px-6 pb-6' : 'p-6')}>{children}</div>

        {footer && (
          <div className="px-6 pb-6 pt-2 border-t border-[var(--color-border-soft)] mt-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

Modal.Actions = function ModalActions({ children, className = '' }) {
  return (
    <div className={cn('flex flex-col-reverse sm:flex-row gap-2 sm:justify-end', className)}>
      {children}
    </div>
  );
};

// Re-export Button per consumer comodo: <Modal.Button variant="primary"...>
Modal.Button = Button;
