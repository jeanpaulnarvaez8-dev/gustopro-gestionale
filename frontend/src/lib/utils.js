export function formatPrice(amount) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount ?? 0);
}

export function formatTime(dateString) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function elapsedMinutes(dateString) {
  if (!dateString) return 0;
  return Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
}

export function formatElapsed(dateString) {
  const mins = elapsedMinutes(dateString);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
