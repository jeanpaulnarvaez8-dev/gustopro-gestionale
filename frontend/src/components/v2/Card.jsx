import { forwardRef } from 'react';
import { cn } from './cn';

/**
 * Card v2 — superficie elevata per raggruppare contenuto.
 *
 * variant:
 *  - default: surface + border soft
 *  - elevated: surface + border strong + shadow
 *  - outline: bg trasparente + border strong (pannelli "vuoti")
 *
 * padding: none | sm (12) | md (16) | lg (24)
 * interactive: aggiunge hover/focus per cards cliccabili (ruolo button)
 */
const VARIANTS = {
  default:
    'bg-[var(--color-surface)] border-[var(--color-border-soft)]',
  elevated:
    'bg-[var(--color-surface)] border-[var(--color-border-strong)] ' +
    'shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
  outline:
    'bg-transparent border-[var(--color-border-strong)]',
};

const PADDINGS = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const Card = forwardRef(function Card(
  {
    children,
    variant = 'default',
    padding = 'md',
    interactive = false,
    className = '',
    as: Tag = 'div',
    ...props
  },
  ref
) {
  return (
    <Tag
      ref={ref}
      className={cn(
        'rounded-xl border',
        VARIANTS[variant],
        PADDINGS[padding],
        interactive &&
          'cursor-pointer transition-all duration-150 ' +
            'hover:border-[var(--color-gold-ring)] hover:bg-[rgba(212,175,55,0.04)]',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
});

export default Card;
