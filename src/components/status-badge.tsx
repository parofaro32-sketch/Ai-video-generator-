export function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  let cls = 'badge';
  if (['succeeded', 'success', 'healthy', 'available', 'running'].includes(s)) cls += ' badge-success';
  else if (['queued', 'submitting', 'pending', 'warning', 'cooldown'].includes(s)) cls += ' badge-warn';
  else if (['failed', 'error', 'cancelled', 'unavailable'].includes(s)) cls += ' badge-danger';
  else cls += ' badge-info';
  const label = s.replace(/_/g, ' ');
  return <span className={cls}>{label || 'unknown'}</span>;
}
