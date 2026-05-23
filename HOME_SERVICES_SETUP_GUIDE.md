# Home Services Provider Setup - Complete Guide

## 📋 पूरा Flow समझिए (Complete Flow)

### 1️⃣ **Registration Flow**
```
Provider Signup
    ↓
OTP Verification
    ↓
Aadhaar Upload
    ↓
✅ users table में data insert होता है
    ↓
❌ home_service_providers table में अभी कुछ नहीं
    ↓
Provider Profile Setup Screen पर भेज दिया जाता है
```

### 2️⃣ **Provider Profile Setup (आपने कया करना है)**
```
Provider को 2 चीजें Select करनी हैं:

1. Services (क्या काम करते हो?)
   - AC Service
   - Carpenter
   - Electrician
   - Plumber
   - Pest Control
   - Deep Cleaning
   - Painting

2. Cities (किस शहर में काम करते हो?)
   - Ahmedabad, Surat, Vadodara, Rajkot
   - Mumbai, Pune, Nagpur, Nashik
   - Jaipur, Jodhpur, Udaipur, Kota
   - Bhopal, Indore, Jabalpur, Gwalior

Example:
  अगर "Electrician" है और "Ahmedabad" में काम करते हो
  तो home_service_providers में यह entry बनेगी:
  
  {
    user_id: "provider_ka_id",
    service_key: "electrician",
    city: "Ahmedabad",
    is_active: true
  }
```

### 3️⃣ **Customer Booking Flow**
```
Customer Service Request Submit करता है
    ↓
home_service_requests table में insert होता है
    ↓
send-home-service-notification edge function call होता है
    ↓
Function यह करता है:
  • home_service_requests से request details लेता है
  • home_service_providers table से matching providers खोजता है
    (same service_key + same city)
  • उन providers को push notification भेजता है
  • notifications table में log करता है
```

### 4️⃣ **Data Flow Diagram**
```
┌─────────────────────────────────────────┐
│ users TABLE (सभी users यहाँ हैं)        │
│ - id, name, phone, role, etc.          │
│ - expo_push_token                       │
└────────────┬────────────────────────────┘
             │
             ├─────────────────────────────────────┐
             │                                     │
             ↓                                     ↓
    ┌─────────────────────┐          ┌──────────────────────────┐
    │ customers           │          │ home_service_providers   │
    │ (role='user')       │          │ (role='provider')        │
    │                     │          │ - user_id                │
    │                     │          │ - service_key            │
    │                     │          │ - city                   │
    └──────────┬──────────┘          │ - is_active              │
               │                     └──────────────┬───────────┘
               │                                    │
               ├────────────────────────────────────┤
               │                                    │
               ↓                                    ↓
    ┌──────────────────────────┐    ┌─────────────────────────┐
    │ home_service_requests    │    │ Matching Providers Found│
    │ (new service request)    │    │ ✅ Notification Sent    │
    │ - customer_name          │    │                         │
    │ - service_key            │    │ (via expo push token)   │
    │ - city                   │    └─────────────────────────┘
    │ - preferred_date         │
    │ - preferred_time         │
    │ - status='pending'       │
    └──────────────────────────┘
```

---

## ✅ क्या Complete हो गया (What's Done)

1. ✅ **Date Format Fix** - DD/MM/YYYY → YYYY-MM-DD conversion
2. ✅ **Notification Edge Function** - `send-home-service-notification`
3. ✅ **Provider Table** - `home_service_providers` migration (043)
4. ✅ **Provider Profile Screen** - `/app/provider/profile-setup.tsx`
5. ✅ **Registration Redirect** - Providers भेजे जाते हैं profile setup पर
6. ✅ **Push Notifications** - Customers submit करें तो providers को notifications मिलें
7. ✅ **OTP & Phone Verification** - पहले से है, confirm करा दिया
8. ✅ **Better Booking Messages** - "Service provider will reach you on..."

---

## 🧪 Testing Guide (कैसे Test करें)

### Step 1: Migration Run करो (Database Update)
```bash
# Supabase Studio में जाओ या terminal से:
supabase migration up
# या Supabase web console में manual SQL run करो
```

### Step 2: Provider Account बनाओ
1. App खोलो
2. "Register" पर जाओ
3. Role = "Provider" चुनो
4. Name, Phone, OTP verification करो
5. Aadhaar upload करो
6. ✅ Automatically `/provider/profile-setup` पर जाएगा

### Step 3: Provider Profile Setup करो
1. Services select करो (minimum 1)
   - Example: "Electrician" चुनो
2. Cities select करो (minimum 1)
   - Example: "Ahmedabad" चुनो
3. "Save Provider Profile" दबाओ
4. ✅ `home_service_providers` table में entry बन जाएगी

### Step 4: Verify DB Entry
Supabase Studio में check करो:
```sql
SELECT * FROM public.home_service_providers;
-- यह आना चाहिए:
-- user_id: provider_का_id
-- service_key: electrician
-- city: Ahmedabad
-- is_active: true
```

### Step 5: Customer Request करो (दूसरे device/account से)
1. दूसरे account से login करो (customer account)
2. "Home Services" → "Request" पर जाओ
3. Service = "Electrician" चुनो
4. City = "Ahmedabad" चुनो
5. Details भरो
6. Date & Time भरो
7. OTP verify करो
8. Submit करो

### Step 6: Verify Notifications
**Provider को notification मिल गया?**
- Expo push notification dashboard में check करो
- OR Supabase: `SELECT * FROM public.notifications;` में देखो

---

## 📱 Test Credentials

### Provider Account (नया बनाना है)
```
Role: Provider
Phone: Any valid 10-digit number
City: Ahmedabad (या कोई और)
Service: Electrician (या कोई और)
```

### Customer Account (पहले से बना सकते हो)
```
Role: Customer/User
Phone: Any valid 10-digit number
```

---

## 🔄 Flow Summary

```
1. Provider Signup → users table
2. Aadhaar Upload → user_documents table
3. Redirect → Profile Setup Screen
4. Select Services + Cities → home_service_providers table
5. Customer Submit Request → home_service_requests table
6. Trigger Notification Function → send-home-service-notification
7. Find Matching Providers → home_service_providers table से search
8. Send Push → Expo push notification API
9. Log Notification → notifications table
```

---

## ⚠️ Important Notes

**Date Format Fixed:**
```typescript
// पहले (WRONG):
preferred_date: "22/05/2026" ❌ Database error

// अब (CORRECT):
preferred_date: "2026-05-22" ✅ Working
```

**Multiple Users (Concurrency):**
- ✅ Automatically handled by Supabase RLS (Row Level Security)
- हर user अपना data ही access कर सकता है
- Multiple simultaneous bookings = No issues

**OTP + Phone Update:**
- ✅ पहले से implement है
- Registration के साथ काम करता है
- Home services में भी काम करता है

---

## 🚀 Next Steps (Optional Enhancements)

If you want to add more features later:

1. **Provider Rating/Reviews** - customers rate करें
2. **Provider Availability Calendar** - schedule management
3. **Booking Status Updates** - provider → customer updates
4. **Payment Integration** - advance payment
5. **Provider Dashboard** - pending requests देखें
6. **Chat System** - provider ↔ customer communication

---

## 📞 Quick Debug Checklist

| Issue | Solution |
|-------|----------|
| Notification नहीं मिला | Check: expo_push_token in users table |
| Date error फिर आया | Check: toISODateFromDDMMYYYY function |
| Provider profile screen दिखा नहीं | Check: auth/register.tsx line 671 redirect |
| Database में data नहीं | Check: RLS policies enable हैं? |
| Multiple users issue | Check: user_id filters on all queries |

---

## 💡 Key Insight

```
home_service_providers = Provider की Capability Register करने के लिए
↓
जब Customer request करे तो:
  1. Request की service_key देखो
  2. Request की city देखो
  3. home_service_providers में match करो
  4. Matching providers को notify करो
```

---

**Everything is ready! Testing ke liye above steps follow karo.** ✅
