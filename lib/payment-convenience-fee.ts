export const CONVENIENCE_FEE_RATE = 0.0236;

const roundToTwoDecimals = (amount: number) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

/** Adds the payment-processing fee after the existing booking/GST calculation is complete. */
export function calculateConvenienceFee(bookingTotal: number) {
  const total = roundToTwoDecimals(Math.max(Number(bookingTotal) || 0, 0));
  const convenienceFee = roundToTwoDecimals(total * CONVENIENCE_FEE_RATE);
  return {
    bookingTotal: total,
    convenienceFee,
    finalPayable: roundToTwoDecimals(total + convenienceFee),
  };
}
