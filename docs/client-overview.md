# गुजरात रिलोकेशन पैकर्स एंड मूवर्स — पूरा ऐप गाइड (Client Document)

> यह डॉक्यूमेंट आपके **Mobile App** और **Web Application** दोनों के हर फीचर को आसान भाषा में समझाता है —
> क्या है, कैसे इस्तेमाल करें, और **क्या करने पर क्या होता है**।

---

## 1. एक नज़र में — यह App क्या है?

यह एक पूरा **रिलोकेशन / हाउस-शिफ्टिंग + होम सर्विस + प्रॉपर्टी मार्केटप्लेस** प्लेटफॉर्म है।

- **Mobile App** (Android/iOS) और **Web App** (Browser/Desktop) — दोनों में फ़ीचर बिल्कुल एक जैसे हैं
- **4 तरह के उपयोगकर्ता (Roles):**
  - **Customer** — शिफ्टिंग बुक करता है, होम सर्विस लेता है, प्रॉपर्टी ढूंढता है
  - **Provider (सर्विस पार्टनर)** — Home Service provider (AC / प्लंबर / पेंटर आदि) या Property Owner
  - **Driver** — वाहन वाला जो सामान उठाता/पहुंचाता है
  - **Admin / Staff** — पूरी app मैनेज करने वाली टीम

---

## 2. Account कैसे बनाएं और Login कैसे करें?

| कदम | क्या करें | क्या होता है |
|---|---|---|
| Register | नाम, मोबाइल नंबर, email/password, या Google/Facebook से sign up | मोबाइल पर **6 अंकों का SMS OTP** आता है |
| OTP Verify | OTP डालें (5 बार तक गलत ट्राई कर सकते हैं, 10 मिनट तक वैध) | अकाउंट activate हो जाता है |
| Referral | किसी के referral code/link से signup करें | code रिकॉर्ड हो जाता है, पहली बुकिंग पर इनाम (नीचे देखें) |
| Role | Register के समय role चुनें (Customer/Driver/Provider) | हर role को अपना-अपना dashboard मिलता है |
| Profile | नाम बदलें, password बदलें, phone बदलें (नए OTP से), Aadhaar जोड़ें | सब save होता है |

> 🔐 Password भूल गए? → "Forgot password" से email पर reset link आता है।

---

## 3. Shifting बुकिंग (घर/ऑफिस/वाहन/स्टोरेज शिफ्टिंग) — Step by Step

App खोलते ही **Book Shifting** बटन दिखता है। बुकिंग 5 चरणों में होती है:

1. **Service (तयार)** — शिफ्टिंग का प्रकार: Home / Office / Vehicle / Storage
2. **Location** — पुराने और नए दोनों पते नक्शे पर मार्क करें
3. **Vehicle** — वाहन की लिस्ट आती है: **Base Price + Per-Km + Labour Price** के हिसाब से। Floor/Lift के सरचार्ज अपने आप जुड़ते हैं
4. **Items / फोटो** — सामान की फोटो (max 10) upload करें
5. **Payment** — नीचे विस्तार से

**कुल हिसाब:** `पिकअप-ड्रॉप दूरी × rate + वाहन + labour + floor/lift + GST (18%) − Coupon − Wallet = कुल राशि`

### Payment के तरीके
- **मोड:** Advance (मिनिमम) या **Full** भुगतान
- **तरीका:** UPI / Card (Razorpay से ऑनलाइन) या **बुकिंग के बाद cash** (ड्राइवर को)
- **Coupon code** — discount लगता है (usage limit और expiry के साथ)
- **Wallet balance** से भी काटी जा सकती है

### बुकिंग करते ही क्या होता है?
- ✅ Booking **Confirm** — ग्राहक को **email + push + in-app notification**
- 📄 **Bill की email** ("Booking Confirmed" — booking ID के साथ)
- 📢 Admin को notification
- 🔁 **Referral reward** (अगर लागू हो)
- "My Bookings" में बुकिंग दिखने लगती है

### बुकिंग की स्थितियाँ (Status)
| Status | मतलब |
|---|---|
| Confirmed | बुकिंग स्वीकार हुई |
| Assigned | Admin ने driver नियुक्त किया |
| Accepted | Driver ने बुकिंग accept कर ली |
| Not Started | Driver रास्ते में है |
| Pickup Reached | Driver पिक-अप पहुंच गया |
| In Transit | सामान-वाला वाहन रास्ते में है |
| Delivered | सामान पहुंच गया, शिफ्टिंग complete |

**हर status बदलने पर ग्राहक और Admin को push + ज़रूरी email मिलती है।**

### 🚚 OTP System — काम का पक्का सबूत
- हर बुकिंग पर **2 अलग 4-digit OTP** बनते हैं — एक **Pickup OTP**, एक **Delivery OTP**
- ग्राहक के app में पहले **Pickup OTP** दिखता है; जैसे ही driver pickup verify करता है, वहां **अपने आप Delivery OTP दिखने लगता है**
- **Driver कोई वाले**: घटी पर ड्राइवर ग्राहक से **Pickup OTP** मांगकर डालता है → मिलान सही हुआ तभी status **"Pickup Reached"** होता है
- सामान उठाने के बाद **In Transit** — Driver अमेरिकी मार्क करता है
- ड्राइवर पर पहुंचकर ग्राहक से **Delivery OTP** मांगकर डालता है → उसी के बाद **Delivered** mark होता है
- **यह OTP Server-side verify होता है; drivers को OTP ऐप में दिखता ही नहीं है** — सुरक्षा के लिए

### 🛰️ Live Tracking
- **Track** बटन से नक्शे पर **ड्राइवर की लाइव location** (हर 8–10 सेकंड अपडेट) + status change पर साउंड
- बिना login भी **sharing link / booking ID** से कोई भी status देख सकता है (जैसे परिवार)

### Reschedule / Cancel / Bill
- **Reschedule** — नई date+time चुनें → सभी को email+push
- **Cancel** — confirm करके cancel → email+push
- **Bill** (email) — कुल राशि, Advance Paid, Remaining — एक बटन से भेजें

### ⭐ Feedback (रेटिंग)
Delivered होते ही **ग्राहक को** ड्राइवर की रेटिंग का popup आता है:
- **1–5 stars** + tags (जैसे "Mera経験") + optional comment — या **Skip** (Skip करने पर दोबारा नहीं पूछा जाता)
- उसी तरह **ड्राइवर को भी** ग्राहक की रेटिंग पूछी जाती है (दोनों एक-दूसरे को रेट करते हैं)
- रेटिंग सिर्फ **Admin को दिखती है** (रेटिंग देने वाला अपनी रेटिंग देख सकता है)

---

## 4. Home Services (AC, कारपेंटर, इलेक्ट्रिशियन, प्लंबर, पेस्ट कंट्रोल, डीप क्लीनिंग, पेंटिंग, RO)

1. **Home Services** tab → सर्विस चुनें
2. 5-step wizard: सर्विस → विवरण/फोटो → **Payment ऑप्शन** (अभी Online करो **या Service के बाद** — Cash/Online) → Confirm
3. Request बनते ही:

| किसे | क्या मिलता है |
|---|---|
| ग्राहक | Email + Push: "आपकी request confirm हुई" |
| उसी service के सभी Providers (सही शहर/राज्य) | Push + notification: "नई Request आई" — **पहले Accept करने वाले को काम मिलता है** |
| Admin | Push + inbox |

4. **Provider Accept** → ग्राहक को "Provider ने request स्वीकार की" + Provider की जानकारी
5. **काम पूरा होने पर (Provider की ओर से):**
   - "Mark Work Done" दबाते ही सिस्टम **4-digit Completion OTP** बनाकर ग्राहक को push करता है
   - ग्राहक के app में OTP तुरंत दिखता है
   - ग्राहक OTP बताता है → Provider उसे dalake **Verify** → **Service Completed** + email/push
   - अगर "after service cash" था तो cash **PAID मार्क** भी अपने-आप होता है
6. **फिर दो तरफ के Feedback** खुलते हैं — ग्राहक provider को रेट करता है, provider ग्राहक को

> Admin भी status बदल सकता है (pending → assigned → completed/cancelled) और reschedule कर सकता है — देरी हो तो admin हस्तक्षेप करता है।

---

## 5. Properties (प्रॉपर्टी — Rent/Sale/Shop)

### Owner के लिए (property_owner role)
- **Post Property** — पूरा form: type, BHK, price, फोटो/videos। Post करते ही **Admin को email+push** जाती है
- Admin के **Publish** करने पर ही listing सबको दिखती है (draft → published)
- Owners के dashboard (Properties tab) में:
  - Customers के **inquiry/bookings** — **Confirm / Reject**
  - **Visit Meetings List** — Date/Time के साथ → **Confirm / Reject** → दोनों को email + push
  - Listing के followers की संख्या

### Customer ke liye
- **Search** — फ़िल्टर: city/state, BHK, price range, listing type (+ प्रीमियम प्लान वाले ज़्यादा फ़िल्टर) (Power ₹2,399 / Expert ₹4,999 / Moneyback ₹5,999)
- **Property page** पर:
  - **Subscribe (Follow)** — फ्री, "मुझे अपडेट मिले" → हर बदलाव पर **email + push**
  - **Schedule a visit (मीटिंग)** — date+time चुनें → Owner को email/पुश → Owner confirm/reject → आपको status
  - **Send Inquiry** — message + Owner को email/पुश (name+phone के साथ)
  - **Call / WhatsApp** — direct
  - Owner status बदलें → आपको confirm/cancel की push+email

---

## 6. वॉलेट, Referral, Coupons, Notifications

### Wallet
- Balance दिखा + **Add Money** (₹100–₹5000, Razorpay) — booking/home-service payment में wallet से कट
- ज़्यादा payment करने पर **wallet में refund** भी
- हर transaction की entry — सिर्फ आपको दिखती है

### Refer & Earn
- अपना unique link/share message ("Get ₹500 cashback…") जो नए को दें → उसकी पहली बुकिंग पर **दोनों को ₹500 wallet credit**

### Coupons
- Home स्लाइडर में coupon दिखते हैं (Fixed/Flat types; min order; usage limit; expiry) — booking पर apply करें

### Notifications
- सभी in-app नोटिफिकेशन यहां: booking OTP, driver reminders, property updates, provider accepts...
- Tap करते ही संबंधित स्क्रीन (tracking/booking) खुल जाती हैं

---

## 7. Support & AI Chat

- Call बटन, **WhatsApp** (auto message + booking ID), Email
- **AI Support Chat** — app के अंदर तुरंत उत्तर: "कैसे track करें…" reschedule, cancel, payment... — इंसान के human WhatsApp तक भेजता है
- **Callback request** (होम पर form) — बिना login; हर बार **Admin को email** + push (device details के साथ)

---

## 8. Driver App (ड्राइवर वाली ऐप)

- **Upcoming list** — assigned bookings; **Completed** list
- **Accept booking** बटन
- **Navigate** — Google Maps से pickup/drop पहुंचना
- **Start Tracking** — लाइव लोकेशन सर्वर भेजना (ग्राहक को दिखे)
- **Pickup OTP verify** → "Pickup Reached"
- **In Transit** — ड्राइवर मार्क करता है
- **Delivery OTP verify** → **Delivered** → tracking बंद → customer email/push
- **Feedback popup** — ग्राहक को rate करना
- **Reminder** — pickup से **45–90 मिनट पहले** "पिकअप 1 घंटे में" push (क्रोन job हर 10 min)

---

## 9. Admin Panel (Web + Mobile दोनों का सबसे बड़ा भाग)

| Section | क्या कर सकते हैं |
|---|---|
| **Dashboard stats** | Total/Pending/Cancel, paid/unpaid counts |
| **Bookings** | Filter + driver **Assign/Unassign**, Track, Cancel, Reschedule, payment status |
| **Home Services** | सभी request + status बदलें (pending/assigned/completed/cancelled), reschedule, media देखो |
| **Properties** | Listings पब्लिश/अनपब्लिश, Delete, Media देखना, property bookings confirm/cancel |
| **Coupons** | Add/edit/disable coupons |
| **Users** | Search, role बदलें, Active/Inactive, **KYC/docs** (Aadhaar/PAN/license + OCR pickup) |
| **Vehicles & Floors** | दर/फोटो मैनेज |
| **Quote Requests** | Remark, status (pending/complete/cancelled), email भेजना, CSV/PDF |
| **Reports & Analytics** | Total, Advance/Remaining, driver performance, top drivers, मासिक report, CSV/PDF |
| **Feedback** | सब ratings (ड्राइवर, हाउस, ओर) — average, tags, CSV |
| **Audit Log / Admin History** | किस ड्राइवर को कब verified, action logs export |
| **Staff Management** | staff/worker/driver बनाना + documents verify (OCR) |
| **Manage Locations** | State/City **Add/Edit/Delete** (+ CSV import/export, PDF report |

> Admin के प्रत्येक सेक्शन में **CSV/PDF Export** भी दिखता है।

---

## 10. यांत्रिकी (Backend) — सरल शब्दों में

1. **Security (RLS)**: हर टेबल पर policies — उपयोगकर्ता सिर्फ अपनी चीज़ें देखता है, **admin/staff ही सब**
2. **API (Edge Functions)** — राज़ Transactions पर: payments, OTP, emails, push
3. **Payments** — सुरक्षित प्रक्रिया: Razorpay Order → Checkout → **Webhook** सर्वर पर paid/failed mark → booking update
4. **Notifications** — हर event पर 3 चैनल: **Mobile push (Expo) + Web push + In-app + Email (SMTP)**
5. **OTP दो प्रकार** — SMS OTP (register/booking) और **In-app 4-digit** (pickup/delivery/च completion)
6. **Driver Reminder** — Cron जोड़ता है (हर 10 मिनट) स्लॉट से 45–90 मिनट बाकी वालों को push
7. **Maps** — सारे Google Maps कॉल्स server proxy से आते हैं (key सुरक्षित)
8. **Referrals/Wallet** — Transactions ledger (wallet_transactions), ₹500 दोनों को पहली बुकिंग पर इस भी auto

---

## 11. Quick Reference — "क्या करने पर क्या होता है?"

| आप क्या करते हैं | क्या होता है |
|---|---|
| Shifting बुक | तुरंत Confirm (push+email+in-app), बिल email, admin + drivers notification |
| Coupon apply | Pricing में discount |
| Online payment | Webhook paid मार्क → booking payment_status = paid |
| Admin driver assign | Driver को push + ग्राहक को Assigned + driver info |
| Driver pickup OTP verify | Status: Pickup Reached; **आपको Delivery OTP दिखने लगती है** |
| Driver In Transit | Status: In Transit + push |
| Driver delivery OTP verify | Status: Delivered → email + push → tracking बंद → बनता Feedback |
| ग्राहक feedback | Admin Feedback tab में entrance |
| Home Service request | Customer confirm email + सभी providers (शहर) को push → पहला accept |
| Provider work done | 4-digit Completion OTP → Customer push |
| Provider OTP verify | Service Completed → email + push + feedback (दोनों तरफ) |
| Cash payment (after service) | Cash Paid मार्क + वही completion email |
| Property post | Admin email+push; publish पर अपार published |
| Property follow off | Owner को push/अंग; property update पर followers को |
| Visit meeting request | Owner email+push → confirm/reject → आपको email+push |
| Property inquiry | Owner email+push (आपके contact), admin push |
| Referral + first booking | आपको + ₹500 each wallet |
| A driver की 45–90 min भाग | उसे Pickup-in-1hr push |
| Admin location edit/delete | State/City तुरंत सब में लागू |
| AI assistant chat | instant answer + history |

---

## 12. अभी नहीं है / भविष्य में (क्लाइंट जानकारी के लिए)

- **Driver earnings/Tip मॉड्यूल** अभी ऐप में नहीं है (feature request के रूप में जोड़च सकता है)
- **Web पर कुछ admin flows** सिर्फ export/print आदि — मुख्य workings वेब मुहैया
- बिल की email **manual** भेजी जाती है (payment webhook से auto नहीं)

---

*यह डॉक्यूमेंट आज के ऐप के वर्तमान behaviors पर आधारित है। फीचर बदलें तो इसे अपडेट किया जा सकता है।*