import { forwardRef, useId } from 'react';
import { cn } from './cn';

/**
 * Input v2 — text/number/email/password.
 *
 * Props:
 *  - label?: string
 *  - hint?:  string (mostrato sotto se non c'è errore)
 *  - error?: string (override hint, color err)
 *  - leftIcon, rightIcon: ReactNode (icone interne)
 *  - size: sm | md ← default | lg
 *  - fullWidth: true (default false)
 *
 * Tutti gli altri props finiscono sull'<input>.
 */
const SIZES = {
  sm: 'min-h-[36px] text-xs px-3',
  md: 'min-h-[44px] text-sm px-3.5',
  lg: 'min-h-[56px] text-[15px] px-4',
};

const Input = forwardRef(function Input(
  {
    label,
    hint,
    error,
    leftIcon,
    rightIcon,
    size = 'md',
    fullWidth = false,
    className = '',
    inputClassName = '',
    id: idProp,
    type = 'text',
    ...props
  },
  ref
) {
  const reactId = useId();
  const id = idProp || `inp-${reactId}`;
  const hasIconLeft = !!leftIcon;
  const hasIconRight = !!rightIcon;

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full', className)}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold text-[var(--color-text-2)] tracking-wide uppercase"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {hasIconLeft && (
          <span className="absolute inset-y-0 left-3 flex items-center text-[var(--color-text-3)] pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          type={type}
          className={cn(
            'w-full rounded-[10px] border bg-[var(--color-surface-2)]',
            'text-[var(--color-text)] placeholder:text-[var(--color-text-3)]',
            'transition-all duration-150 outline-none',
            'focus:ring-2 focus:ring-[var(--color-gold-ring)] focus:border-[var(--color-gold)]',
            error
              ? 'border-[var(--color-err)]'
              : 'border-[var(--color-border-strong)] hover:border-[var(--color-text-3)]',
            SIZES[size],
            hasIconLeft && 'pl-10',
            hasIconRight && 'pr-10',
            inputClassName
          )}
          {...props}
        />
        {hasIconRight && (
          <span className="absolute inset-y-0 right-3 flex items-center text-[var(--color-text-3)]">
            {rightIcon}
          </span>
        )}
      </div>
      {(error || hint) && (
        <span
          className={cn(
            'text-xs',
            error ? 'text-[var(--color-err)]' : 'text-[var(--color-text-3)]'
          )}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
});

export default Input;
