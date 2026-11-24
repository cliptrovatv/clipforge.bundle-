export function formatBytes(n: number): string {
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(0)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60e3));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
