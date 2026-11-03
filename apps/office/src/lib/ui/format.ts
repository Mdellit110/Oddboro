// Times as the owner reads them: in the office's time zone, short, and relative
// when recent.
import { zone } from '@oddboro/ledger/time';

export function ago(at: string | Date): string {
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function when(at: string | Date): string {
  const PT = zone();
  const d = new Date(at);
  const today = new Date().toLocaleDateString('en-US', { timeZone: PT });
  const day = d.toLocaleDateString('en-US', { timeZone: PT });
  const time = d.toLocaleTimeString('en-US', { timeZone: PT, hour: 'numeric', minute: '2-digit' });
  if (day === today) return time;
  return `${d.toLocaleDateString('en-US', { timeZone: PT, month: 'short', day: 'numeric' })}, ${time}`;
}
