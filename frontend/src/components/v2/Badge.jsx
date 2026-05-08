import { forwardRef } from 'react';
import { cn } from './cn';

/**
 * Badge v2 — pill colorato per stati / etichette / contatori.
 *
 * tone:
 *  - gold:        oro signature (default)
 *  - sea:         blu mare
 *  - pine:        verde pino
 *  - sand:        sabbia
 *  - terracotta:  terracotta
 *  - ok / warn / err / info / park
 *  - neutral:     border-strong + text
 *
 * size: sm (h22, fs10) | md (h26, fs11) ← default
 * solid: true riempie il colore (vs bg-soft)
 */
const TONES = {
  gold:       { soft: 'bg-[var(--color-gold-soft)] text-[var(--color-gold)] border-[var(--color-gold-ring)]',
                solid:'bg-[var(--color-gold)] text-[#13181C] border-transparent' },
  sea:        { soft: 'bg-[var(--color-sea-soft)] text-[var(--color-sea)] border-[var(--color-sea)]/30',
                solid:'bg-[var(--color-sea)] text-white border-transparent' },
  pine:       { soft: 'bg-[var(--color-pine-soft)] text-[var(--color-pine)] border-[var(--color-pine)]/30',
                solid:'bg-[var(--color-pine)] text-white border-transparent' },
  sand:       { soft: 'bg-[var(--color-sand-soft)] text-[var(--color-sand)] border-[var(--color-sand)]/30',
                solid:'bg-[var(--color-sand)] text-[#13181C] border-transparent' },
  terracotta: { soft: 'bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta)] border-[var(--color-terracotta)]/30',
                solid:'bg-[var(--color-terracotta)] text-white border-transparent' },
  ok:         { soft: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)] border-[var(--color-ok)]/30',
                solid:'bg-[var(--color-ok)] text-white border-transparent' },
  warn:       { soft: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)] border-[var(--color-warn)]/30',
                solid:'bg-[var(--color-warn)] text-[#13181C] border-transparent' },
  err:        { soft: 'bg-[var(--color-err-soft)] text-[var(--color-err)] border-[var(--color-err)]/30',
                solid:'bg-[var(--color-err)] text-white border-transparent' },
  info:       { soft: 'bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/30',
                solid:'bg-[var(--color-info)] text-white border-transparent' },
  park:       { soft: 'bg-[var(--color-park-soft)] text-[var(--color-park)] border-[var(--color-park)]/30',
                solid:'bg-[var(--color-park)] text-white border-transparent' },
  neutral:    { soft: 'bg-[rgba(255,255,255,0.04)] text-[var(--color-text-2)] border-[var(--color-border-strong)]',
                solid:'bg-[var(--color-text)] text-[#13181C] border-transparent' },
};

const SIZES = {
  sm: 'text-[10px] px-2 py-[2px] gap-1 leading-tight',
  md: 'text-[11px] px-2.5 py-1 gap-1.5 leading-tight',
};

const Badge = forwardRef(function Badge(
  {
    children,
    tone = 'gold',
    size = 'md',
    solid = false,
    leftIcon,
    pulse = false,
    className = '',
    ...props
  },
  ref
) {
  const variantClasses = solid ? TONES[tone].solid : TONES[tone].soft;
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center font-semibold uppercase tracking-wide',
        'rounded-full border',
        variantClasses,
        SIZES[size],
        pulse && 'animate-[pulse-gold_1.6s_ease-in-out_infinite]',
        className
      )}
      {...props}
    >
      {leftIcon}
      {children}
    </span>
  );
});

export default Badge;
