# Client Handover – PackersMovers (Expo + React Native)

## 1) Client se kya-kya details/credentials leni hongi

### A) Branding & Business
- App/Company name (exact spelling)
- Logo (SVG/PNG, 1024x1024)
- Brand colors (primary/accent)
- Support phone, WhatsApp number, support email
- Office address + GSTIN (agar invoice generate karna hai)
- Terms & Privacy Policy text (ya existing website link)

### B) Domains / Web
- Domain name (example: clientname.com)
- DNS access (GoDaddy/Namecheap/Hostinger login) ya DNS records add karne ka access
- Web hosting preference (Expo web export + static hosting) – Netlify/Vercel/Cloudflare Pages/any

### C) App Stores
- Google Play Console access (new account ya existing)
- Apple Developer account access (agar iOS publish karna hai)
- App signing keys policy (recommended: Play App Signing enabled)

### D) Backend (Supabase)
- Supabase project URL
- Supabase anon key (public)
- Service role key (private) – **server-side only** (Edge Functions/Backend)
- Database schema ownership & RLS policy owner
- Storage bucket setup (uploads)

### E) Maps / Location
- Map provider (Mapbox) account
- Mapbox access token(s)
- Billing enabled (Map APIs ke liye)

### F) Notifications (optional but recommended)
- Push notifications: Expo push / FCM configuration
- Email provider (SendGrid/Mailgun) or SMS provider

### G) OTP / SMS (agar app me OTP verify hai)
- SMS/OTP provider credentials (MSG91/Twilio/etc)
- Sender ID / Template IDs (India DLT compliance)

### H) Payments (Razorpay)
- Razorpay account (Business KYC completed)
- **Live Key ID / Live Key Secret**
- Webhook secret
- Settlement bank details

---

## 2) Project ko locally kaise run karein

### Prerequisites
- Node.js: `20.x`
- Android Studio (Android) / Xcode (iOS)
- Expo CLI via npx (project scripts)

### Install
```bash
npm install
```

### Start (Development)
```bash
npm run start
```

### Run Android / iOS (dev build)
```bash
npm run android
npm run ios
```

### Run Web
```bash
npm run web
```

---

## 3) Environment / Configuration

Project me keys/URLs generally code ya config files me aate hain. Deployment se pehle:
- Supabase URL + anon key update
- Mapbox token update
- Razorpay key id update (web + native)

**Security rule:**
- `Razorpay Key Secret` aur `Supabase service role key` kabhi client app (frontend) me hardcode nahi karni.
- Secret keys sirf server-side (Supabase Edge Functions / backend) par.

---

## 4) Live Payment (Razorpay) enable kaise karein

### Step 1: Razorpay KYC + Live mode
- Razorpay dashboard me business KYC complete
- Live mode enabled

### Step 2: Keys
- Dashboard → Settings → API Keys:
  - Live Key ID (frontend)
  - Live Key Secret (server)

### Step 3: Server-side order creation
- Payment flow recommended:
  1) App calls server/edge function: `create_order(amount, currency, receipt)`
  2) Server uses **Live Key Secret** to create order
  3) App opens Razorpay checkout with **Key ID** + order_id
  4) After payment, app sends `payment_id, order_id, signature` to server
  5) Server verifies signature (HMAC SHA256) and marks booking paid

### Step 4: Webhook (recommended)
- Webhook URL: (Supabase Edge Function endpoint)
- Events:
  - `payment.captured`
  - `payment.failed`
- Webhook secret store server-side

### Step 5: Test to Live switch checklist
- Test key replace with live key
- Amount rounding rules
- Refund policy notes
- Ensure signature verification is enforced

---

## 5) Deployment options (recommended)

### A) Web deployment (static)
- Build web:
```bash
npm run build:web
```
- Output: `dist/`
- Host `dist/` on Netlify/Vercel/Cloudflare Pages

### B) Android APK/AAB
- Recommended: EAS Build (Expo)
- Generate AAB for Play Store

### C) iOS
- EAS Build + TestFlight + App Store submission

---

## 6) Operations & Support (AMC scope)

Recommended AMC includes:
- Bug fixes (limited hours/month)
- Server monitoring (Supabase functions/logs)
- Payment webhook monitoring
- Minor UI changes
- Dependency upgrades (monthly/quarterly)

---

## 7) Ownership handover
- GitHub repo access (client org recommended)
- Supabase project ownership transfer (or admin access)
- Razorpay account stays with client
- Play Console/Apple Dev stays with client

---

## 8) Quick Troubleshooting
- `npm install` fails: delete `node_modules` and reinstall
- Android build issues: run Gradle sync / ensure correct JDK
- Payments failing: check key id, order creation function, signature verification
