import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

/**
 * Button v2 — Riva Beach palette.
 *
 * Variants:
 *  - primary: oro pieno, accent principale (CTA)
 *  - secondary: outline su surface (azione secondaria)
 *  - ghost: trasparente, hover sottile (azioni terziarie / icon-only)
 *  - danger: rosso pieno (azioni distruttive)
 *  - success: verde pieno (conferme positive)
 *
 * Sizes:
 *  - sm: 36px, fontSize 12, padding 8/12
 *  - md: 44px (tap), fontSize 13, padding 10/16  ← default
 *  - lg: 56px, fontSize 15, padding 14/20         ← mobile primary
 *
 * Props extra: leftIcon, rightIcon, loading, fullWidth.
 */
const VARIANTS = {
  primary:
    'bg-[var(--color-gold)] text-[#13181C] border-transparent ' +
    'hover:bg-[var(--color-gold-light)] active:translate-y-px',
  secondary:
    'bg-[rgba(255,255,255,0.04)] text-[var(--color-text)] ' +
    'border-[var(--color-border-strong)] hover:bg-[rgba(255,255,255,0.08)]',
  ghost:
    'bg-transparent text-[var(--color-text-2)] border-transparent ' +
    'hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--color-text)]',
  danger:
    'bg-[var(--color-err)] text-white border-transparent ' +
    'hover:brightness-110 active:translate-y-px',
  success:
    'bg-[var(--color-ok)] text-white border-transparent ' +
    'hover:brightness-110 active:translate-y-px',
};

const SIZES = {
  sm: 'min-h-[36px] text-xs px-3 py-2 gap-1.5',
  md: 'min-h-[44px] text-[13px] px-4 py-2.5 gap-2',
  lg: 'min-h-[56px] text-[15px] px-5 py-3.5 gap-2.5',
};

const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    leftIcon,
    rightIcon,
    loading = false,
    fullWidth = false,
    disabled = false,
    className = '',
    type = 'button',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center font-semibold rounded-[10px]',
        'border transition-all duration-150 cursor-pointer select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-ring)]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 size={size === 'lg' ? 18 : 16} className="animate-spin" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export default Button;
