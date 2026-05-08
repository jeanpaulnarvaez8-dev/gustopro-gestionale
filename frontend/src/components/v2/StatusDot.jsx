import { forwardRef } from 'react';
import { cn } from './cn';

/**
 * StatusDot — pallino colorato con halo, per indicatori stato tavoli o sync.
 *
 * tone matches Badge: gold | sea | pine | sand | terracotta | ok | warn | err | info | park | neutral
 * size: xs (8) | sm (10) | md (12) ← default | lg (16)
 * pulse: animazione pulsante (ottima per "in arrivo" / "alert attivo")
 */
const COLORS = {
  gold:       'var(--color-gold)',
  sea:        'var(--color-sea)',
  pine:       'var(--color-pine)',
  sand:       'var(--color-sand)',
  terracotta: 'var(--color-terracotta)',
  ok:         'var(--color-ok)',
  warn:       'var(--color-warn)',
  err:        'var(--color-err)',
  info:       'var(--color-info)',
  park:       'var(--color-park)',
  neutral:    'rgba(240,233,210,0.5)',
};

const SIZES = { xs: 8, sm: 10, md: 12, lg: 16 };

const StatusDot = forwardRef(function StatusDot(
  { tone = 'ok', size = 'md', pulse = false, className = '', style = {}, ...props },
  ref
) {
  const px = SIZES[size];
  const color = COLORS[tone];
  return (
    <span
      ref={ref}
      className={cn('inline-block rounded-full flex-shrink-0', className)}
      style={{
        width: px,
        height: px,
        background: color,
        boxShadow: `0 0 0 ${Math.max(2, px / 4)}px ${color}33`,
        animation: pulse ? 'pulse-gold 1.4s ease-in-out infinite' : undefined,
        ...style,
      }}
      {...props}
    />
  );
});

export default StatusDot;
