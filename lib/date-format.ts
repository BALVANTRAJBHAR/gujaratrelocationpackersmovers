const IST_TIMEZONE = 'Asia/Kolkata';

function toDate(input: string | Date | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const s = String(input).trim();
  if (!s) return null;
  const isoDateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    const d = new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const legacy = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (legacy) {
    const d = new Date(Number(legacy[3]), Number(legacy[2]) - 1, Number(legacy[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function partsDDMMYYYY(d: Date): { dd: string; mm: string; yyyy: string } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: IST_TIMEZONE,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
  return { dd: parts.day ?? '00', mm: parts.month ?? '00', yyyy: parts.year ?? '0000' };
}

/** Formats a date as DD-MM-YYYY (Indian: date, month, year). */
export function formatDateDDMMYYYY(input: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  const { dd, mm, yyyy } = partsDDMMYYYY(d);
  return `${dd}-${mm}-${yyyy}`;
}

/** Formats a date/time as DD-MM-YYYY hh:mm am/pm. */
export function formatDateTimeDDMMYYYY(input: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  const { dd, mm, yyyy } = partsDDMMYYYY(d);
  const fmt = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TIMEZONE,
  });
  return `${dd}-${mm}-${yyyy} ${fmt.format(d)}`;
}
