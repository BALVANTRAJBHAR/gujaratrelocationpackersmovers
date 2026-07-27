import { Platform } from 'react-native';

let razorpayScriptPromise: Promise<boolean> | null = null;

async function loadRazorpayScript(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if ((window as any).Razorpay) return true;
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(Boolean((window as any).Razorpay));
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

/** Shared checkout entry point for bookings and wallet top-ups. */
export async function openRazorpayCheckout(options: any): Promise<any> {
  if (Platform.OS === 'web') {
    if (!(await loadRazorpayScript())) throw new Error('Razorpay unavailable on web');
    return new Promise((resolve, reject) => {
      const checkout = new (window as any).Razorpay({
        ...options,
        handler: resolve,
        modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
      });
      checkout.open();
    });
  }
  const RazorpayCheckout = require('react-native-razorpay').default;
  return RazorpayCheckout.open(options);
}
