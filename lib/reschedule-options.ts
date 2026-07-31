export const RESCHEDULE_TIME_OPTIONS = [
  '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
  '06:00 PM', '07:00 PM', '08:00 PM',
];

export const isoDayOf = (value: Date | string): string => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const timeLabelTo24h = (timeLabel: string): string => {
  const t = String(timeLabel ?? '').trim().toUpperCase();
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!m) return '12:00';
  let h = Number(m[1]);
  const min = m[2];
  const period = m[3];
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
};

export const todayIso = (): string => isoDayOf(new Date());
