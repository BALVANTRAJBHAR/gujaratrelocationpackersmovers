const IST_TIMEZONE = 'Asia/Kolkata';

export function formatDateIST(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: IST_TIMEZONE,
    ...options,
  };
  return d.toLocaleDateString('en-IN', opts);
}

export function formatDateTimeIST(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: IST_TIMEZONE,
    hour12: true,
    ...options,
  };
  return d.toLocaleDateString('en-IN', opts);
}

export function nowIST(): Date {
  const now = new Date();
  const ist = now.toLocaleString('en-US', { timeZone: IST_TIMEZONE });
  return new Date(ist);
}

export function toISTString(date?: Date): string {
  const d = date ?? new Date();
  return d.toISOString();
}
