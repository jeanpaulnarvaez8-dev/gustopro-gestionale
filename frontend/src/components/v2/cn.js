/**
 * Tiny className helper. Filters falsy + concatenates.
 * Usage: cn('a', cond && 'b', false, 'c') => 'a b c'
 */
export function cn(...args) {
  return args.filter(Boolean).join(' ');
}
