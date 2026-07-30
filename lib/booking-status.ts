/** Stored in DB after a shifting/home-service booking is successfully created (post-payment). */
export const BOOKING_STATUS_CONFIRMED = 'booking_confirmed';

export function formatBookingStatus(status: string | null | undefined): string {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === BOOKING_STATUS_CONFIRMED || s === 'confirmed') return 'Booking Confirmed';
  if (!s || s === 'pending') return 'Pending';
  return String(status ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Maps stored status to PDF/UI badge css suffix (existing confirmed styles). */
export function bookingStatusBadgeClass(status: string | null | undefined): string {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === BOOKING_STATUS_CONFIRMED || s === 'confirmed') return 'confirmed';
  if (!s) return 'pending';
  return s.replace(/[^a-z0-9_-]/g, '') || 'pending';
}

export function isPreTripBookingStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  return s === 'pending' || s === 'assigned' || s === 'confirmed' || s === BOOKING_STATUS_CONFIRMED;
}

export function isActiveHomeServiceStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  return s === 'pending' || s === 'assigned' || s === 'confirmed' || s === BOOKING_STATUS_CONFIRMED;
}
