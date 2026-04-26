import React from 'react';

export type DateTimePickerProps = {
  value: Date;
  mode?: string;
  onChange?: (...args: any[]) => void;
  style?: React.CSSProperties;
  [key: string]: any;
};

export default function AppDateTimePicker(props: DateTimePickerProps) {
  const { value, onChange, style, mode, ...rest } = props;
  const isTime = String(mode ?? '').toLowerCase() === 'time';
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const dd = String(value.getDate()).padStart(2, '0');
  const iso = `${yyyy}-${mm}-${dd}`;

  const hh = String(value.getHours()).padStart(2, '0');
  const min = String(value.getMinutes()).padStart(2, '0');
  const timeValue = `${hh}:${min}`;

  const minDate: Date | null = (rest as any)?.minimumDate instanceof Date ? (rest as any).minimumDate : null;
  const maxDate: Date | null = (rest as any)?.maximumDate instanceof Date ? (rest as any).maximumDate : null;

  const minIso = minDate
    ? `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}-${String(minDate.getDate()).padStart(2, '0')}`
    : undefined;
  const maxIso = maxDate
    ? `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, '0')}-${String(maxDate.getDate()).padStart(2, '0')}`
    : undefined;

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.focus();
      (el as any).showPicker?.();
    } catch {
      // ignore
    }
  };

  return (
    <input
      ref={inputRef}
      type={isTime ? 'time' : 'date'}
      value={isTime ? timeValue : iso}
      min={!isTime ? ((rest as any)?.min ?? minIso) : undefined}
      max={!isTime ? ((rest as any)?.max ?? maxIso) : undefined}
      onClick={openPicker}
      onFocus={openPicker}
      onChange={(e) => {
        const nextVal = (e.target as HTMLInputElement).value;
        if (!nextVal) return;
        if (isTime) {
          const m = /^([0-9]{2}):([0-9]{2})$/.exec(nextVal);
          if (!m) return;
          const next = new Date(value);
          next.setHours(Number(m[1]), Number(m[2]), 0, 0);
          onChange?.(e, next);
          return;
        }
        const d = new Date(`${nextVal}T00:00:00`);
        onChange?.(e, d);
      }}
      style={{
        width: '100%',
        height: 44,
        border: 'none',
        outline: 'none',
        background: 'transparent',
        padding: '0 12px',
        fontSize: 14,
        cursor: 'pointer',
        ...(style ?? {}),
      }}
    />
  );
}
