import { useAuthGuard } from '@/lib/auth-guard';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Print from 'expo-print';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, NativeModules, Platform, Pressable, ScrollView, Share, ToastAndroid, View } from 'react-native';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';
let TextRecognition: any = null;
try {
  TextRecognition = require('react-native-text-recognition').default;
} catch (error) {
  console.warn('Text recognition unavailable on this device, OCR features will be disabled.', error);
}

import MobileDatePicker from '@/components/MobileDatePicker';
import PageHeader from '@/components/PageHeader';
import RescheduleDialog from '@/components/RescheduleDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { themes } from '@/constants/theme';
import { removeStaleRealtimeChannel, supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { t } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '@/lib/date-format';
import { timeLabelTo24h } from '@/lib/reschedule-options';
import { FontAwesome5 } from '@expo/vector-icons';

type DriverProfile = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  document_type: string | null;
  document_number: string | null;
  license_doc_url: string | null;
  id_doc_url: string | null;
  is_verified: boolean | null;
  created_at: string | null;
};

type UserDocument = {
  id: string;
  user_id: string;
  document_type: string;
  document_number: string;
  image_url: string | null;
  created_at: string;
};

type PendingUserDocument = {
  key: string;
  document_type: string;
  document_number: string;
  image_uri: string | null;
};

type BookingUploadRow = {
  id: string;
  booking_id: string;
  file_url: string | null;
  file_type: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string | null;
  uploaded_at: string | null;
};

const normalizeOcrText = (lines: string[]) => {
  return (lines ?? [])
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .trim();
};

const normalizeOcrToken = (value: string) => {
  const raw = (value ?? '').toUpperCase();
  const swapped = raw
    .replace(/\bO\b/g, '0')
    .replace(/\bI\b/g, '1')
    .replace(/\bL\b/g, '1')
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-')
    .trim();
  return swapped;
};

const findBestByScore = (candidates: string[], score: (value: string) => number) => {
  let best: { value: string; score: number } | null = null;
  for (const c of candidates) {
    const s = score(c);
    if (s <= 0) continue;
    if (!best || s > best.score) best = { value: c, score: s };
  }
  return best?.value ?? null;
};

const verhoeffValidate = (num: string) => {
  const s = (num ?? '').replace(/\D/g, '');
  if (s.length !== 12) return false;
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  let c = 0;
  const digits = s.split('').map((x) => Number(x));
  for (let i = 0; i < digits.length; i++) {
    c = d[c][p[i % 8][digits[digits.length - 1 - i]]];
  }
  return c === 0;
};

const extractDocumentNumber = (
  documentType: 'aadhar' | 'pan' | 'voter' | 'license' | 'other',
  ocrLines: string[]
) => {
  const text = normalizeOcrText(ocrLines);
  if (!text) return null;

  const upper = text.toUpperCase();
  const normalizedLines = (ocrLines ?? []).map((l) => String(l ?? ''));
  const lineUpper = normalizedLines.map((l) => l.toUpperCase());
  const lineText = lineUpper.join('\n');
  const alphaNumOnly = upper.replace(/[^A-Z0-9]/g, '');
  const digitOnly = upper.replace(/\D/g, '');

  const bestFromLineCandidates = (
    candidates: { value: string; lineIndex: number }[],
    score: (value: string, lineIndex: number) => number
  ) => {
    let best: { value: string; score: number } | null = null;
    for (const c of candidates) {
      const s = score(c.value, c.lineIndex);
      if (s <= 0) continue;
      if (!best || s > best.score) best = { value: c.value, score: s };
    }
    return best?.value ?? null;
  };

  if (documentType === 'aadhar') {
    const hasAadhaarHint = /(AADHAAR|AADHAR|UIDAI|UNIQUE|MY\s*AADHAAR)/i.test(upper);
    const hasDobHint = /\bDOB\b|\bDATE\s*OF\s*BIRTH\b|\bYOB\b/i.test(upper);

    const lineCandidates: { value: string; lineIndex: number }[] = [];
    for (let i = 0; i < lineUpper.length; i++) {
      const ln = lineUpper[i];
      const grouped = ln.match(/\b\d{4}\s\d{4}\s\d{4}\b/g) ?? [];
      for (const g of grouped) lineCandidates.push({ value: g.replace(/\s/g, ''), lineIndex: i });
      const digits = ln.replace(/\D/g, '');
      const raw = digits.match(/\d{12}/g) ?? [];
      for (const r of raw) lineCandidates.push({ value: r, lineIndex: i });
    }

    const bestValid = bestFromLineCandidates(lineCandidates, (v, lineIndex) => {
      if (!verhoeffValidate(v)) return 0;
      let s = 40;
      if (/^0{4}/.test(v)) s -= 10;
      if (/^(\d)\1{11}$/.test(v)) s -= 20;

      const ln = lineUpper[lineIndex] ?? '';
      if (/\b\d{4}\s\d{4}\s\d{4}\b/.test(ln)) s += 15;
      if (/(AADHAAR|AADHAR|UIDAI|UNIQUE|MY\s*AADHAAR)/i.test(ln)) s += 8;
      if (/(DOB|DATE\s*OF\s*BIRTH|YOB)/i.test(ln)) s -= 10;
      if (hasAadhaarHint) s += 5;
      if (hasDobHint && (ln.includes(v.slice(0, 4)) || ln.includes(v.slice(4, 8)))) s -= 3;
      return s;
    });

    if (bestValid) return bestValid;

    const fallbackCandidates = Array.from(new Set(digitOnly.match(/\d{12}/g) ?? []));
    return (
      findBestByScore(fallbackCandidates, (v) => {
        let s = 10;
        if (/^0{4}/.test(v)) s -= 6;
        if (/^(\d)\1{11}$/.test(v)) s -= 9;
        if (hasAadhaarHint) s += 4;
        if (hasDobHint && upper.includes(v.slice(0, 4))) s -= 3;
        return s;
      }) ?? null
    );
  }

  if (documentType === 'pan') {
    const hasPanHint = /(INCOME\s*TAX|PERMANENT\s*ACCOUNT\s*NUMBER|PAN\b)/i.test(upper);
    const lineCandidates: { value: string; lineIndex: number }[] = [];
    for (let i = 0; i < lineUpper.length; i++) {
      const cleaned = lineUpper[i].replace(/[^A-Z0-9]/g, '');
      const ms = cleaned.match(/[A-Z]{5}[0-9]{4}[A-Z]/g) ?? [];
      for (const m of ms) lineCandidates.push({ value: m, lineIndex: i });
    }
    const best = bestFromLineCandidates(lineCandidates, (v, lineIndex) => {
      let s = 20;
      const ln = lineUpper[lineIndex] ?? '';
      if (/(PAN\b|PERMANENT\s*ACCOUNT|INCOME\s*TAX)/i.test(ln)) s += 10;
      if (/(DOB|DATE\s*OF\s*BIRTH)/i.test(ln)) s -= 4;
      if (hasPanHint) s += 4;
      if (v.includes('AAAAA')) s -= 6;
      return s;
    });
    return best;
  }

  if (documentType === 'voter') {
    const hasVoterHint = /(ELECTION\s*COMMISSION|ELECTOR|EPIC|VOTER\b|IDENTITY\s*CARD)/i.test(upper);
    const lineCandidates: { value: string; lineIndex: number }[] = [];
    for (let i = 0; i < lineUpper.length; i++) {
      const cleaned = lineUpper[i].replace(/[^A-Z0-9]/g, '');
      const ms = cleaned.match(/[A-Z]{3}[0-9]{7,8}/g) ?? [];
      for (const m of ms) lineCandidates.push({ value: m, lineIndex: i });
    }
    const best = bestFromLineCandidates(lineCandidates, (v, lineIndex) => {
      let s = 18;
      const ln = lineUpper[lineIndex] ?? '';
      if (/(ELECTION\s*COMMISSION|EPIC|IDENTITY\s*CARD|VOTER\b)/i.test(ln)) s += 8;
      if (/(DOB|DATE\s*OF\s*BIRTH)/i.test(ln)) s -= 4;
      if (hasVoterHint) s += 3;
      if (/^AAA\d{7,8}$/.test(v)) s -= 4;
      return s;
    });
    return best;
  }

  if (documentType === 'license') {
    const normalized = normalizeOcrToken(upper);
    const withoutSpaces = normalized.replace(/[^A-Z0-9]/g, '');
    const hasDlHint = /(DRIVING\s*LICEN[CS]E|DL\b|LICEN[CS]E\s*NO|TRANSPORT)/i.test(lineText);
    const lineCandidates: { value: string; lineIndex: number }[] = [];
    for (let i = 0; i < lineUpper.length; i++) {
      const lnNorm = normalizeOcrToken(lineUpper[i]);
      const cleaned = lnNorm.replace(/[^A-Z0-9]/g, '');
      const ms = cleaned.match(/[A-Z]{2}\d{2}[A-Z0-9]{6,16}/g) ?? [];
      for (const m of ms) lineCandidates.push({ value: m, lineIndex: i });
    }
    const best = bestFromLineCandidates(lineCandidates, (v, lineIndex) => {
      let s = 18;
      const ln = lineUpper[lineIndex] ?? '';
      if (/(DRIVING\s*LICEN[CS]E|DL\b|LICEN[CS]E\s*NO|TRANSPORT)/i.test(ln)) s += 8;
      if (/(DOB|DATE\s*OF\s*BIRTH|VALIDITY|ISSUE)/i.test(ln)) s -= 2;
      if (hasDlHint) s += 3;
      if (/^00/.test(v)) s -= 2;
      if (/^(\d)\1{7,}$/.test(v.slice(4))) s -= 6;
      return s;
    });
    if (best) return best;

    const candidates = withoutSpaces.match(/[A-Z]{2}\d{2}[A-Z0-9]{6,16}/g) ?? [];
    return (
      findBestByScore(candidates, (v) => {
        let s = 10;
        if (hasDlHint) s += 3;
        if (/^00/.test(v)) s -= 2;
        if (/^(\d)\1{7,}$/.test(v.slice(4))) s -= 6;
        return s;
      }) ?? null
    );
  }

  const genericCandidates = alphaNumOnly.match(/[A-Z0-9]{8,16}/g) ?? [];
  const disallow = /^(\d{8,16})$/.test(alphaNumOnly) ? [] : null;
  if (disallow === null) {
    const best = findBestByScore(genericCandidates, (v) => {
      let s = 6;
      if (/\d{4,}/.test(v) && /[A-Z]/.test(v)) s += 2;
      if (/\d{10,}/.test(v) && !/[A-Z]/.test(v)) s -= 3;
      return s;
    });
    return best ?? null;
  }

  return null;
};

const guessDocImageExtFromMime = (mime: string | null | undefined) => {
  const normalized = (mime ?? '').toLowerCase().trim();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('heic')) return 'heic';
  return 'jpg';
};

const guessDocImageContentType = (mime: string | null | undefined, ext: string) => {
  if (mime && mime.includes('/')) return mime;
  const e = (ext ?? '').toLowerCase();
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'heic') return 'image/heic';
  return 'image/jpeg';
};

type BookingAdmin = {
  id: string;
  booking_number?: number | null;
  pickup_address: string | null;
  drop_address: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  drop_lat?: number | null;
  drop_lng?: number | null;
  distance_km?: number | null;
  estimated_price?: number | null;
  final_price?: number | null;
  status: string | null;
  payment_status: string | null;
  payment_method?: string | null;
  driver_id?: string | null;
  advance_amount?: number | null;
  remaining_amount?: number | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  reschedule_date?: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at?: string | null;
  user:
    | { name: string | null; phone: string | null; email: string | null }[]
    | { name: string | null; phone: string | null; email: string | null }
    | null;
  driver: { name: string | null }[] | null;
};

type PaymentReportRow = {
  id: string;
  booking_id: string | null;
  user_id: string | null;
  amount: number | null;
  status: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
  metadata?: any;
  error?: any;
  booking?: {
    payment_method?: string | null;
    status?: string | null;
    payment_status?: string | null;
  } | null;
  user?: { name: string | null; phone: string | null; email: string | null }[] | null;
};

type VehicleTypeAdmin = {
  id: string;
  name: string;
  description: string | null;
  capacity: string | null;
  base_price: number | null;
  per_km_price: number | null;
  labor_price: number | null;
  image_url: string | null;
  is_active: boolean | null;
  vehicle_type?: string | null;
  vehicle_number?: string | null;
  vehicle_model?: string | null;
};

type FloorOptionAdmin = {
  id: string;
  label: string;
  sort_order: number | null;
  charge_with_lift: number | null;
  charge_without_lift: number | null;
  is_active: boolean | null;
};

type StaffProfile = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  is_verified: boolean | null;
  created_at: string | null;
};

type ManagedUser = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  is_verified: boolean | null;
  created_at: string | null;
};

type CouponAdmin = {
  id: string;
  code: string;
  title: string | null;
  discount_type: string | null;
  discount_value: number | null;
  max_discount: number | null;
  min_order_amount: number | null;
  is_active: boolean | null;
  valid_from: string | null;
  valid_until: string | null;
  usage_limit: number | null;
  used_count: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type HomeServiceRequestAdmin = {
  id: string;
  user_id: string;
  service_key: string;
  customer_name: string | null;
  customer_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  state: string | null;
  city: string | null;
  locality: string | null;
  notes: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string | null;
  created_at: string;
  updated_at?: string | null;
  payment_option: string | null;
  payment_status: string | null;
  advance_payment: number | null;
  after_service_payment_method: string | null;
  cash_paid_at: string | null;
  cancelled_at: string | null;
  provider_id: string | null;
  provider_name: string | null;
};

const homeServiceAdminSelect =
  'id,user_id,service_key,customer_name,customer_phone,address_line1,address_line2,state,city,locality,notes,preferred_date,preferred_time,status,created_at,updated_at,payment_option,payment_status,advance_payment,after_service_payment_method,cash_paid_at,cancelled_at,provider_id,provider_name';

const homeServiceAdminBaseSelect =
  'id,user_id,service_key,customer_name,customer_phone,address_line1,address_line2,state,city,locality,notes,preferred_date,preferred_time,status,created_at,updated_at,provider_id,provider_name';

const isMissingHomeServicePaymentColumnError = (error: unknown) => {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return message.includes('payment_option') || message.includes('payment_status') || message.includes('advance_payment');
};

const withHomeServicePaymentDefaults = (rows: unknown) =>
  (((rows as any) ?? []) as any[]).map((row) => ({
    payment_option: null,
    payment_status: null,
    advance_payment: null,
    after_service_payment_method: null,
    cash_paid_at: null,
    cancelled_at: null,
    ...row,
  })) as HomeServiceRequestAdmin[];

const isMissingQuoteColumnError = (error: unknown) => {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return message.includes('quote_requests') && message.includes('does not exist');
};

type QuoteRequestAdmin = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  message: string | null;
  source: string | null;
  status: string | null;
  remark: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type HomeServiceUploadAdmin = {
  id: string;
  request_id: string;
  user_id: string;
  file_url: string;
  file_type: string;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  uploaded_at?: string | null;
};

type PropertyAdmin = {
  id: string;
  owner_user_id: string;
  listing_type: string;
  property_type: string | null;
  title: string | null;
  price: number | null;
  state: string | null;
  city: string | null;
  locality: string | null;
  status: string | null;
  created_at: string;
};

type PropertyUploadAdmin = {
  id: string;
  property_id: string;
  user_id: string;
  file_url: string;
  file_type: string;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  uploaded_at?: string | null;
};

function AdminGuardFallback() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;
  const { isLoading: authLoading, isAuthenticated, error: authError } = useAuthGuard(['admin', 'staff']);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || authError === 'not_authenticated') router.replace('/auth/login' as any);
    else if (authError === 'forbidden') router.replace('/unauthorized' as any);
  }, [authLoading, isAuthenticated, authError, router]);

  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }
  if (!isAuthenticated || authError) return null;

  return <AdminScreenInner />;
}

export default function AdminGuardFallbackWrapper() {
  return <AdminGuardFallback />;
}

function AdminScreenInner() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = params?.section;
  const { session, profile, refreshProfile } = useSession();

  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? themes.dark : themes.light;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteRequestsExportCsvLoading, setQuoteRequestsExportCsvLoading] = useState(false);
  const [quoteRequestsExportPdfLoading, setQuoteRequestsExportPdfLoading] = useState(false);
  const [reportsExportBookingsCsvLoading, setReportsExportBookingsCsvLoading] = useState(false);
  const [reportsExportPaymentsCsvLoading, setReportsExportPaymentsCsvLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const maxContentWidth = 1100;

  useEffect(() => {
    const userId = session?.user?.id ?? '';
    if (!userId) return;

    let active = true;
    const fetchUnread = async () => {
      try {
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('read_at', null);
        if (!active) return;
        setUnreadCount(count ?? 0);
      } catch {
        // ignore
      }
    };

    void fetchUnread();

    const channelName = 'admin-notification-unread';
    removeStaleRealtimeChannel(channelName);

    let channel: any = null;
    try {
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          () => {
            void fetchUnread();
          }
        )
        .subscribe((status, err) => {
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && err) {
            console.warn(`[realtime] ${channelName} error:`, err);
            void supabase.removeChannel(channel);
          }
        });
    } catch (err) {
      console.warn(`[realtime] failed to subscribe ${channelName}:`, err);
    }

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const [activeSection, setActiveSection] = useState<
    'users' | 'vehicles' | 'floors' | 'coupons' | 'bookings' | 'reports' | 'home_services' | 'properties' | 'quote_requests'
  >('bookings');

  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffProfile[]>([]);
  const [bookings, setBookings] = useState<BookingAdmin[]>([]);
  const [bookingStatusCounts, setBookingStatusCounts] = useState<Record<string, number>>({});
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequestAdmin[]>([]);
  const [quoteRequestSearch, setQuoteRequestSearch] = useState('');
  const [quoteRequestStatusFilter, setQuoteRequestStatusFilter] = useState<'all' | 'pending' | 'complete' | 'cancelled'>('all');
  const [quoteStartDate, setQuoteStartDate] = useState('');
  const [quoteEndDate, setQuoteEndDate] = useState('');
  const [quoteStartDatePickerOpen, setQuoteStartDatePickerOpen] = useState(false);
  const [quoteStartPickerValue, setQuoteStartPickerValue] = useState<Date>(new Date());
  const [quoteEndDatePickerOpen, setQuoteEndDatePickerOpen] = useState(false);
  const [quoteEndPickerValue, setQuoteEndPickerValue] = useState<Date>(new Date());
  const [quoteRequestStatusBusyId, setQuoteRequestStatusBusyId] = useState<string | null>(null);
  const [quoteRequestRemarkDrafts, setQuoteRequestRemarkDrafts] = useState<Record<string, string>>({});
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeAdmin[]>([]);
  const [floorOptions, setFloorOptions] = useState<FloorOptionAdmin[]>([]);
  const [coupons, setCoupons] = useState<CouponAdmin[]>([]);

  const [homeServiceRequests, setHomeServiceRequests] = useState<HomeServiceRequestAdmin[]>([]);
  const [hsStatusCounts, setHsStatusCounts] = useState<Record<string, number>>({});
  const [hsStatusFilter, setHsStatusFilter] = useState<'all' | 'pending' | 'assigned' | 'completed' | 'cancelled' | 'rescheduled'>('all');
  const [hsStartDate, setHsStartDate] = useState('');
  const [hsEndDate, setHsEndDate] = useState('');
  const [hsStartDatePickerOpen, setHsStartDatePickerOpen] = useState(false);
  const [hsStartPickerValue, setHsStartPickerValue] = useState<Date>(new Date());
  const [hsEndDatePickerOpen, setHsEndDatePickerOpen] = useState(false);
  const [hsEndPickerValue, setHsEndPickerValue] = useState<Date>(new Date());
  const [hsSearchText, setHsSearchText] = useState('');
  const [homeServiceUploadsOpenId, setHomeServiceUploadsOpenId] = useState<string | null>(null);
  const [homeServiceUploadsBusyId, setHomeServiceUploadsBusyId] = useState<string | null>(null);
  const [homeServiceUploads, setHomeServiceUploads] = useState<Record<string, HomeServiceUploadAdmin[]>>({});
  const [homeServiceStatusBusyId, setHomeServiceStatusBusyId] = useState<string | null>(null);

  const [properties, setProperties] = useState<PropertyAdmin[]>([]);
  const [propertyStatusBusyId, setPropertyStatusBusyId] = useState<string | null>(null);

  const [propSearchText, setPropSearchText] = useState('');
  const [propStatusFilter, setPropStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [propStartDate, setPropStartDate] = useState('');
  const [propEndDate, setPropEndDate] = useState('');
  const [propStartDatePickerOpen, setPropStartDatePickerOpen] = useState(false);
  const [propStartPickerValue, setPropStartPickerValue] = useState<Date>(new Date());
  const [propEndDatePickerOpen, setPropEndDatePickerOpen] = useState(false);
  const [propEndPickerValue, setPropEndPickerValue] = useState<Date>(new Date());

  const [propertyUploadsOpenId, setPropertyUploadsOpenId] = useState<string | null>(null);
  const [propertyUploadsBusyId, setPropertyUploadsBusyId] = useState<string | null>(null);
  const [propertyUploads, setPropertyUploads] = useState<Record<string, PropertyUploadAdmin[]>>({});

  const [propBookings, setPropBookings] = useState<any[]>([]);
  const [propBookingBusyId, setPropBookingBusyId] = useState<string | null>(null);

  const [propBookingSearch, setPropBookingSearch] = useState('');
  const [propBookingStatusFilter, setPropBookingStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [propBookingStartDate, setPropBookingStartDate] = useState('');
  const [propBookingEndDate, setPropBookingEndDate] = useState('');
  const [propBookingStartDatePickerOpen, setPropBookingStartDatePickerOpen] = useState(false);
  const [propBookingStartPickerValue, setPropBookingStartPickerValue] = useState<Date>(new Date());
  const [propBookingEndDatePickerOpen, setPropBookingEndDatePickerOpen] = useState(false);
  const [propBookingEndPickerValue, setPropBookingEndPickerValue] = useState<Date>(new Date());

  const [bookingUploadsOpenId, setBookingUploadsOpenId] = useState<string | null>(null);
  const [bookingUploadsBusyId, setBookingUploadsBusyId] = useState<string | null>(null);
  const [bookingUploads, setBookingUploads] = useState<Record<string, BookingUploadRow[]>>({});

  const fetchBookingUploads = async (bookingId: string) => {
    if (!bookingId) return;
    setBookingUploadsBusyId(bookingId);
    try {
      const { data, error } = await supabase
        .from('booking_uploads')
        .select('id,booking_id,file_url,file_type,file_name,file_size,created_at,uploaded_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });
      if (error) return;
      setBookingUploads((prev) => ({ ...prev, [bookingId]: ((data as any) ?? []) as BookingUploadRow[] }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!String(message ?? '').toLowerCase().includes('abort')) {
        setError(message || 'Failed to fetch booking media.');
      }
    } finally {
      setBookingUploadsBusyId(null);
    }
  };

  const fetchPropertyUploads = async (propertyId: string) => {
    if (!canManage) return;
    if (!propertyId) return;
    setPropertyUploadsBusyId(propertyId);
    try {
      const { data, error } = await supabase
        .from('property_uploads')
        .select('id,property_id,user_id,file_url,file_type,file_name,file_size,created_at,uploaded_at')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: true });
      if (error) {
        setError(error.message);
        return;
      }
      setPropertyUploads((p) => ({ ...p, [propertyId]: ((data as any) ?? []) as PropertyUploadAdmin[] }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to fetch property uploads.');
    } finally {
      setPropertyUploadsBusyId(null);
    }
  };

  const [assignDriverBusy, setAssignDriverBusy] = useState<string | null>(null);
  const [assigningBookingId, setAssigningBookingId] = useState<string | null>(null);

  const [vehicleForm, setVehicleForm] = useState<{
    id: string | null;
    name: string;
    description: string;
    capacity: string;
    vehicle_type: string;
    vehicle_number: string;
    vehicle_model: string;
    base_price: string;
    per_km_price: string;
    labor_price: string;
    image_url: string;
    is_active: boolean;
  }>({
    id: null,
    name: '',
    description: '',
    capacity: '',
    vehicle_type: '',
    vehicle_number: '',
    vehicle_model: '',
    base_price: '',
    per_km_price: '',
    labor_price: '',
    image_url: '',
    is_active: true,
  });

  const [floorForm, setFloorForm] = useState<{
    id: string | null;
    label: string;
    sort_order: string;
    charge_with_lift: string;
    charge_without_lift: string;
    is_active: boolean;
  }>({
    id: null,
    label: '',
    sort_order: '0',
    charge_with_lift: '0',
    charge_without_lift: '0',
    is_active: true,
  });
  const [bookingFilter, setBookingFilter] = useState<
    'all' | 'not_started' | 'assigned' | 'pickup_reached' | 'in_transit' | 'delivered' | 'cancelled' | 'rescheduled'
  >(
    'all'
  );

  const [reportsServiceType, setReportsServiceType] = useState<'all' | 'shifting' | 'home_services' | 'properties'>('all');
  const [reportsStartDate, setReportsStartDate] = useState('');
  const [reportsEndDate, setReportsEndDate] = useState('');
  const [reportsStartDatePickerOpen, setReportsStartDatePickerOpen] = useState(false);
  const [reportsStartPickerValue, setReportsStartPickerValue] = useState<Date>(new Date());
  const [reportsEndDatePickerOpen, setReportsEndDatePickerOpen] = useState(false);
  const [reportsEndPickerValue, setReportsEndPickerValue] = useState<Date>(new Date());
  const [reportsBookings, setReportsBookings] = useState<BookingAdmin[]>([]);
  const [reportsPayments, setReportsPayments] = useState<PaymentReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [bookingStartDate, setBookingStartDate] = useState('');
  const [bookingEndDate, setBookingEndDate] = useState('');
  const [bookingStartDatePickerOpen, setBookingStartDatePickerOpen] = useState(false);
  const [bookingStartPickerValue, setBookingStartPickerValue] = useState<Date>(new Date());
  const [bookingEndDatePickerOpen, setBookingEndDatePickerOpen] = useState(false);
  const [bookingEndPickerValue, setBookingEndPickerValue] = useState<Date>(new Date());
  const [bookingUserFilter, setBookingUserFilter] = useState('');
  const [rescheduleDialogId, setRescheduleDialogId] = useState<string | null>(null);
  const [hsRescheduleDialogId, setHsRescheduleDialogId] = useState<string | null>(null);
  const [cancelHomeServiceModalId, setCancelHomeServiceModalId] = useState<string | null>(null);
  const [cancelBookingDialogId, setCancelBookingDialogId] = useState<string | null>(null);
  const [userSearchText, setUserSearchText] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'customer' | 'driver' | 'staff' | 'admin' | 'worker'>('all');
  const [selectedManagedUserId, setSelectedManagedUserId] = useState<string | null>(null);
  const [managedUserForm, setManagedUserForm] = useState<{
    id: string | null;
    name: string;
    phone: string;
    email: string;
    role: 'customer' | 'driver' | 'staff' | 'admin' | 'worker';
    is_verified: boolean;
  }>({
    id: null,
    name: '',
    phone: '',
    email: '',
    role: 'staff',
    is_verified: true,
  });

  const [userDocuments, setUserDocuments] = useState<UserDocument[]>([]);
  const [documentFormType, setDocumentFormType] = useState<'aadhar' | 'pan' | 'voter' | 'license' | 'other'>('aadhar');
  const [documentFormNumber, setDocumentFormNumber] = useState('');
  const [documentFormImageUri, setDocumentFormImageUri] = useState<string | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [pendingDocuments, setPendingDocuments] = useState<PendingUserDocument[]>([]);
  const [userMgmtInfo, setUserMgmtInfo] = useState<string | null>(null);

  const [docViewerUrl, setDocViewerUrl] = useState<string | null>(null);
  const [docViewerVisible, setDocViewerVisible] = useState(false);
  const [docViewerZoom, setDocViewerZoom] = useState(1);

  const [couponForm, setCouponForm] = useState<{
    id: string | null;
    code: string;
    title: string;
    discount_type: string;
    discount_value: string;
    max_discount: string;
    min_order_amount: string;
    valid_from: string;
    valid_until: string;
    usage_limit: string;
    is_active: boolean;
  }>({
    id: null,
    code: '',
    title: '',
    discount_type: 'percent',
    discount_value: '',
    max_discount: '',
    min_order_amount: '0',
    valid_from: '',
    valid_until: '',
    usage_limit: '',
    is_active: true,
  });

  const nextFloorSortOrder = useMemo(() => {
    const max = floorOptions.reduce((acc, item) => Math.max(acc, item.sort_order ?? 0), 0);
    return String(max + 1);
  }, [floorOptions]);

  const canManage = useMemo(() => {
    return ['admin', 'staff'].includes((profile?.role ?? '').toString().trim().toLowerCase());
  }, [profile?.role]);

  const filteredQuoteRequests = useMemo(() => {
    const search = quoteRequestSearch.trim().toLowerCase();
    return quoteRequests.filter((item) => {
      const haystack = [item.name, item.phone, item.email, item.service, item.source].join(' ').toLowerCase();
      const normalizedStatus = String(item.status ?? '').trim().toLowerCase();
      const statusValue = normalizedStatus === 'completed' ? 'complete' : normalizedStatus === 'canceled' ? 'cancelled' : normalizedStatus;
      const statusMatches = quoteRequestStatusFilter === 'all' || statusValue === quoteRequestStatusFilter;
      const searchMatches = !search || haystack.includes(search);
      const createdDay = item.created_at ? String(item.created_at).slice(0, 10) : '';
      const dateMatches = (!quoteStartDate || createdDay >= quoteStartDate) && (!quoteEndDate || createdDay <= quoteEndDate);
      return statusMatches && searchMatches && dateMatches;
    });
  }, [quoteRequestSearch, quoteRequestStatusFilter, quoteStartDate, quoteEndDate, quoteRequests]);

  const filteredProperties = useMemo(() => {
    const search = propSearchText.trim().toLowerCase();
    return properties.filter((item) => {
      const statusMatches = propStatusFilter === 'all' || String(item.status ?? '').trim() === propStatusFilter;
      const haystack = [item.title, item.locality, item.city, item.state, item.owner_user_id].join(' ').toLowerCase();
      const searchMatches = !search || haystack.includes(search);
      const createdDay = item.created_at ? String(item.created_at).slice(0, 10) : '';
      const dateMatches = (!propStartDate || createdDay >= propStartDate) && (!propEndDate || createdDay <= propEndDate);
      return statusMatches && searchMatches && dateMatches;
    });
  }, [propSearchText, propStatusFilter, propStartDate, propEndDate, properties]);

  const filteredPropBookings = useMemo(() => {
    const search = propBookingSearch.trim().toLowerCase();
    return propBookings.filter((item) => {
      const prop = item.properties;
      const statusMatches = propBookingStatusFilter === 'all' || String(item.status ?? '').trim() === propBookingStatusFilter;
      const haystack = [item.contact_name, item.contact_phone, prop?.title, prop?.city, prop?.locality].join(' ').toLowerCase();
      const searchMatches = !search || haystack.includes(search);
      const createdDay = item.created_at ? String(item.created_at).slice(0, 10) : '';
      const dateMatches = (!propBookingStartDate || createdDay >= propBookingStartDate) && (!propBookingEndDate || createdDay <= propBookingEndDate);
      return statusMatches && searchMatches && dateMatches;
    });
  }, [propBookingSearch, propBookingStatusFilter, propBookingStartDate, propBookingEndDate, propBookings]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const fetchUserDocuments = async (userId: string) => {
    if (!canManage) return;
    const { data, error: fetchError } = await supabase
      .from('user_documents')
      .select('id, user_id, document_type, document_number, image_url, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      const msg = String(fetchError.message ?? '');
      if (msg.includes("Could not find the table 'public.user_documents' in the schema cache")) {
        setUserDocuments([]);
        setUserMgmtInfo('Documents table not found. Apply migration 016_user_documents_table.sql in Supabase, then refresh.');
        return;
      }
      if (!String(fetchError.message ?? '').includes('AbortError')) {
        setError(fetchError.message);
      }
      return;
    }

    setUserDocuments((data ?? []) as UserDocument[]);
  };

  useEffect(() => {
    if (!managedUserForm.id) {
      setUserDocuments([]);
      setPendingDocuments([]);
      setUserMgmtInfo(null);
      return;
    }
    void fetchUserDocuments(managedUserForm.id);
  }, [managedUserForm.id]);

  const resolveUserDocumentImageUrl = (value: string | null | undefined) => {
    const v = String(value ?? '').trim();
    if (!v) return '';
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    const { data } = supabase.storage.from('driver-docs').getPublicUrl(v);
    return data?.publicUrl ?? '';
  };

  const uploadUserDocumentImageAndGetStoragePath = async (effectiveUserId: string, uri: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const uploaderId = auth.user?.id;
    if (!uploaderId) throw new Error('Please login again.');

    const inferredExt = (uri.split('.').pop() || '').toLowerCase();
    const fileExt = inferredExt && inferredExt.length <= 5 ? inferredExt : 'jpg';
    const filePath = `${uploaderId}/${effectiveUserId}/user-doc-raw-${Date.now()}.${fileExt}`;

    const response = await fetch(uri);
    const contentTypeFromFetch = response.headers.get('content-type');
    const fixedExt = fileExt === 'jpg' && contentTypeFromFetch ? guessDocImageExtFromMime(contentTypeFromFetch) : fileExt;
    const finalPath =
      fixedExt !== fileExt ? `${uploaderId}/${effectiveUserId}/user-doc-raw-${Date.now()}.${fixedExt}` : filePath;
    const contentType = guessDocImageContentType(contentTypeFromFetch, fixedExt);
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.length > 10 * 1024 * 1024) {
      throw new Error('Image too large. Max 10MB.');
    }

    const { error: uploadError } = await supabase.storage.from('user-documents-raw').upload(finalPath, bytes, {
      contentType,
      upsert: true,
    });

    if (uploadError) throw new Error(uploadError.message);

    const { data: processed, error: processError } = await supabase.functions.invoke('process-user-document-upload', {
      body: { effective_user_id: effectiveUserId, raw_path: finalPath },
    });

    if (processError) throw new Error(processError.message);
    if (!(processed as any)?.ok) {
      const msg = String((processed as any)?.error ?? '').trim();
      throw new Error(msg || 'Failed to process document image.');
    }
    const storagePath = String((processed as any)?.storage_path ?? '').trim();
    if (!storagePath) throw new Error('Processed storage path missing.');
    return storagePath;
  };

  const recognizeTextFromWebImage = async (uri: string) => {
    const mod = await import('tesseract.js');
    const Tesseract = (mod as any).default ?? mod;
    const result = await Tesseract.recognize(uri, 'eng');
    const text: string = result?.data?.text ?? '';
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines;
  };

  const pickDocumentImage = async (source: 'camera' | 'gallery') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Permission required to pick image.');
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const mime = String((asset as any)?.mimeType ?? '').toLowerCase();
    const uri = String(asset?.uri ?? '');
    const uriLower = uri.toLowerCase();
    if (!uri) return;
    if (!(mime.includes('image/jpeg') || uriLower.endsWith('.jpg') || uriLower.endsWith('.jpeg'))) {
      setError('Only JPG/JPEG images are allowed.');
      return;
    }
    setDocumentFormImageUri(uri);

    try {
      const lines =
        Platform.OS === 'web'
          ? await recognizeTextFromWebImage(uri)
          : TextRecognition?.recognize
            ? await TextRecognition.recognize(uri)
            : [];
      const extracted = extractDocumentNumber(documentFormType, lines);
      if (extracted) {
        setDocumentFormNumber(extracted);
      }
    } catch {
      // ignore
    }
  };

  const openDocViewer = (url: string) => {
    const u = String(url ?? '').trim();
    if (!u) return;
    setDocViewerUrl(u);
    setDocViewerZoom(1);
    setDocViewerVisible(true);
  };

  const closeDocViewer = () => {
    setDocViewerVisible(false);
    setDocViewerUrl(null);
    setDocViewerZoom(1);
  };

  const stageUserDocument = () => {
    if (!managedUserForm.id) {
      setError('Please select a user first.');
      return;
    }

    const document_number = documentFormNumber.trim();
    if (!document_number) {
      setError('Please enter document number.');
      return;
    }

    setError(null);
    setPendingDocuments((prev) => [
      {
        key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        document_type: documentFormType,
        document_number,
        image_uri: documentFormImageUri,
      },
      ...prev,
    ]);
    setDocumentFormNumber('');
    setDocumentFormImageUri(null);
  };

  useEffect(() => {
    if (!section) return;
    const normalized = section.toString().trim().toLowerCase();
    if (
      normalized === 'vehicles' ||
      normalized === 'floors' ||
      normalized === 'coupons' ||
      normalized === 'users' ||
      normalized === 'reports' ||
      normalized === 'home_services' ||
      normalized === 'properties' ||
      normalized === 'quote_requests'
    ) {
      setActiveSection(normalized as typeof activeSection);
    }
  }, [section]);

  const fetchProperties = async () => {
    if (!canManage) return;
    try {
      const { data, error: fetchError } = await supabase
        .from('properties')
        .select('id,owner_user_id,listing_type,property_type,title,price,state,city,locality,status,created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setProperties(((data as any) ?? []) as PropertyAdmin[]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to fetch properties.');
    }
  };

  const updatePropertyStatus = async (propertyId: string, nextStatus: string) => {
    if (!canManage) return;
    if (!propertyId) return;
    setPropertyStatusBusyId(propertyId);
    try {
      const { error: updateError } = await supabase.from('properties').update({ status: nextStatus }).eq('id', propertyId);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      await fetchProperties();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to update status.');
    } finally {
      setPropertyStatusBusyId(null);
    }
  };

  const deleteProperty = async (propertyId: string) => {
    if (!canManage) return;
    if (!propertyId) return;
    setPropertyStatusBusyId(propertyId);
    try {
      const { error: deleteError } = await supabase.from('properties').delete().eq('id', propertyId);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      await fetchProperties();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to delete property.');
    } finally {
      setPropertyStatusBusyId(null);
    }
  };

  const fetchPropBookings = async () => {
    if (!canManage) return;
    try {
      const { data, error: fetchError } = await supabase
        .from('property_bookings')
        .select('id, property_id, user_id, owner_user_id, status, message, contact_name, contact_phone, created_at, updated_at, properties(title, price, city, locality)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setPropBookings(((data as any) ?? []) as any[]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to fetch property bookings.');
    }
  };

  const updatePropBookingStatus = async (bookingId: string, status: string) => {
    if (!canManage) return;
    if (!bookingId) return;
    setPropBookingBusyId(bookingId);
    try {
      const { error: updateError } = await supabase.from('property_bookings').update({ status, updated_at: new Date().toISOString() }).eq('id', bookingId);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      try {
        await supabase.functions.invoke('send-property-notification', {
          body: {
            event_type: 'booking_status_changed',
            booking_id: bookingId,
            status,
            changed_by: 'admin',
          },
        });
      } catch { /* ignore notification failures */ }
      await fetchPropBookings();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to update booking status.');
    } finally {
      setPropBookingBusyId(null);
    }
  };

  const homeServiceLabel = (key: string) => {
    const k = String(key ?? '').trim().toLowerCase();
    if (k === 'ac') return 'AC';
    if (k === 'carpenter') return 'Carpenter';
    if (k === 'electrician') return 'Electrician';
    if (k === 'plumber') return 'Plumber';
    if (k === 'pest') return 'Pest Control';
    if (k === 'cleaning') return 'Deep Cleaning';
  if (k === 'painting') return 'Painting';
  if (k === 'ro') return 'RO Service';
  return key;
  };

  const homeServiceIcon = (key: string): string => {
    const k = String(key ?? '').trim().toLowerCase();
    if (k === 'ac') return 'wind';
    if (k === 'carpenter') return 'hammer';
    if (k === 'electrician') return 'bolt';
    if (k === 'plumber') return 'wrench';
    if (k === 'pest') return 'bug';
    if (k === 'cleaning') return 'broom';
    if (k === 'painting') return 'paint-roller';
    if (k === 'ro') return 'tint';
    return 'tools';
  };

  const fetchHomeServiceRequests = async () => {
    if (!canManage) return;
    try {
      let query = supabase
        .from('home_service_requests')
        .select(homeServiceAdminSelect)
        .order('created_at', { ascending: false })
        .limit(100);

      if (hsStatusFilter !== 'all') {
        query = query.eq('status', hsStatusFilter);
      }
      if (hsStartDate) {
        query = query.gte('created_at', `${hsStartDate}T00:00:00.000Z`);
      }
      if (hsEndDate) {
        query = query.lte('created_at', `${hsEndDate}T23:59:59.999Z`);
      }
      if (hsSearchText) {
        const search = hsSearchText.trim();
        query = query.or(
          `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`
        );
      }

      let { data, error: fetchError } = await query;
      if (fetchError && isMissingHomeServicePaymentColumnError(fetchError)) {
        const fallback = await supabase
          .from('home_service_requests')
          .select(homeServiceAdminBaseSelect)
          .order('created_at', { ascending: false })
          .limit(100);
        data = fallback.data;
        fetchError = fallback.error;
      }
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setHomeServiceRequests(withHomeServicePaymentDefaults(data));

      try {
        let countQuery = supabase.from('home_service_requests').select('status');
        if (hsStartDate) {
          countQuery = countQuery.gte('created_at', `${hsStartDate}T00:00:00.000Z`);
        }
        if (hsEndDate) {
          countQuery = countQuery.lte('created_at', `${hsEndDate}T23:59:59.999Z`);
        }
        if (hsSearchText) {
          const search = hsSearchText.trim();
          countQuery = countQuery.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);
        }
        const { data: countRows, error: countError } = await countQuery;
        if (!countError) {
          const counts: Record<string, number> = {};
          for (const row of (countRows ?? []) as { status: string | null }[]) {
            const key = String(row.status ?? 'unknown');
            counts[key] = (counts[key] ?? 0) + 1;
          }
          setHsStatusCounts(counts);
        }
      } catch { /* ignore count errors */ }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to fetch home service requests.');
    }
  };

  const fetchQuoteRequests = async () => {
    if (!canManage) return;
    try {
      let { data, error: fetchError } = await supabase
        .from('quote_requests')
        .select('id,name,phone,email,service,message,source,status,remark,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (fetchError && isMissingQuoteColumnError(fetchError)) {
        const fallback = await supabase
          .from('quote_requests')
          .select('id,name,phone,email,service,message,source,created_at')
          .order('created_at', { ascending: false })
          .limit(200);
        data = fallback.data;
        fetchError = fallback.error;
      }
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setQuoteRequests(((data as any) ?? []) as QuoteRequestAdmin[]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to fetch quote requests.');
    }
  };

  const notifyDownloaded = (fileName: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(`Downloaded to Downloads folder: ${fileName}`, ToastAndroid.LONG);
    }
  };

  const downloadTextFile = async (opts: { fileName: string; mimeType: string; content: string }) => {
    const { fileName, mimeType, content } = opts;
    const bomContent = content.startsWith('\uFEFF') ? content : `\uFEFF${content}`;
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const blob = new Blob([bomContent], { type: `${mimeType};charset=utf-8;` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }
    // Native: write to temp location then save to public Downloads folder
    const baseDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
    const tempUri = `${baseDir}${fileName}`;
    await FileSystem.writeAsStringAsync(tempUri, bomContent, { encoding: 'utf8' as any });
    const nativePdfDownloader = NativeModules.PdfDownload as { saveToDownloads(src: string, name: string): Promise<string> } | undefined;
    if (Platform.OS === 'android' && nativePdfDownloader) {
      const savedPath = await nativePdfDownloader.saveToDownloads(tempUri, fileName);
      // Single notification: tap to open file (no duplicate toast)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Download complete',
          body: `${fileName} saved to Downloads. Tap to open.`,
          data: { fileUri: savedPath || tempUri },
        },
        trigger: null,
      });
    } else {
      // iOS fallback: share the file
      await Share.share({ url: tempUri, title: fileName });
    }
  };

  const downloadPdfFile = async (fileName: string, html: string) => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // ignore
        } finally {
          setTimeout(() => {
            try {
              document.body.removeChild(iframe);
            } catch {
              // ignore
            }
          }, 1000);
        }
      }, 400);
      return;
    }
    const { uri } = await Print.printToFileAsync({ html });
    const baseDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    const targetUri = `${baseDir}${fileName}`;
    await FileSystem.copyAsync({ from: uri, to: targetUri });
    await Share.share({ url: targetUri, title: fileName });
    notifyDownloaded(fileName);
  };

  const exportQuoteRequestsCsv = async () => {
    if (!quoteRequests.length) {
      setError('No quote requests available to export.');
      return;
    }
    setQuoteRequestsExportCsvLoading(true);
    try {
      const header = ['Name', 'Phone', 'Email', 'Service', 'Source', 'Status', 'Remark', 'Message', 'Created At'];
      const rows = quoteRequests.map((item) => [
        item.name ?? '',
        item.phone ?? '',
        item.email ?? '',
        item.service ?? '',
        item.source ?? '',
        item.status ?? '',
        item.remark ?? '',
        item.message ?? '',
        formatDateTimeDDMMYYYY(item.created_at),
      ]);
      const csv = [header, ...rows]
        .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      await downloadTextFile({
        fileName: `quote-requests-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: 'text/csv',
        content: `\uFEFF${csv}`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to export CSV.');
    } finally {
      setQuoteRequestsExportCsvLoading(false);
    }
  };

  const exportQuoteRequestsPdf = async () => {
    if (!quoteRequests.length) {
      setError('No quote requests available to export.');
      return;
    }
    setQuoteRequestsExportPdfLoading(true);
    try {
      const rows = quoteRequests
        .map(
          (item) => `<tr>
              <td>${String(item.name ?? '').replace(/</g, '&lt;')}</td>
              <td>${String(item.phone ?? '').replace(/</g, '&lt;')}</td>
              <td>${String(item.email ?? '').replace(/</g, '&lt;')}</td>
              <td>${String(item.service ?? '').replace(/</g, '&lt;')}</td>
              <td>${String(item.source ?? '').replace(/</g, '&lt;')}</td>
              <td>${String(item.status ?? '').replace(/</g, '&lt;')}</td>
              <td>${String(item.remark ?? '').replace(/</g, '&lt;')}</td>
              <td>${String(item.message ?? '').replace(/</g, '&lt;')}</td>
              <td>${formatDateTimeDDMMYYYY(item.created_at)}</td>
            </tr>`
        )
        .join('');
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
              h1 { color: #1f2937; }
              table { width: 100%; border-collapse: collapse; margin-top: 16px; }
              th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
              th { background: #f3f4f6; }
              tr:nth-child(even) { background: #fafafa; }
            </style>
          </head>
          <body>
            <h1>Quote Requests Report</h1>
            <p>Exported on ${formatDateTimeDDMMYYYY(new Date())}</p>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Service</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Remark</th>
                  <th>Message</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </body>
        </html>
      `;
      await downloadPdfFile(`quote-requests-${new Date().toISOString().slice(0, 10)}.pdf`, html);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to export PDF.');
    } finally {
      setQuoteRequestsExportPdfLoading(false);
    }
  };

  const fetchHomeServiceUploads = async (requestId: string) => {
    if (!requestId) return;
    setHomeServiceUploadsBusyId(requestId);
    try {
      const { data, error: fetchError } = await supabase
        .from('home_service_uploads')
        .select('id,request_id,user_id,file_url,file_type,file_name,file_size,created_at,uploaded_at')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setHomeServiceUploads((prev) => ({ ...prev, [requestId]: ((data as any) ?? []) as HomeServiceUploadAdmin[] }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to fetch home service uploads.');
    } finally {
      setHomeServiceUploadsBusyId(null);
    }
  };

  const updateHomeServiceStatus = async (
    requestId: string,
    status: string,
    overrides?: { preferred_date?: string; preferred_time?: string; reschedule_date?: string }
  ) => {
    if (!canManage) return;
    if (!requestId) return;
    setHomeServiceStatusBusyId(requestId);
    try {
      setError(null);
      const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === 'rescheduled') {
        payload.reschedule_date = overrides?.reschedule_date ?? null;
        if (overrides?.preferred_date) payload.preferred_date = overrides.preferred_date;
        if (overrides?.preferred_time) payload.preferred_time = overrides.preferred_time;
      }
      const { error: updateError } = await supabase
        .from('home_service_requests')
        .update(payload)
        .eq('id', requestId);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      try {
        await supabase.functions.invoke('send-home-service-notification', {
          body: {
            request_id: requestId,
            status,
            send_email: status === 'rescheduled',
            new_date: overrides?.preferred_date ?? undefined,
            new_time: overrides?.preferred_time ?? undefined,
          },
        });
      } catch {
        // ignore
      }
      await fetchHomeServiceRequests();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'Failed to update status.');
    } finally {
      setHomeServiceStatusBusyId(null);
    }
  };

  const isoDay = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const openWebDatePicker = (initial: string, onSelect: (value: string) => void) => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'date';
    input.value = initial || '';
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);
    const cleanup = () => {
      try {
        document.body.removeChild(input);
      } catch {
        // ignore
      }
    };
    input.onchange = () => {
      const v = String(input.value ?? '').trim();
      if (v) onSelect(v);
      cleanup();
    };
    input.onblur = () => cleanup();
    input.click();
  };

  const openWebDateTimePicker = (initialIso: string, onSelectIso: (value: string) => void) => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'datetime-local';
    if (initialIso) {
      const d = new Date(initialIso);
      if (Number.isFinite(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        input.value = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
      }
    }
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);
    const cleanup = () => {
      try {
        document.body.removeChild(input);
      } catch {
        // ignore
      }
    };
    input.onchange = () => {
      const v = String(input.value ?? '').trim();
      if (v) {
        const d = new Date(v);
        if (Number.isFinite(d.getTime())) {
          onSelectIso(d.toISOString());
        }
      }
      cleanup();
    };
    input.onblur = () => cleanup();
    input.click();
  };

  const ensureReportsDefaultDates = () => {
    if (reportsStartDate && reportsEndDate) return;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    if (!reportsStartDate) setReportsStartDate(isoDay(start));
    if (!reportsEndDate) setReportsEndDate(isoDay(end));
  };

  const fetchReportsBookings = async () => {
    if (!canManage) return;
    ensureReportsDefaultDates();
    const start = reportsStartDate;
    const end = reportsEndDate;

    setReportsLoading(true);
    setReportsError(null);
    try {
      let query = supabase
        .from('bookings')
        .select(
          'id, booking_number, pickup_address, drop_address, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, estimated_price, final_price, status, payment_status, payment_method, driver_id, advance_amount, remaining_amount, scheduled_date, scheduled_time, scheduled_at, created_at, updated_at, user:users!user_id(name, phone, email), driver:users!driver_id(name)'
        )
        .order('created_at', { ascending: false })
        .limit(5000);

      if (start) query = query.gte('created_at', `${start}T00:00:00.000Z`);
      if (end) query = query.lte('created_at', `${end}T23:59:59.999Z`);

      const { data, error: fetchError } = await query;
      if (fetchError) {
        setReportsError(fetchError.message);
        setReportsBookings([]);
      } else {
        setReportsBookings((data ?? []) as BookingAdmin[]);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setReportsError(message || 'Failed to fetch reports.');
      setReportsBookings([]);
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchReportsPayments = async () => {
    if (!canManage) return;
    ensureReportsDefaultDates();
    const start = reportsStartDate;
    const end = reportsEndDate;

    setReportsLoading(true);
    setReportsError(null);
    try {
      let query = supabase
        .from('payments')
        .select(
          'id, booking_id, user_id, amount, status, razorpay_order_id, razorpay_payment_id, created_at, metadata, error, booking:bookings(payment_method, status, payment_status), user:users!user_id(name, phone, email)'
        )
        .order('created_at', { ascending: false })
        .limit(5000);

      if (start) query = query.gte('created_at', `${start}T00:00:00.000Z`);
      if (end) query = query.lte('created_at', `${end}T23:59:59.999Z`);

      const { data, error: fetchError } = await query;
      if (fetchError) {
        setReportsError(fetchError.message);
        setReportsPayments([]);
      } else {
        setReportsPayments((data ?? []) as PaymentReportRow[]);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setReportsError(message || 'Failed to fetch payments report.');
      setReportsPayments([]);
    } finally {
      setReportsLoading(false);
    }
  };

  const createReportsBookingsCsv = async () => {
    const headers = [
      'id',
      'created_at',
      'scheduled_at',
      'scheduled_date',
      'scheduled_time',
      'status',
      'payment_status',
      'payment_method',
      'advance_amount',
      'remaining_amount',
      'distance_km',
      'estimated_price',
      'final_price',
      'pickup_address',
      'drop_address',
      'pickup_lat',
      'pickup_lng',
      'drop_lat',
      'drop_lng',
      'customer_name',
      'customer_phone',
      'customer_email',
      'driver_name',
    ];

    const rows = (reportsBookings ?? []).map((b) => {
      const user = getBookingUser(b as any);
      const driver = getBookingDriver(b as any);
      return [
        b.id ?? '',
        formatDateTimeDDMMYYYY(b.created_at),
        formatDateTimeDDMMYYYY((b as any).scheduled_at),
        (b as any).scheduled_date ? formatDateDDMMYYYY((b as any).scheduled_date) : '',
        (b as any).scheduled_time ?? '',
        b.status ?? '',
        b.payment_status ?? '',
        (b as any).payment_method ?? '',
        (b as any).advance_amount ?? '',
        (b as any).remaining_amount ?? '',
        (b as any).distance_km ?? '',
        (b as any).estimated_price ?? '',
        (b as any).final_price ?? '',
        b.pickup_address ?? '',
        b.drop_address ?? '',
        (b as any).pickup_lat ?? '',
        (b as any).pickup_lng ?? '',
        (b as any).drop_lat ?? '',
        (b as any).drop_lng ?? '',
        user.name ?? '',
        user.phone ?? '',
        user.email ?? '',
        driver.name ?? '',
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  };

  const exportReportsBookingsCsv = async () => {
    setReportsExportBookingsCsvLoading(true);
    try {
      const csv = await createReportsBookingsCsv();
      if (!csv) return;
      await downloadTextFile({
        fileName: `bookings-report-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: 'text/csv',
        content: `\uFEFF${csv}`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setReportsError(message || 'Failed to export bookings CSV.');
    } finally {
      setReportsExportBookingsCsvLoading(false);
    }
  };

  const getPaymentUser = (p: PaymentReportRow) => {
    const u: any = (p as any).user;
    if (!u) return { name: null, phone: null, email: null };
    if (Array.isArray(u)) return u[0] ?? { name: null, phone: null, email: null };
    return u ?? { name: null, phone: null, email: null };
  };

  const createReportsPaymentsCsv = async () => {
    const headers = [
      'id',
      'created_at',
      'booking_id',
      'user_id',
      'user_name',
      'user_phone',
      'user_email',
      'amount',
      'status',
      'payment_method',
      'razorpay_order_id',
      'razorpay_payment_id',
      'error',
      'metadata',
    ];

    const rows = (reportsPayments ?? []).map((p) => {
      const u = getPaymentUser(p as any);
      return [
        p.id ?? '',
        formatDateTimeDDMMYYYY(p.created_at),
        p.booking_id ?? '',
        p.user_id ?? '',
        u.name ?? '',
        u.phone ?? '',
        u.email ?? '',
        (p as any).amount ?? '',
        p.status ?? '',
        (p as any)?.booking?.payment_method ?? '',
        (p as any).razorpay_order_id ?? '',
        (p as any).razorpay_payment_id ?? '',
        p.error ? JSON.stringify(p.error) : '',
        p.metadata ? JSON.stringify(p.metadata) : '',
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  };

  const exportReportsPaymentsCsv = async () => {
    setReportsExportPaymentsCsvLoading(true);
    try {
      const csv = await createReportsPaymentsCsv();
      if (!csv) return;
      await downloadTextFile({
        fileName: `payments-report-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: 'text/csv',
        content: `\uFEFF${csv}`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setReportsError(message || 'Failed to export payments CSV.');
    } finally {
      setReportsExportPaymentsCsvLoading(false);
    }
  };

  const fetchManagedUsers = async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('users')
      .select('id, name, phone, email, role, is_verified, created_at')
      .order('created_at', { ascending: false });

    if (fetchError) {
      if (!String(fetchError.message ?? '').includes('AbortError')) {
        setError(fetchError.message);
      }
    } else {
      setManagedUsers((data ?? []) as ManagedUser[]);
    }
    setLoading(false);
  };

  const assignDriverToBooking = async (
    bookingId: string,
    driverId: string | null,
    previousDriverId?: string | null
  ) => {
    if (!canManage) return;
    setError(null);
    setAssignDriverBusy(bookingId);
    try {
      const payload: Record<string, unknown> = {
        driver_id: driverId,
        updated_at: new Date().toISOString(),
      };
      if (driverId) payload.status = 'assigned';

      const { error: updateError } = await supabase.from('bookings').update(payload).eq('id', bookingId);
      if (updateError) {
        setError(updateError.message);
        return;
      }

      try {
        await supabase.functions.invoke('send-booking-status-push', {
          body: {
            booking_id: bookingId,
            status: driverId ? 'assigned' : 'unassigned',
            old_driver_id: previousDriverId ?? null,
            new_driver_id: driverId,
          },
        });
      } catch {
        // ignore
      }

      setAssigningBookingId(null);
      await fetchBookings();
    } finally {
      setAssignDriverBusy(null);
    }
  };

  const filteredManagedUsers = useMemo(() => {
    let items = managedUsers;
    if (userRoleFilter !== 'all') {
      items = items.filter((u) => (u.role ?? '').toString().toLowerCase() === userRoleFilter);
    }
    const search = userSearchText.trim().toLowerCase();
    if (!search) return items;
    return items.filter(
      (u) =>
        u.name?.toLowerCase().includes(search) ||
        u.phone?.toLowerCase().includes(search) ||
        u.email?.toLowerCase().includes(search)
    );
  }, [managedUsers, userRoleFilter, userSearchText]);

  const selectManagedUser = (u: ManagedUser) => {
    if (selectedManagedUserId === u.id) {
      setSelectedManagedUserId(null);
      setManagedUserForm({
        id: null,
        name: '',
        phone: '',
        email: '',
        role: 'staff' as any,
        is_verified: true,
      });
      setUserDocuments([]);
      setPendingDocuments([]);
      setUserMgmtInfo(null);
      return;
    }

    setSelectedManagedUserId(u.id);
    setManagedUserForm({
      id: u.id,
      name: u.name ?? '',
      phone: u.phone ?? '',
      email: u.email ?? '',
      role: ((u.role ?? 'staff').toString().toLowerCase() as any) || 'staff',
      is_verified: Boolean(u.is_verified ?? true),
    });
    setPendingDocuments([]);
    setUserMgmtInfo(null);
  };

  const saveManagedUser = async () => {
    if (!managedUserForm.id) {
      setError('Please select a user from the list first.');
      return;
    }
    setLoading(true);
    setError(null);
    setUserMgmtInfo(null);

    const payload: Record<string, unknown> = {
      name: managedUserForm.name.trim() || null,
      phone: managedUserForm.phone.trim() || null,
      role: managedUserForm.role,
      is_verified: managedUserForm.is_verified,
    };

    const { error: updateError } = await supabase.from('users').update(payload).eq('id', managedUserForm.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      if (pendingDocuments.length) {
        setDocumentBusy(true);
        try {
          const created_by = profile?.id ?? null;
          const rows: {
            user_id: string;
            document_type: string;
            document_number: string;
            image_url?: string | null;
            created_by?: string | null;
          }[] = [];

          for (const doc of pendingDocuments) {
            let image_url: string | null = null;
            if (doc.image_uri) {
              image_url = await uploadUserDocumentImageAndGetStoragePath(managedUserForm.id, doc.image_uri);
            }
            rows.push({
              user_id: managedUserForm.id,
              document_type: doc.document_type,
              document_number: doc.document_number,
              image_url,
              created_by,
            });
          }

          const { error: insertError } = await supabase.from('user_documents').insert(rows);
          if (insertError) {
            const msg = String(insertError.message ?? '');
            if (msg.includes("Could not find the table 'public.user_documents' in the schema cache")) {
              setUserMgmtInfo('Documents table not found. Apply migration 016_user_documents_table.sql in Supabase, then refresh.');
            } else {
              setError(insertError.message);
            }
          } else {
            setPendingDocuments([]);
            await fetchUserDocuments(managedUserForm.id);
          }
        } finally {
          setDocumentBusy(false);
        }
      }

      await fetchManagedUsers();
      setUserMgmtInfo('Saved successfully.');
      if (Platform.OS !== 'web') {
        Alert.alert('Success', 'Saved successfully.');
      }
    }
    setLoading(false);
  };

  const BOOKING_STATUS_STEPS: { key: string; label: string }[] = [
    { key: 'not_started', label: 'Start' },
    { key: 'pickup_reached', label: 'Pickup reached' },
    { key: 'in_transit', label: 'In Transit' },
    { key: 'delivered', label: 'Delivered' },
  ];

  const normalizeBookingStepperStatus = (status: string | null) => {
    const s = String(status ?? '').trim();
    if (!s) return null;
    if (s === 'pending' || s === 'assigned' || s === 'confirmed') return 'not_started';
    return s;
  };

  const renderBookingStepper = (status: string | null) => {
    const current = normalizeBookingStepperStatus(status);
    const statusIndex = BOOKING_STATUS_STEPS.findIndex((s) => s.key === current);
    return (
      <XStack gap="$2" flexWrap="wrap" alignItems="center">
        {BOOKING_STATUS_STEPS.map((step, idx) => {
          const isActive = statusIndex >= idx && statusIndex !== -1;
          return (
            <XStack key={step.key} alignItems="center" gap="$2">
              <Text
                fontSize={t(13)}
                paddingHorizontal={10}
                paddingVertical={6}
                borderRadius={999}
                backgroundColor={isActive ? theme.accent : theme.bg}
                color={isActive ? '#FFFFFF' : theme.textMuted}>
                {step.label}
              </Text>
              {idx !== BOOKING_STATUS_STEPS.length - 1 ? (
                <Text color={theme.textMuted} fontSize={t(14)}>
                  —
                </Text>
              ) : null}
            </XStack>
          );
        })}
      </XStack>
    );
  };

  const formatTimeAgo = (value: string | null) => {
    if (!value) return '—';
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return '—';
    const diffMs = Date.now() - ts;
    const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    return 'Just now';
  };

  const getBookingUser = (booking: BookingAdmin) => {
    const u: any = (booking as any).user;
    if (!u) return { name: null, phone: null, email: null };
    if (Array.isArray(u)) return u[0] ?? { name: null, phone: null, email: null };
    return u ?? { name: null, phone: null, email: null };
  };

  const getBookingDriver = (booking: BookingAdmin) => {
    const d: any = (booking as any).driver;
    if (!d) return { name: null };
    if (Array.isArray(d)) return d[0] ?? { name: null };
    return d ?? { name: null };
  };

  const toggleDriverStatus = async (userId: string, nextStatus: boolean) => {
    if (!canManage) return;
    setLoading(true);
    const { error: updateError } = await supabase.from('users').update({ is_verified: nextStatus }).eq('id', userId);
    if (updateError) {
      setError(updateError.message);
    } else {
      await fetchDrivers();
    }
    setLoading(false);
  };

  const resetCouponForm = () => {
    setCouponForm({
      id: null,
      code: '',
      title: '',
      discount_type: 'percent',
      discount_value: '',
      max_discount: '',
      min_order_amount: '0',
      valid_from: '',
      valid_until: '',
      usage_limit: '',
      is_active: true,
    });
  };

  const fetchCoupons = async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('coupons')
      .select(
        'id, code, title, discount_type, discount_value, max_discount, min_order_amount, is_active, valid_from, valid_until, usage_limit, used_count'
      )
      .order('created_at', { ascending: false });

    if (fetchError) {
      if (!String(fetchError.message ?? '').includes('AbortError')) {
        setError(fetchError.message);
      }
    } else {
      setCoupons((data ?? []) as CouponAdmin[]);
    }
    setLoading(false);
  };

  const upsertCoupon = async () => {
    if (!canManage) return;
    setError(null);

    const code = couponForm.code.trim().toUpperCase();
    if (!code) {
      setError('Coupon code is required.');
      return;
    }

    const dtype = couponForm.discount_type.trim().toLowerCase();
    if (dtype !== 'percent' && dtype !== 'percentage' && dtype !== 'flat' && dtype !== 'fixed') {
      setError('Discount type must be percent or flat.');
      return;
    }

    const dval = parseOptionalNumber(couponForm.discount_value);
    if (dval === null || dval <= 0) {
      setError('Discount value must be > 0.');
      return;
    }

    setLoading(true);
    const payload: Record<string, unknown> = {
      code,
      title: couponForm.title.trim() ? couponForm.title.trim() : null,
      discount_type: dtype === 'fixed' ? 'flat' : dtype,
      discount_value: dval,
      max_discount: parseOptionalNumber(couponForm.max_discount),
      min_order_amount: parseOptionalNumber(couponForm.min_order_amount) ?? 0,
      valid_from: couponForm.valid_from.trim() ? couponForm.valid_from.trim() : null,
      valid_until: couponForm.valid_until.trim() ? couponForm.valid_until.trim() : null,
      usage_limit: parseOptionalNumber(couponForm.usage_limit),
      is_active: couponForm.is_active,
    };

    const query = couponForm.id
      ? supabase.from('coupons').update(payload).eq('id', couponForm.id).select('*').single()
      : supabase.from('coupons').insert(payload).select('*').single();

    const { data, error: saveError } = await query;
    if (saveError) {
      setError(saveError.message);
      setLoading(false);
      return;
    }

    if (data) {
      setCoupons((prev) => {
        const next = [...prev];
        const idx = next.findIndex((c) => c.id === (data as any).id);
        if (idx >= 0) next[idx] = data as any;
        else next.unshift(data as any);
        return next;
      });
    }

    resetCouponForm();
    setLoading(false);
  };

  const toggleCouponActive = async (id: string, next: boolean) => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.from('coupons').update({ is_active: next }).eq('id', id);
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    await fetchCoupons();
    setLoading(false);
  };

  const filteredStaff = useMemo(() => {
    if (!bookingUserFilter) return staffMembers;
    const search = bookingUserFilter.toLowerCase();
    return staffMembers.filter(
      (member) =>
        member.name?.toLowerCase().includes(search) ||
        member.phone?.toLowerCase().includes(search) ||
        member.email?.toLowerCase().includes(search)
    );
  }, [staffMembers, bookingUserFilter]);

  const fetchDrivers = async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('users')
      .select('id, name, phone, email, is_verified, created_at')
      .eq('role', 'driver')
      .order('created_at', { ascending: false });

    if (fetchError) {
      if (!String(fetchError.message ?? '').includes('AbortError')) {
        setError(fetchError.message);
      }
    } else {
      setDrivers((data ?? []) as DriverProfile[]);
    }
    setLoading(false);
  };

  const uploadVehicleImageAndSetUrl = async () => {
    if (!canManage) return;
    setError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Please allow photo library permissions to pick an image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    const mime = String((asset as any)?.mimeType ?? '').toLowerCase();
    const uriLower = String(asset.uri ?? '').toLowerCase();
    if (!(mime.includes('image/jpeg') || uriLower.endsWith('.jpg') || uriLower.endsWith('.jpeg'))) {
      setError('Only JPG/JPEG images are allowed.');
      return;
    }

    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setError('Please login again.');
        return;
      }

      const fileExt = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      const fileName = `${uid}/${Date.now()}.${fileExt}`;

      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from('vehicle-images')
        .upload(fileName, bytes, {
          contentType: asset.mimeType || `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      setVehicleForm((p) => ({ ...p, image_url: fileName }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image upload failed');
    } finally {
      setLoading(false);
    }
  };

  const uploadVehicleImageFromWebFileAndSetUrl = async (file: File) => {
    if (!canManage) return;
    setError(null);
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setError('Please login again.');
        return;
      }

      const name = String((file as any)?.name ?? '').toLowerCase();
      const type = String((file as any)?.type ?? '').toLowerCase();
      if (!(type.includes('image/jpeg') || name.endsWith('.jpg') || name.endsWith('.jpeg'))) {
        setError('Only JPG/JPEG images are allowed.');
        return;
      }
      const inferredExt = (name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/g, '');
      const fileExt = inferredExt && inferredExt.length <= 5 ? inferredExt : 'jpg';
      const fileName = `${uid}/${Date.now()}.${fileExt}`;

      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const contentType = String((file as any)?.type ?? '').trim() || `image/${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('vehicle-images').upload(fileName, bytes, {
        contentType,
        upsert: true,
      });
      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      setVehicleForm((p) => ({ ...p, image_url: fileName }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image upload failed');
    } finally {
      setLoading(false);
    }
  };

  const resolveVehicleImageUrl = (value: string | null | undefined) => {
    const v = String(value ?? '').trim();
    if (!v) return '';
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    const { data } = supabase.storage.from('vehicle-images').getPublicUrl(v);
    return data?.publicUrl ?? '';
  };

  const pickVehicleImage = async () => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      const input = window.document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/jpg,.jpg,.jpeg';
      input.style.position = 'fixed';
      input.style.left = '-10000px';
      input.style.top = '-10000px';
      input.onchange = () => {
        const file = (input.files && input.files[0]) || null;
        input.remove();
        if (file) void uploadVehicleImageFromWebFileAndSetUrl(file);
      };
      window.document.body.appendChild(input);
      input.click();
      return;
    }

    await uploadVehicleImageAndSetUrl();
  };

  const resetFloorForm = () => {
    setFloorForm({
      id: null,
      label: '',
      sort_order: nextFloorSortOrder,
      charge_with_lift: '0',
      charge_without_lift: '0',
      is_active: true,
    });
  };

  useEffect(() => {
    if (floorForm.id) return;
    const current = String(floorForm.sort_order ?? '').trim();
    if (!current || current === '0') {
      setFloorForm((p) => ({ ...p, sort_order: nextFloorSortOrder }));
    }
  }, [nextFloorSortOrder]);

  const parseOptionalNumber = (value: string) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  };

  const parseRequiredNumber = (value: string, fallback: number) => {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : fallback;
  };

  const upsertFloorOption = async () => {
    if (!canManage) return;
    setError(null);
    const label = floorForm.label.trim();
    if (!label) {
      setError('Floor label is required.');
      return;
    }

    setLoading(true);
    const payload: Record<string, unknown> = {
      label,
      sort_order: parseRequiredNumber(floorForm.sort_order, 0),
      charge_with_lift: parseOptionalNumber(floorForm.charge_with_lift) ?? 0,
      charge_without_lift: parseOptionalNumber(floorForm.charge_without_lift) ?? 0,
      is_active: floorForm.is_active,
    };

    const query = floorForm.id
      ? supabase.from('floor_options').update(payload).eq('id', floorForm.id).select('*').single()
      : supabase.from('floor_options').insert(payload).select('*').single();

    const { data, error: saveError } = await query;
    if (saveError) {
      setError(saveError.message);
      setLoading(false);
      return;
    }

    if (data) {
      setFloorOptions((prev) => {
        const next = [...prev];
        const idx = next.findIndex((f) => f.id === (data as any).id);
        if (idx >= 0) next[idx] = data as any;
        else next.push(data as any);
        next.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        return next;
      });
    }

    resetFloorForm();
    setLoading(false);
  };

  const toggleFloorActive = async (id: string, next: boolean) => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.from('floor_options').update({ is_active: next }).eq('id', id);
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    await fetchFloorOptions();
    setLoading(false);
  };

  const fetchFloorOptions = async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('floor_options')
      .select('id, label, sort_order, charge_with_lift, charge_without_lift, is_active')
      .order('sort_order', { ascending: true });

    if (fetchError) {
      if (!String(fetchError.message ?? '').includes('AbortError')) {
        setError(fetchError.message);
      }
    } else {
      setFloorOptions((data ?? []) as FloorOptionAdmin[]);
    }
    setLoading(false);
  };

  const fetchVehicleTypes = async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('vehicle_types')
      .select(
        'id, name, description, capacity, base_price, per_km_price, labor_price, image_url, is_active, vehicle_type, vehicle_number, vehicle_model'
      )
      .order('name', { ascending: true });

    if (fetchError) {
      if (!String(fetchError.message ?? '').includes('AbortError')) {
        setError(fetchError.message);
      }
    } else {
      setVehicleTypes((data ?? []) as VehicleTypeAdmin[]);
    }
    setLoading(false);
  };

  const resetVehicleForm = () => {
    setVehicleForm({
      id: null,
      name: '',
      description: '',
      capacity: '',
      vehicle_type: '',
      vehicle_number: '',
      vehicle_model: '',
      base_price: '',
      per_km_price: '',
      labor_price: '',
      image_url: '',
      is_active: true,
    });
  };

  const upsertVehicleType = async () => {
    if (!canManage) return;
    setError(null);
    const name = vehicleForm.name.trim();
    if (!name) {
      setError('Vehicle name is required.');
      return;
    }

    setLoading(true);
    const actorId = profile?.id ?? null;
    const payload: Record<string, unknown> = {
      name,
      description: vehicleForm.description.trim() ? vehicleForm.description.trim() : null,
      capacity: vehicleForm.capacity.trim() ? vehicleForm.capacity.trim() : null,
      vehicle_type: vehicleForm.vehicle_type.trim() ? vehicleForm.vehicle_type.trim() : null,
      vehicle_number: vehicleForm.vehicle_number.trim() ? vehicleForm.vehicle_number.trim() : null,
      vehicle_model: vehicleForm.vehicle_model.trim() ? vehicleForm.vehicle_model.trim() : null,
      base_price: parseOptionalNumber(vehicleForm.base_price),
      per_km_price: parseOptionalNumber(vehicleForm.per_km_price),
      labor_price: parseOptionalNumber(vehicleForm.labor_price),
      image_url: vehicleForm.image_url.trim() ? vehicleForm.image_url.trim() : null,
      is_active: vehicleForm.is_active,
      updated_by: actorId,
    };

    if (!vehicleForm.id) {
      payload.created_by = actorId;
    }

    const query = vehicleForm.id
      ? supabase.from('vehicle_types').update(payload).eq('id', vehicleForm.id).select('*').single()
      : supabase.from('vehicle_types').insert(payload).select('*').single();

    const { data, error: saveError } = await query;
    if (saveError) {
      setError(saveError.message);
      setLoading(false);
      return;
    }

    if (data) {
      setVehicleTypes((prev) => {
        const next = [...prev];
        const idx = next.findIndex((v) => v.id === (data as any).id);
        if (idx >= 0) next[idx] = data as any;
        else next.unshift(data as any);
        next.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        return next;
      });
    }

    resetVehicleForm();
    setLoading(false);
  };

  const toggleVehicleActive = async (id: string, next: boolean) => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.from('vehicle_types').update({ is_active: next }).eq('id', id);
    if (updateError) {
      setError(updateError.message);
    } else {
      await fetchVehicleTypes();
    }
    setLoading(false);
  };

  const deleteVehicleType = async (id: string, name: string) => {
    if (!canManage) return;
    const confirmed = window.confirm
      ? window.confirm(`Delete "${name}"? This cannot be undone.`)
      : await new Promise((resolve) => {
          Alert.alert('Delete Vehicle', `Delete "${name}"? This cannot be undone.`, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.from('vehicle_types').delete().eq('id', id);
    if (error) {
      setError(error.message);
    } else {
      setVehicleTypes((prev) => prev.filter((v) => v.id !== id));
    }
    setLoading(false);
  };

  const fetchStaff = async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('users')
      .select('id, name, phone, email, role, is_verified, created_at')
      .in('role', ['staff', 'admin', 'worker'])
      .order('created_at', { ascending: false });

    if (fetchError) {
      if (!String(fetchError.message ?? '').includes('AbortError')) {
        setError(fetchError.message);
      }
    } else {
      setStaffMembers((data ?? []) as StaffProfile[]);
    }
    setLoading(false);
  };

  const toggleStaffStatus = async (userId: string, nextStatus: boolean) => {
    setLoading(true);
    const { error: updateError } = await supabase.from('users').update({ is_verified: nextStatus }).eq('id', userId);

    if (updateError) {
      setError(updateError.message);
    } else {
      await fetchStaff();
    }
    setLoading(false);
  };

  const fetchBookings = async (overrides?: { status?: typeof bookingFilter }) => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    const statusFilter = overrides?.status ?? bookingFilter;
    try {
      let query = supabase
        .from('bookings')
        .select(
          'id, booking_number, pickup_address, drop_address, status, payment_status, driver_id, advance_amount, remaining_amount, scheduled_date, scheduled_time, reschedule_date, scheduled_at, created_at, updated_at, user:users!user_id!inner(name, phone, email), driver:users!driver_id(name)'
        )
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        if (statusFilter === 'not_started') {
          query = query.in('status', ['confirmed', 'pending', 'assigned', 'not_started']);
        } else {
          query = query.eq('status', statusFilter);
        }
      }
      if (bookingStartDate) {
        query = query.gte('created_at', `${bookingStartDate}T00:00:00.000Z`);
      }
      if (bookingEndDate) {
        query = query.lte('created_at', `${bookingEndDate}T23:59:59.999Z`);
      }
      if (bookingUserFilter) {
        const search = bookingUserFilter.trim();
        query = query.or(
          `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`,
          { foreignTable: 'user' }
        );
      }

      const { data, error: fetchError } = await query;
      if (fetchError) {
        if (!String(fetchError.message ?? '').includes('AbortError')) {
          setError(fetchError.message);
        }
      } else {
        setBookings((data ?? []) as BookingAdmin[]);
      }

      try {
        let countQuery = supabase
          .from('bookings')
          .select('status, user:users!user_id!inner(name, phone, email)');
        if (bookingStartDate) {
          countQuery = countQuery.gte('created_at', `${bookingStartDate}T00:00:00.000Z`);
        }
        if (bookingEndDate) {
          countQuery = countQuery.lte('created_at', `${bookingEndDate}T23:59:59.999Z`);
        }
        if (bookingUserFilter) {
          const search = bookingUserFilter.trim();
          countQuery = countQuery.or(
            `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`,
            { foreignTable: 'user' }
          );
        }
        const { data: countRows, error: countError } = await countQuery;
        if (!countError) {
          const counts: Record<string, number> = {};
          for (const row of (countRows ?? []) as { status: string | null }[]) {
            const key = String(row.status ?? 'unknown');
            counts[key] = (counts[key] ?? 0) + 1;
          }
          setBookingStatusCounts(counts);
        }
      } catch { /* ignore count errors */ }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!String(message ?? '').includes('AbortError')) {
        setError(message || 'Failed to fetch bookings.');
      }
    }
    setLoading(false);
  };

  const updateBookingStatus = async (bookingId: string, status: string, rescheduleOverride?: string, timeOverride?: string) => {
    setLoading(true);
    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    const nextRescheduleDate = rescheduleOverride ?? '';
    if (status === 'rescheduled' && !nextRescheduleDate) {
      setError('Please provide reschedule date.');
      setLoading(false);
      return;
    }
    if (status === 'rescheduled') {
      payload.reschedule_date = nextRescheduleDate;
      const day = String(nextRescheduleDate).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) payload.scheduled_date = day;
      if (timeOverride) payload.scheduled_time = timeOverride;
    }

    const { error: updateError } = await supabase.from('bookings').update(payload).eq('id', bookingId);
    if (updateError) {
      setError(updateError.message);
    } else {
      try {
        await supabase.functions.invoke('send-booking-status-push', {
          body: {
            booking_id: bookingId,
            status,
            send_email: status === 'rescheduled',
            new_date: status === 'rescheduled' ? String(nextRescheduleDate).slice(0, 10) : undefined,
            new_time: status === 'rescheduled' ? timeOverride ?? undefined : undefined,
          },
        });
      } catch {
        // ignore
      }
      await fetchBookings();
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!canManage) return;
    fetchDrivers();
    fetchStaff();
    fetchManagedUsers();
    fetchBookings();
    fetchVehicleTypes();
    fetchFloorOptions();
    fetchCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const bookingSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!canManage || activeSection !== 'bookings') return;
    if (bookingSearchTimer.current) clearTimeout(bookingSearchTimer.current);
    bookingSearchTimer.current = setTimeout(() => {
      fetchBookings();
    }, 400);
    return () => {
      if (bookingSearchTimer.current) clearTimeout(bookingSearchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingUserFilter, canManage, activeSection]);

  const hsSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!canManage || activeSection !== 'home_services') return;
    if (hsSearchTimer.current) clearTimeout(hsSearchTimer.current);
    hsSearchTimer.current = setTimeout(() => {
      fetchHomeServiceRequests();
    }, 400);
    return () => {
      if (hsSearchTimer.current) clearTimeout(hsSearchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hsSearchText, hsStartDate, hsEndDate, canManage, activeSection]);

  useEffect(() => {
    if (!canManage) return;
    if (activeSection === 'users') fetchManagedUsers();
    if (activeSection === 'vehicles') fetchVehicleTypes();
    if (activeSection === 'floors') fetchFloorOptions();
    if (activeSection === 'coupons') fetchCoupons();
    if (activeSection === 'bookings') fetchBookings();
    if (activeSection === 'reports') fetchReportsBookings();
    if (activeSection === 'home_services') fetchHomeServiceRequests();
    if (activeSection === 'quote_requests') fetchQuoteRequests();
    if (activeSection === 'properties') { fetchProperties(); void fetchPropBookings(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, canManage]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Manage staff, bookings, approvals, quote requests and reports."
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 24, paddingBottom: 120 } as any}
        keyboardShouldPersistTaps="handled">
        <YStack width="100%" maxWidth={maxContentWidth} alignSelf="center" gap="$4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pressable
            onPress={() => {
              (router as any).push('/notifications');
            }}>
            <XStack
              alignItems="center"
              justifyContent="center"
              height={40}
              paddingHorizontal={12}
              borderRadius={12}
              backgroundColor={theme.bgCardSecondary}
              borderWidth={1}
              borderColor={theme.border}
              gap={6}
              position="relative">
              <IconSymbol name="bell.fill" size={18} color={theme.text} />
              <Text color={theme.text} fontSize={t(13)} fontWeight="700">
                Notification
              </Text>
              {unreadCount > 0 ? (
                <View
                  style={{
                    minWidth: 16,
                    height: 16,
                    borderRadius: 99,
                    backgroundColor: theme.danger,
                    paddingHorizontal: 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text color="#FFFFFF" fontSize={t(11)} fontWeight="700">
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </XStack>
          </Pressable>
          <Button
            size="$2"
            height={40}
            backgroundColor={theme.bgCardSecondary}
            color={theme.text}
            borderRadius={10}
            onPress={() => router.push('/admin/locations' as any)}>
            Manage Locations
          </Button>
          <Button
            size="$2"
            height={40}
            backgroundColor={theme.bgCardSecondary}
            color={theme.text}
            borderRadius={10}
            onPress={() => {
              fetchDrivers();
              fetchStaff();
              fetchManagedUsers();
              fetchBookings();
              fetchVehicleTypes();
              fetchFloorOptions();
              fetchCoupons();
              fetchHomeServiceRequests();
              fetchProperties();
              void fetchPropBookings();
              fetchQuoteRequests();
              fetchReportsBookings();
              fetchReportsPayments();
            }}>
            Refresh
          </Button>
        </ScrollView>

        <YStack gap="$2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
            {[
              { label: 'Bookings', value: 'bookings', icon: 'truck' },
              { label: 'Home Services', value: 'home_services', icon: 'tools' },
              { label: 'Properties', value: 'properties', icon: 'building' },
              { label: 'Quote Requests', value: 'quote_requests', icon: 'file-alt' },
              { label: 'Reports', value: 'reports', icon: 'chart-bar' },
              { label: 'Users', value: 'users', icon: 'users' },
              { label: 'Vehicles', value: 'vehicles', icon: 'car' },
              { label: 'Floors', value: 'floors', icon: 'layer-group' },
              { label: 'Coupons', value: 'coupons', icon: 'ticket-alt' },
            ].map((tab) => (
              <Button
                key={tab.value}
                size="$2"
                backgroundColor={activeSection === tab.value ? theme.accent : theme.bgCardSecondary}
                borderRadius={999}
                onPress={() => setActiveSection(tab.value as typeof activeSection)}>
                <XStack gap={6} alignItems="center">
                  <FontAwesome5 name={tab.icon as any} size={13} color={activeSection === tab.value ? '#FFFFFF' : theme.text} />
                  <Text color={activeSection === tab.value ? '#FFFFFF' : theme.text} fontSize={t(12)} fontWeight="700">
                    {tab.label}
                  </Text>
                </XStack>
              </Button>
            ))}
          </ScrollView>
        </YStack>

        {!canManage ? (
          <YStack backgroundColor={theme.bgCardSecondary} padding={20} borderRadius={18} gap="$2" borderWidth={1} borderColor={theme.border}>
            <Text color={theme.text} fontWeight="700">Admin access only</Text>
            <Text color={theme.textMuted} fontSize={t(14)}>
              You do not have permission to manage drivers.
            </Text>
          </YStack>
        ) : (
          <>
            {activeSection === 'users' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor={theme.bgCard}
                  borderRadius={18}
                  padding={16}
                  gap="$3"
                  borderWidth={1}
                  borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="800" fontSize={t(16)}>
                    User management
                  </Text>

                  {userMgmtInfo ? (
                    <Text color="#93C5FD" fontSize={t(14)}>
                      {userMgmtInfo}
                    </Text>
                  ) : null}

                  <XStack gap="$2" flexWrap="wrap" alignItems="center">
                    <Input
                      value={userSearchText}
                      onChangeText={setUserSearchText}
                      placeholder="Search by name/phone/email"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={260}
                      flexGrow={2}
                      flexBasis={260}
                    />

                    <XStack gap="$1" flexWrap="wrap">
                      {([
                        { label: 'All', value: 'all' },
                        { label: 'Customer', value: 'customer' },
                        { label: 'Driver', value: 'driver' },
                        { label: 'Staff', value: 'staff' },
                        { label: 'Admin', value: 'admin' },
                        { label: 'Worker', value: 'worker' },
                      ] as const).map((opt) => (
                        <Button
                          key={opt.value}
                          size="$2"
                          backgroundColor={userRoleFilter === opt.value ? theme.accent : theme.bgCardSecondary}
                          color={userRoleFilter === opt.value ? '#FFFFFF' : theme.text}
                          borderRadius={999}
                          onPress={() => setUserRoleFilter(opt.value)}>
                          {opt.label}
                        </Button>
                      ))}
                    </XStack>
                  </XStack>
                </YStack>

                {!filteredManagedUsers.length ? (
                  <YStack backgroundColor={theme.bgCard} borderRadius={18} padding={16} borderWidth={1} borderColor={theme.border} gap="$1">
                    <Text color={theme.text} fontWeight="800">No users found</Text>
                    <Text color={theme.textMuted} fontSize={t(14)}>
                      Try changing filters or ensure users exist with role driver/staff/admin/worker.
                    </Text>
                  </YStack>
                ) : null}

                {filteredManagedUsers.map((item, idx) => {
                  const isSelected = selectedManagedUserId === item.id;
                  const roleKey = (item.role ?? 'staff').toString().toLowerCase();
                  const badgeColor =
                    roleKey === 'worker'
                      ? theme.info
                      : roleKey === 'customer'
                        ? theme.textMuted
                        : roleKey === 'admin'
                          ? theme.accent
                          : roleKey === 'driver'
                            ? '#A78BFA'
                            : theme.success;

                  return (
                    <YStack key={`${String(item.id ?? '').trim() || 'managed-user'}-${idx}`} gap="$2">
                      <Pressable onPress={() => selectManagedUser(item)}>
                        <YStack
                          backgroundColor={isSelected ? theme.bgCardSecondary : theme.bgCard}
                          borderRadius={18}
                          padding={16}
                          gap="$2"
                          borderWidth={1}
                          borderColor={isSelected ? theme.accent : theme.border}>
                          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                            <YStack gap={6} flexShrink={1}>
                              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                                <Text color={theme.text} fontWeight="900" fontSize={t(17)}>
                                  {item.name ?? '—'}
                                </Text>
                                <YStack backgroundColor={badgeColor} paddingHorizontal={10} paddingVertical={5} borderRadius={999}>
                                  <Text color={theme.text} fontWeight="900" fontSize={t(13)}>
                                    {(item.role ?? 'staff').toString().toUpperCase()}
                                  </Text>
                                </YStack>
                              </XStack>
                              <XStack gap={4} alignItems="center">
                                <Text color="#FFFFFF" fontWeight="800" fontSize={t(14)}>Phone:</Text>
                                {item.phone ? (
                                  <Pressable onPress={() => Linking.openURL(`tel:${item.phone}`)}>
                                    <Text color="#3B82F6" fontWeight="700" fontSize={t(14)} style={{ textDecorationLine: 'underline' }}>{item.phone}</Text>
                                  </Pressable>
                                ) : <Text color={theme.textMuted} fontSize={t(14)}>—</Text>}
                              </XStack>
                              <XStack gap={4} alignItems="center">
                                <Text color="#FFFFFF" fontWeight="800" fontSize={t(14)}>Email:</Text>
                                {item.email ? (
                                  <Pressable onPress={() => Linking.openURL(`mailto:${item.email}`)}>
                                    <Text color="#3B82F6" fontWeight="700" fontSize={t(14)} style={{ textDecorationLine: 'underline' }}>{item.email}</Text>
                                  </Pressable>
                                ) : <Text color={theme.textMuted} fontSize={t(14)}>—</Text>}
                              </XStack>
                            </YStack>
                            <YStack alignItems="flex-end" gap="$2">
                              <Text color={item.is_verified ? theme.success : '#FCA5A5'} fontSize={t(14)} fontWeight="800">
                                {item.is_verified ? 'ACTIVE' : 'INACTIVE'}
                              </Text>
                              <Text color={theme.textMuted} fontSize={t(14)}>{isSelected ? 'Tap to close' : 'Tap to edit'}</Text>
                            </YStack>
                          </XStack>
                        </YStack>
                      </Pressable>

                      {isSelected && managedUserForm.id === item.id ? (
                        <YStack backgroundColor={theme.bgCard} borderRadius={18} padding={16} gap="$3" borderWidth={1} borderColor={theme.border}>
                          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                            <Text color={theme.text} fontWeight="800" fontSize={t(16)}>
                              Edit user
                            </Text>
                            <Button
                              size="$2"
                              backgroundColor={theme.inputBg}
                              color={theme.inputText}
                              borderRadius={10}
                              onPress={() => selectManagedUser(item)}>
                              Close
                            </Button>
                          </XStack>

                          <XStack gap="$2" flexWrap="wrap">
                            <Input
                              value={managedUserForm.name}
                              onChangeText={(v) => setManagedUserForm((p) => ({ ...p, name: v }))}
                              placeholder="Name"
                              backgroundColor={theme.inputBg}
                              borderColor={theme.border}
                              color={theme.inputText}
                              minWidth={220}
                              flexGrow={2}
                              flexBasis={260}
                            />
                            <Input
                              value={managedUserForm.phone}
                              onChangeText={(v) => setManagedUserForm((p) => ({ ...p, phone: v }))}
                              placeholder="Phone"
                              backgroundColor={theme.inputBg}
                              borderColor={theme.border}
                              color={theme.inputText}
                              minWidth={180}
                              flexGrow={1}
                              flexBasis={200}
                            />
                            <Input
                              value={managedUserForm.email}
                              editable={false as any}
                              placeholder="Email"
                              backgroundColor={theme.inputBg}
                              borderColor={theme.border}
                              color={theme.textMuted}
                              minWidth={240}
                              flexGrow={2}
                              flexBasis={260}
                            />
                          </XStack>

                          <XStack gap="$2" flexWrap="wrap" alignItems="center">
                            <Text color={theme.text} fontSize={t(14)} fontWeight="800">
                              Role:
                            </Text>
                            {(['customer', 'driver', 'staff', 'admin', 'worker'] as const).map((r) => (
                              <Button
                                key={r}
                                size="$2"
                                backgroundColor={managedUserForm.role === r ? theme.accent : theme.bgCardSecondary}
                                color={managedUserForm.role === r ? '#FFFFFF' : theme.text}
                                hoverStyle={managedUserForm.role === r ? { backgroundColor: theme.accent } : { backgroundColor: theme.bgCardSecondary }}
                                pressStyle={managedUserForm.role === r ? { backgroundColor: theme.accent } : { backgroundColor: theme.bgCardSecondary }}
                                borderRadius={999}
                                onPress={() => setManagedUserForm((p) => ({ ...p, role: r }))}>
                                {r.toUpperCase()}
                              </Button>
                            ))}
                            <Button
                              size="$2"
                              backgroundColor={managedUserForm.is_verified ? theme.success : theme.danger}
                              color="#FFFFFF"
                              borderRadius={999}
                              onPress={() => setManagedUserForm((p) => ({ ...p, is_verified: !p.is_verified }))}>
                              {managedUserForm.is_verified ? 'Active' : 'Inactive'}
                            </Button>
                          </XStack>

                          <YStack gap="$2" backgroundColor={theme.bgCardSecondary} borderRadius={14} padding={12} borderWidth={1} borderColor={theme.border}>
                            <Text color={theme.text} fontSize={t(14)} fontWeight="800">
                              Documents
                            </Text>

                            {userDocuments.length ? (
                              <YStack gap="$2">
                                {userDocuments.map((doc, dIdx) => (
                                  <XStack
                                    key={`${String(doc.id ?? '').trim() || 'user-doc'}-${dIdx}`}
                                    justifyContent="space-between"
                                    alignItems="center"
                                    flexWrap="wrap"
                                    gap="$2"
                                    backgroundColor={theme.bgCard}
                                    borderRadius={12}
                                    padding={10}
                                    borderWidth={1}
                                    borderColor={theme.border}>
                                    <YStack gap={4} flexShrink={1}>
                                      <Text color={theme.text} fontWeight="800" fontSize={t(14)}>
                                        {(doc.document_type ?? '').toString().toUpperCase()}
                                      </Text>
                                      <Text color={theme.textMuted} fontSize={t(14)}>
                                        {doc.document_number}
                                      </Text>
                                    </YStack>
                                    {doc.image_url ? (
                                      <Button
                                        size="$2"
                                        backgroundColor={theme.inputBg}
                                        color={theme.inputText}
                                        borderRadius={10}
                                        onPress={() => {
                                          const u = resolveUserDocumentImageUrl(doc.image_url);
                                          if (u) openDocViewer(u);
                                        }}>
                                        Open
                                      </Button>
                                    ) : null}
                                  </XStack>
                                ))}
                              </YStack>
                            ) : (
                              <Text color={theme.textMuted} fontSize={t(14)}>
                                No documents added.
                              </Text>
                            )}

                            <YStack gap="$2" paddingTop={4}>
                              <Text color={theme.text} fontSize={t(14)} fontWeight="800">
                                Add document
                              </Text>

                              <XStack gap="$1" flexWrap="wrap">
                                {([
                                  { label: 'Aadhar', value: 'aadhar' },
                                  { label: 'PAN', value: 'pan' },
                                  { label: 'Voter', value: 'voter' },
                                  { label: 'License', value: 'license' },
                                  { label: 'Other', value: 'other' },
                                ] as const).map((opt) => (
                                  <Button
                                    key={opt.value}
                                    size="$2"
                                    backgroundColor={documentFormType === opt.value ? theme.accent : theme.bgCardSecondary}
                                    color={documentFormType === opt.value ? '#FFFFFF' : theme.text}
                                    borderRadius={999}
                                    onPress={() => setDocumentFormType(opt.value)}>
                                    {opt.label}
                                  </Button>
                                ))}
                              </XStack>

                              <XStack gap="$2" flexWrap="wrap" alignItems="center">
                                <Input
                                  value={documentFormNumber}
                                  onChangeText={setDocumentFormNumber}
                                  placeholder="Document number"
                                  backgroundColor={theme.inputBg}
                                  borderColor={theme.border}
                                  color={theme.inputText}
                                  minWidth={240}
                                  flexGrow={2}
                                  flexBasis={260}
                                />
                                <Button
                                  size="$2"
                                  backgroundColor={theme.bgCardSecondary}
                                  color={theme.text}
                                  borderRadius={10}
                                  onPress={() => pickDocumentImage('gallery')}
                                  disabled={documentBusy}>
                                  Pick image
                                </Button>
                                {Platform.OS !== 'web' ? (
                                  <Button
                                    size="$2"
                                    backgroundColor={theme.bgCardSecondary}
                                    color={theme.text}
                                    borderRadius={10}
                                    onPress={() => pickDocumentImage('camera')}
                                    disabled={documentBusy}>
                                    Camera
                                  </Button>
                                ) : null}
                                <Button
                                  size="$2"
                                backgroundColor={theme.accent}
                                color="#FFFFFF"
                                borderRadius={10}
                                onPress={stageUserDocument}
                                disabled={documentBusy}>
                                Add Document
                                </Button>
                              </XStack>

                              {documentFormImageUri ? (
                                <XStack gap="$2" alignItems="center">
                                  <Image
                                    source={{ uri: documentFormImageUri }}
                                    style={{ width: 68, height: 44, borderRadius: 8, backgroundColor: theme.bgCardSecondary }}
                                    resizeMode="cover"
                                  />
                                  <Text color={theme.textMuted} fontSize={t(13)}>
                                    Image selected.
                                  </Text>
                                </XStack>
                              ) : null}
                            </YStack>
                          </YStack>

                          <XStack gap="$2" flexWrap="wrap" justifyContent="flex-end">
                            <Button
                              size="$3"
                              backgroundColor={theme.bgCardSecondary}
                              color={theme.text}
                              borderRadius={12}
                              onPress={() => {
                                setSelectedManagedUserId(null);
                                setManagedUserForm({
                                  id: null,
                                  name: '',
                                  phone: '',
                                  email: '',
                                  role: 'staff',
                                  is_verified: true,
                                });
                                setPendingDocuments([]);
                                setUserMgmtInfo(null);
                              }}>
                              Clear
                            </Button>
                            <Button
                              size="$3"
                              backgroundColor={theme.accent}
                              color="#FFFFFF"
                              borderRadius={12}
                              onPress={saveManagedUser}
                              disabled={loading || documentBusy}>
                              Save
                            </Button>
                          </XStack>
                        </YStack>
                      ) : null}
                    </YStack>
                  );
                })}
              </YStack>
            ) : null}

            {activeSection === 'properties' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor={theme.bgCard}
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="700" fontSize={t(16)}>
                    Properties moderation
                  </Text>
                  <Text color={theme.textMuted} fontSize={t(14)}>
                    View, publish/unpublish, or delete properties.
                  </Text>
                  <XStack gap="$2" flexWrap="wrap" alignItems="center">
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={170}
                        flexGrow={1}
                        flexBasis={170}>
                        <input
                          value={propStartDate}
                          onChange={(e) => setPropStartDate((e.target as any).value)}
                          type="date"
                          placeholder="Start Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setPropStartPickerValue(propStartDate ? new Date(`${propStartDate}T00:00:00.000Z`) : new Date());
                          setPropStartDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                        <Input
                          value={propStartDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="Start date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={170}
                        flexGrow={1}
                        flexBasis={170}>
                        <input
                          value={propEndDate}
                          onChange={(e) => setPropEndDate((e.target as any).value)}
                          type="date"
                          placeholder="End Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setPropEndPickerValue(propEndDate ? new Date(`${propEndDate}T00:00:00.000Z`) : new Date());
                          setPropEndDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                        <Input
                          value={propEndDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="End date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    <Input
                      value={propSearchText}
                      onChangeText={setPropSearchText}
                      placeholder="Search by title/location/owner"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={200}
                    />
                  </XStack>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true} style={{ marginBottom: 2 }} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                    {([
                      { label: 'All', value: 'all', count: properties.length },
                      { label: 'Draft', value: 'draft', count: properties.filter((p) => String(p.status ?? '') === 'draft').length },
                      { label: 'Published', value: 'published', count: properties.filter((p) => String(p.status ?? '') === 'published').length },
                    ] as const).map((filter) => (
                      <Button
                        key={filter.value}
                        size="$2"
                        backgroundColor={propStatusFilter === filter.value ? theme.accent : theme.bgCardSecondary}
                        borderRadius={999}
                        onPress={() => setPropStatusFilter(filter.value)}>
                        <Text color={propStatusFilter === filter.value ? '#FFFFFF' : theme.text} fontSize={t(12)} fontWeight="700">
                          {`${filter.label} (${filter.count})`}
                        </Text>
                      </Button>
                    ))}
                    <Button
                      size="$2"
                      backgroundColor={theme.accent}
                      color={'#FFFFFF'}
                      borderRadius={10}
                      onPress={fetchProperties}
                      disabled={loading}>
                      Refresh
                    </Button>
                  </ScrollView>
                  <MobileDatePicker value={propStartPickerValue} open={propStartDatePickerOpen} onClose={() => setPropStartDatePickerOpen(false)} onChange={(d) => { setPropStartDate(isoDay(d)); }} />
                  <MobileDatePicker value={propEndPickerValue} open={propEndDatePickerOpen} onClose={() => setPropEndDatePickerOpen(false)} onChange={(d) => { setPropEndDate(isoDay(d)); }} />
                </YStack>

                {filteredProperties.map((p) => {
                  const statusText = String(p.status ?? 'draft').replaceAll('_', ' ');
                  const statusColor =
                    p.status === 'published'
                      ? theme.success
                      : p.status === 'draft'
                        ? theme.warning
                        : theme.textMuted;
                  const location = `${p.locality ?? ''}${p.locality ? ', ' : ''}${p.city ?? ''}${p.city ? ', ' : ''}${p.state ?? ''}`;
                  const busy = propertyStatusBusyId === p.id;
                  const open = propertyUploadsOpenId === p.id;

                  return (
                    <YStack
                      key={p.id}
                      backgroundColor={theme.bgCard}
                      borderRadius={18}
                      padding={16}
                      gap="$2"
                      borderColor={theme.border}
                      borderWidth={1}>
                      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                        <YStack flex={1} gap={4}>
                          <Text color={theme.text} fontWeight="800" fontSize={t(16)} numberOfLines={1}>
                            {p.title ?? 'Property'}
                          </Text>
                          <Text color={theme.textMuted} fontSize={t(14)} numberOfLines={1}>
                            {location.trim() || '—'}
                          </Text>
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            Owner: {p.owner_user_id}
                          </Text>
                        </YStack>

                        <YStack alignItems="flex-end" gap={6}>
                          <Text color={statusColor} fontSize={t(14)} fontWeight="700">
                            Status: {statusText}
                          </Text>
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            {p.price ? `₹${Number(p.price).toLocaleString('en-IN')}` : 'Price on request'}
                          </Text>
                          <Button
                            size="$2"
                            backgroundColor={theme.inputBg}
                            color={theme.inputText}
                            borderRadius={10}
                            disabled={propertyUploadsBusyId === p.id}
                            onPress={async () => {
                              const nextOpen = open ? null : p.id;
                              setPropertyUploadsOpenId(nextOpen);
                              if (nextOpen) await fetchPropertyUploads(p.id);
                            }}>
                            {open ? 'Hide media' : 'Media'}
                          </Button>
                        </YStack>
                      </XStack>

                      <XStack gap="$2" flexWrap="wrap">
                        {['draft', 'published'].map((s) => (
                          <Button
                            key={s}
                            size="$2"
                            backgroundColor={String(p.status ?? 'draft') === s ? theme.accent : theme.bgCardSecondary}
                            color={String(p.status ?? 'draft') === s ? '#FFFFFF' : theme.text}
                            borderRadius={999}
                            disabled={busy}
                            onPress={() => updatePropertyStatus(p.id, s)}>
                            {s}
                          </Button>
                        ))}

                        <Button
                          size="$2"
                          backgroundColor={theme.inputBg}
                          color={theme.inputText}
                          borderRadius={999}
                          disabled={busy}
                          onPress={() =>
                            router.push({ pathname: '/properties/[id]', params: { id: p.id } } as any)
                          }>
                          Open
                        </Button>

                        <Button
                          size="$2"
                          backgroundColor={theme.danger}
                          color="#FFFFFF"
                          borderRadius={999}
                          disabled={busy}
                          onPress={() => {
                            Alert.alert('Delete property?', 'This will permanently delete the property and its uploads.', [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => void deleteProperty(p.id) },
                            ]);
                          }}>
                          Delete
                        </Button>
                      </XStack>

                      {open ? (
                        <YStack
                          backgroundColor={theme.bgCardSecondary}
                          borderRadius={14}
                          padding={12}
                          gap="$2"
                          borderWidth={1}
                          borderColor={theme.border}>
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            Uploaded files
                          </Text>
                          {(propertyUploads[p.id] ?? []).length ? (
                            (propertyUploads[p.id] ?? []).map((u) => {
                              const url = String(u.file_url ?? '').trim();
                              const label = u.file_name || (u.file_type?.includes('video') ? 'Video' : 'Photo');
                              return (
                                <Pressable
                                  key={u.id}
                                  onPress={() => {
                                    if (!url) return;
                                    Linking.openURL(url);
                                  }}>
                                  <XStack
                                    justifyContent="space-between"
                                    alignItems="center"
                                    paddingVertical={8}
                                    paddingHorizontal={10}
                                    borderRadius={10}
                                    backgroundColor={theme.bgCard}
                                    borderWidth={1}
                                    borderColor={theme.border}
                                    gap="$2">
                                    <YStack flex={1} gap="$1">
                                      <Text color={theme.text} fontSize={t(15)} fontWeight="700" numberOfLines={1}>
                                        {label}
                                      </Text>
                                      <Text color={theme.textMuted} fontSize={t(13)} numberOfLines={1}>
                                        {u.file_type || '—'}
                                      </Text>
                                    </YStack>
                                    <Text color={theme.textMuted} fontSize={t(13)}>
                                      Open
                                    </Text>
                                  </XStack>
                                </Pressable>
                              );
                            })
                          ) : (
                            <Text color={theme.textMuted} fontSize={t(14)}>
                              No uploads.
                            </Text>
                          )}
                        </YStack>
                      ) : null}
                    </YStack>
                  );
                })}

                {!filteredProperties.length ? (
                  <YStack backgroundColor={theme.bgCard} borderRadius={18} padding={16} borderWidth={1} borderColor={theme.border} gap="$1">
                    <Text color={theme.text} fontWeight="800">No properties found</Text>
                    <Text color={theme.textMuted} fontSize={t(14)}>
                      Post a property as customer, then come back here to publish.
                    </Text>
                  </YStack>
                ) : null}
              </YStack>
            ) : null}

            {activeSection === 'properties' ? (
              <YStack gap="$3" marginTop={16}>
                <YStack backgroundColor={theme.bgCard} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="700" fontSize={t(16)}>Property Bookings</Text>
                  <Text color={theme.textMuted} fontSize={t(14)}>View and manage customer property bookings/inquiries.</Text>
                  <XStack gap="$2" flexWrap="wrap" alignItems="center">
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={170}
                        flexGrow={1}
                        flexBasis={170}>
                        <input
                          value={propBookingStartDate}
                          onChange={(e) => setPropBookingStartDate((e.target as any).value)}
                          type="date"
                          placeholder="Start Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setPropBookingStartPickerValue(propBookingStartDate ? new Date(`${propBookingStartDate}T00:00:00.000Z`) : new Date());
                          setPropBookingStartDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                        <Input
                          value={propBookingStartDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="Start date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={170}
                        flexGrow={1}
                        flexBasis={170}>
                        <input
                          value={propBookingEndDate}
                          onChange={(e) => setPropBookingEndDate((e.target as any).value)}
                          type="date"
                          placeholder="End Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setPropBookingEndPickerValue(propBookingEndDate ? new Date(`${propBookingEndDate}T00:00:00.000Z`) : new Date());
                          setPropBookingEndDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                        <Input
                          value={propBookingEndDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="End date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    <Input
                      value={propBookingSearch}
                      onChangeText={setPropBookingSearch}
                      placeholder="Search by name/phone/property"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={200}
                    />
                  </XStack>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true} style={{ marginBottom: 2 }} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                    {([
                      { label: 'All', value: 'all', count: propBookings.length },
                      { label: 'Pending', value: 'pending', count: propBookings.filter((pb) => String(pb.status ?? '') === 'pending').length },
                      { label: 'Confirmed', value: 'confirmed', count: propBookings.filter((pb) => String(pb.status ?? '') === 'confirmed').length },
                      { label: 'Cancelled', value: 'cancelled', count: propBookings.filter((pb) => String(pb.status ?? '') === 'cancelled').length },
                    ] as const).map((filter) => (
                      <Button
                        key={filter.value}
                        size="$2"
                        backgroundColor={propBookingStatusFilter === filter.value ? theme.accent : theme.bgCardSecondary}
                        borderRadius={999}
                        onPress={() => setPropBookingStatusFilter(filter.value)}>
                        <Text color={propBookingStatusFilter === filter.value ? '#FFFFFF' : theme.text} fontSize={t(12)} fontWeight="700">
                          {`${filter.label} (${filter.count})`}
                        </Text>
                      </Button>
                    ))}
                    <Button size="$2" backgroundColor={theme.accent} color="#FFFFFF" borderRadius={10}
                      onPress={fetchPropBookings} disabled={loading}>Refresh</Button>
                  </ScrollView>
                  <MobileDatePicker value={propBookingStartPickerValue} open={propBookingStartDatePickerOpen} onClose={() => setPropBookingStartDatePickerOpen(false)} onChange={(d) => { setPropBookingStartDate(isoDay(d)); }} />
                  <MobileDatePicker value={propBookingEndPickerValue} open={propBookingEndDatePickerOpen} onClose={() => setPropBookingEndDatePickerOpen(false)} onChange={(d) => { setPropBookingEndDate(isoDay(d)); }} />
                </YStack>
                {filteredPropBookings.map((pb: any) => {
                  const prop = pb.properties;
                  const statusColor = pb.status === 'confirmed' ? theme.success : pb.status === 'cancelled' ? theme.danger : theme.warning;
                  return (
                    <YStack key={pb.id} backgroundColor={theme.bgCard} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                      <YStack gap="$1">
                        <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                          <YStack flex={1} gap={4}>
                            <Text color={theme.text} fontWeight="800" fontSize={t(16)}>{prop?.title ?? 'Property'}</Text>
                            <Text color={theme.textMuted} fontSize={t(14)}>{[prop?.locality, prop?.city].filter(Boolean).join(', ') || '—'}</Text>
                            {prop?.price != null ? <Text color={theme.success} fontWeight="600" fontSize={t(15)}>₹{Number(prop.price).toLocaleString('en-IN')}</Text> : null}
                            <XStack gap={4} alignItems="center">
                              <Text color="#FFFFFF" fontWeight="800" fontSize={t(14)}>Customer:</Text>
                              <Text color={theme.textMuted} fontSize={t(14)}>{pb.contact_name ?? pb.user_id ?? '—'}</Text>
                            </XStack>
                            {pb.contact_phone ? (
                              <XStack gap={4} alignItems="center">
                                <Text color="#FFFFFF" fontWeight="800" fontSize={t(14)}>Phone:</Text>
                                <Pressable onPress={() => Linking.openURL(`tel:${pb.contact_phone}`)}>
                                  <Text color="#3B82F6" fontWeight="700" fontSize={t(14)} style={{ textDecorationLine: 'underline' }}>{pb.contact_phone}</Text>
                                </Pressable>
                              </XStack>
                            ) : null}
                            {pb.message ? <Text color={theme.textMuted} fontSize={t(14)}>Message: {pb.message}</Text> : null}
                          </YStack>
                          <YStack alignItems="flex-end" gap={6}>
                            <Text color={statusColor} fontSize={t(14)} fontWeight="700" textTransform="uppercase">{pb.status}</Text>
                            <Text color={theme.textMuted} fontSize={t(13)}>{formatDateDDMMYYYY(pb.created_at)}</Text>
                          </YStack>
                        </XStack>
                      </YStack>
                      <XStack gap="$2" flexWrap="wrap">
                        {['pending', 'confirmed', 'cancelled'].map((s) => (
                          <Button key={s} size="$2"
                            backgroundColor={String(pb.status) === s ? theme.accent : theme.bgCardSecondary}
                            color={String(pb.status) === s ? '#FFFFFF' : theme.text} borderRadius={999}
                            disabled={propBookingBusyId === pb.id}
                            onPress={() => updatePropBookingStatus(pb.id, s)}>{s}</Button>
                        ))}
                      </XStack>
                    </YStack>
                  );
                })}
                {!filteredPropBookings.length ? (
                  <YStack backgroundColor={theme.bgCard} borderRadius={18} padding={16} borderWidth={1} borderColor={theme.border} gap="$1">
                    <Text color={theme.text} fontWeight="800">No property bookings</Text>
                    <Text color={theme.textMuted} fontSize={t(14)}>Customers have not booked any properties yet.</Text>
                  </YStack>
                ) : null}
              </YStack>
            ) : null}

            {activeSection === 'vehicles' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor={theme.bgCard}
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="700" fontSize={t(16)}>
                    Manage vehicle types
                  </Text>
                  <Text color={theme.textMuted} fontSize={t(14)}>
                    Add or update vehicles shown in the booking wizard.
                  </Text>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={vehicleForm.name}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, name: v }))}
                      placeholder="Vehicle name (e.g., Tata Ace)"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={220}
                      flexGrow={2}
                      flexBasis={260}
                    />
                    <Input
                      value={vehicleForm.capacity}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, capacity: v }))}
                      placeholder="Capacity (e.g., 750 kg)"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={220}
                    />
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={vehicleForm.vehicle_type}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, vehicle_type: v }))}
                      placeholder="Vehicle type"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                    <Input
                      value={vehicleForm.vehicle_number}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, vehicle_number: v }))}
                      placeholder="Vehicle number"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                    <Input
                      value={vehicleForm.vehicle_model}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, vehicle_model: v }))}
                      placeholder="Vehicle model"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                  </XStack>

                  <Input
                    value={vehicleForm.description}
                    onChangeText={(v) => setVehicleForm((p) => ({ ...p, description: v }))}
                    placeholder="Description"
                    backgroundColor={theme.inputBg}
                    borderColor={theme.border}
                    color={theme.inputText}
                  />

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={vehicleForm.base_price}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, base_price: v }))}
                      placeholder="Base price"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={150}
                      flexGrow={1}
                      flexBasis={160}
                    />
                    <Input
                      value={vehicleForm.per_km_price}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, per_km_price: v }))}
                      placeholder="Per km price"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={150}
                      flexGrow={1}
                      flexBasis={160}
                    />
                    <Input
                      value={vehicleForm.labor_price}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, labor_price: v }))}
                      placeholder="Labor price"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={150}
                      flexGrow={1}
                      flexBasis={160}
                    />
                  </XStack>

                  {vehicleForm.image_url ? (
                    <Pressable
                      onPress={() => {
                        const u = resolveVehicleImageUrl(vehicleForm.image_url);
                        if (u) Linking.openURL(u as any);
                      }}>
                      <Image
                        source={{ uri: resolveVehicleImageUrl(vehicleForm.image_url) }}
                        style={{ width: 96, height: 64, borderRadius: 12, backgroundColor: theme.inputBg as any }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ) : null}

                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      size="$2"
                      backgroundColor={theme.inputBg}
                      color={theme.inputText}
                      borderRadius={10}
                      onPress={pickVehicleImage}
                      disabled={loading}>
                      Select image
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={vehicleForm.is_active ? theme.success : theme.bgCardSecondary}
                      color={vehicleForm.is_active ? '#FFFFFF' : theme.text}
                      borderRadius={999}
                      onPress={() => setVehicleForm((p) => ({ ...p, is_active: !p.is_active }))}>
                      {vehicleForm.is_active ? 'Active' : 'Inactive'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.accent}
                      color="#FFFFFF"
                      borderRadius={10}
                      onPress={upsertVehicleType}
                      disabled={loading}>
                      {vehicleForm.id ? 'Update vehicle' : 'Add vehicle'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.bgCardSecondary}
                      color={theme.text}
                      borderRadius={10}
                      onPress={resetVehicleForm}
                      disabled={loading}>
                      Clear
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.inputBg}
                      color={theme.inputText}
                      borderRadius={10}
                      onPress={fetchVehicleTypes}
                      disabled={loading}>
                      Refresh list
                    </Button>
                  </XStack>
                </YStack>

                <YStack gap="$3">
                  {vehicleTypes.map((item, idx) => (
                    <YStack
                      key={`${String(item.id ?? '').trim() || 'vehicle-type'}-${idx}`}
                      backgroundColor={theme.bgCard}
                      borderRadius={18}
                      padding={16}
                      gap="$2"
                      borderWidth={1}
                      borderColor={theme.border}>
                      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                        <YStack>
                          <Text color={theme.text} fontWeight="700" fontSize={t(16)}>
                            {item.name}
                          </Text>
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            {item.description ?? '—'}
                          </Text>
                        </YStack>
                        {item.image_url ? (
                          <Pressable
                            onPress={() => {
                              const u = resolveVehicleImageUrl(item.image_url);
                              if (u) Linking.openURL(u as any);
                            }}>
                            <Image
                              source={{ uri: resolveVehicleImageUrl(item.image_url) }}
                              style={{ width: 72, height: 48, borderRadius: 12, backgroundColor: theme.inputBg as any }}
                              resizeMode="cover"
                            />
                          </Pressable>
                        ) : null}
                        <Button
                          size="$2"
                          backgroundColor={item.is_active ? theme.success : theme.danger}
                          color="#FFFFFF"
                          borderRadius={10}
                          onPress={() => toggleVehicleActive(item.id, !(item.is_active ?? true))}
                          disabled={loading}>
                          {item.is_active ? 'Disable' : 'Enable'}
                        </Button>
                      </XStack>
                      <Text color={theme.textMuted} fontSize={t(14)}>Capacity: {item.capacity ?? '—'}</Text>
                      {(item.vehicle_type || item.vehicle_number || item.vehicle_model) ? (
                        <Text color={theme.textMuted} fontSize={t(14)}>
                          Type: {item.vehicle_type ?? '—'} • No: {item.vehicle_number ?? '—'} • Model: {item.vehicle_model ?? '—'}
                        </Text>
                      ) : null}
                      <Text color={theme.textMuted} fontSize={t(14)}>
                        Base: {item.base_price ?? '—'} • Per km: {item.per_km_price ?? '—'} • Labor: {item.labor_price ?? '—'}
                      </Text>
                      <XStack gap="$2" flexWrap="wrap">
                        <Button
                          size="$2"
                          backgroundColor={theme.inputBg}
                          color={theme.inputText}
                          borderRadius={10}
                          onPress={() => {
                            setVehicleForm({
                              id: item.id,
                              name: item.name ?? '',
                              description: item.description ?? '',
                              capacity: item.capacity ?? '',
                              vehicle_type: (item as any).vehicle_type ?? '',
                              vehicle_number: (item as any).vehicle_number ?? '',
                              vehicle_model: (item as any).vehicle_model ?? '',
                              base_price: item.base_price === null || item.base_price === undefined ? '' : String(item.base_price),
                              per_km_price: item.per_km_price === null || item.per_km_price === undefined ? '' : String(item.per_km_price),
                              labor_price: item.labor_price === null || item.labor_price === undefined ? '' : String(item.labor_price),
                              image_url: item.image_url ?? '',
                              is_active: Boolean(item.is_active ?? true),
                            });
                          }}>
                          Edit
                        </Button>
                        <Button
                          size="$2"
                          backgroundColor="#991B1B"
                          color="#FFFFFF"
                          borderRadius={10}
                          disabled={loading}
                          opacity={loading ? 0.6 : 1}
                          onPress={() => deleteVehicleType(item.id, item.name ?? 'Vehicle')}>
                          Delete
                        </Button>
                      </XStack>
                    </YStack>
                  ))}
                </YStack>
              </YStack>
            ) : null}

            {activeSection === 'coupons' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor={theme.bgCard}
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="700" fontSize={t(16)}>
                    Manage coupons
                  </Text>
                  <Text color={theme.textMuted} fontSize={t(14)}>
                    Create discount codes for bookings.
                  </Text>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={couponForm.code}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, code: v }))}
                      placeholder="Code (e.g., SAVE50)"
                      autoCapitalize="characters"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={220}
                    />
                    <Input
                      value={couponForm.title}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, title: v }))}
                      placeholder="Title (optional)"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={220}
                      flexGrow={2}
                      flexBasis={260}
                    />
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={couponForm.discount_type}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, discount_type: v }))}
                      placeholder="Type (percent/flat)"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={220}
                    />
                    <Input
                      value={couponForm.discount_value}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, discount_value: v }))}
                      placeholder="Discount value"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                    <Input
                      value={couponForm.max_discount}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, max_discount: v }))}
                      placeholder="Max discount (optional)"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={220}
                    />
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={couponForm.min_order_amount}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, min_order_amount: v }))}
                      placeholder="Min order amount"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                    <Input
                      value={couponForm.usage_limit}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, usage_limit: v }))}
                      placeholder="Usage limit (optional)"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={couponForm.valid_from}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, valid_from: v }))}
                      placeholder="Valid from (YYYY-MM-DD)"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={220}
                    />
                    <Input
                      value={couponForm.valid_until}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, valid_until: v }))}
                      placeholder="Valid until (YYYY-MM-DD)"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={220}
                    />
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      size="$2"
                      backgroundColor={couponForm.is_active ? theme.success : theme.bgCardSecondary}
                      color={couponForm.is_active ? '#FFFFFF' : theme.text}
                      borderRadius={999}
                      onPress={() => setCouponForm((p) => ({ ...p, is_active: !p.is_active }))}>
                      {couponForm.is_active ? 'Active' : 'Inactive'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.accent}
                      color="#FFFFFF"
                      borderRadius={10}
                      onPress={upsertCoupon}
                      disabled={loading}>
                      {couponForm.id ? 'Update coupon' : 'Add coupon'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.bgCardSecondary}
                      color={theme.text}
                      borderRadius={10}
                      onPress={resetCouponForm}
                      disabled={loading}>
                      Clear
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.inputBg}
                      color={theme.inputText}
                      borderRadius={10}
                      onPress={fetchCoupons}
                      disabled={loading}>
                      Refresh list
                    </Button>
                  </XStack>
                </YStack>

                <YStack gap="$3">
                  {coupons.map((item) => (
                    <YStack key={item.id} backgroundColor={theme.bgCard} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                        <YStack>
                          <Text color={theme.text} fontWeight="700" fontSize={t(16)}>
                            {item.code}
                          </Text>
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            {item.discount_type ?? '—'} • {item.discount_value ?? '—'}
                            {item.max_discount ? ` (max ${item.max_discount})` : ''}
                          </Text>
                        </YStack>
                        <XStack gap="$2" flexWrap="wrap">
                          <Button
                            size="$2"
                            backgroundColor={item.is_active ? theme.success : theme.danger}
                            color="#FFFFFF"
                            borderRadius={10}
                            onPress={() => toggleCouponActive(item.id, !(item.is_active ?? true))}
                            disabled={loading}>
                            {item.is_active ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="$2"
                            backgroundColor={theme.inputBg}
                            color={theme.inputText}
                            borderRadius={10}
                            onPress={() => {
                              setCouponForm({
                                id: item.id,
                                code: item.code ?? '',
                                title: item.title ?? '',
                                discount_type: item.discount_type ?? 'percent',
                                discount_value:
                                  item.discount_value === null || item.discount_value === undefined
                                    ? ''
                                    : String(item.discount_value),
                                max_discount:
                                  item.max_discount === null || item.max_discount === undefined
                                    ? ''
                                    : String(item.max_discount),
                                min_order_amount:
                                  item.min_order_amount === null || item.min_order_amount === undefined
                                    ? '0'
                                    : String(item.min_order_amount),
                                valid_from: item.valid_from ?? '',
                                valid_until: item.valid_until ?? '',
                                usage_limit:
                                  item.usage_limit === null || item.usage_limit === undefined
                                    ? ''
                                    : String(item.usage_limit),
                                is_active: Boolean(item.is_active ?? true),
                              });
                            }}>
                            Edit
                          </Button>
                        </XStack>
                      </XStack>
                      <Text color={theme.textMuted} fontSize={t(14)}>
                        Min order: {item.min_order_amount ?? 0} • Used: {item.used_count ?? 0}
                        {item.usage_limit ? ` / ${item.usage_limit}` : ''}
                      </Text>
                      <Text color={theme.textMuted} fontSize={t(14)}>
                        Valid: {item.valid_from ?? '—'} → {item.valid_until ?? '—'}
                      </Text>
                    </YStack>
                  ))}
                </YStack>
              </YStack>
            ) : null}

            {activeSection === 'floors' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor={theme.bgCard}
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="700" fontSize={t(16)}>
                    Manage floors
                  </Text>
                  <Text color={theme.textMuted} fontSize={t(14)}>
                    Add or update floor charges used in the booking wizard.
                  </Text>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={floorForm.label}
                      onChangeText={(v) => setFloorForm((p) => ({ ...p, label: v }))}
                      placeholder="Label (e.g., Ground, 1st, 2nd)"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={220}
                      flexGrow={2}
                      flexBasis={260}
                    />
                    <Input
                      value={floorForm.sort_order}
                      onChangeText={(v) => setFloorForm((p) => ({ ...p, sort_order: v }))}
                      placeholder={nextFloorSortOrder}
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={140}
                      flexGrow={1}
                      flexBasis={160}
                    />
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={floorForm.charge_with_lift}
                      onChangeText={(v) => setFloorForm((p) => ({ ...p, charge_with_lift: v }))}
                      placeholder="Charge (with lift)"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={160}
                      flexGrow={1}
                      flexBasis={200}
                    />
                    <Input
                      value={floorForm.charge_without_lift}
                      onChangeText={(v) => setFloorForm((p) => ({ ...p, charge_without_lift: v }))}
                      placeholder="Charge (without lift)"
                      keyboardType="numeric"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={220}
                    />
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      size="$2"
                      backgroundColor={floorForm.is_active ? theme.success : theme.bgCardSecondary}
                      color={floorForm.is_active ? '#FFFFFF' : theme.text}
                      borderRadius={999}
                      onPress={() => setFloorForm((p) => ({ ...p, is_active: !p.is_active }))}>
                      {floorForm.is_active ? 'Active' : 'Inactive'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.accent}
                      color="#FFFFFF"
                      borderRadius={10}
                      onPress={upsertFloorOption}
                      disabled={loading}>
                      {floorForm.id ? 'Update floor' : 'Add floor'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.bgCardSecondary}
                      color={theme.text}
                      borderRadius={10}
                      onPress={resetFloorForm}
                      disabled={loading}>
                      Clear
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.inputBg}
                      color={theme.inputText}
                      borderRadius={10}
                      onPress={fetchFloorOptions}
                      disabled={loading}>
                      Refresh list
                    </Button>
                  </XStack>
                </YStack>

                <YStack gap="$3">
                  {floorOptions.map((item) => (
                    <YStack key={item.id} backgroundColor={theme.bgCard} borderRadius={18} padding={16} gap="$2" borderWidth={1} borderColor={theme.border}>
                      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                        <YStack>
                          <Text color={theme.text} fontWeight="700" fontSize={t(16)}>
                            {item.label}
                          </Text>
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            Sort: {item.sort_order ?? 0} • With lift: {item.charge_with_lift ?? 0} • Without lift: {item.charge_without_lift ?? 0}
                          </Text>
                        </YStack>
                        <XStack gap="$2" flexWrap="wrap">
                          <Button
                            size="$2"
                            backgroundColor={item.is_active ? theme.success : theme.danger}
                            color="#FFFFFF"
                            borderRadius={10}
                            onPress={() => toggleFloorActive(item.id, !(item.is_active ?? true))}
                            disabled={loading}>
                            {item.is_active ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="$2"
                            backgroundColor={theme.inputBg}
                            color={theme.inputText}
                            borderRadius={10}
                            onPress={() => {
                              setFloorForm({
                                id: item.id,
                                label: item.label ?? '',
                                sort_order: String(item.sort_order ?? 0),
                                charge_with_lift:
                                  item.charge_with_lift === null || item.charge_with_lift === undefined
                                    ? '0'
                                    : String(item.charge_with_lift),
                                charge_without_lift:
                                  item.charge_without_lift === null || item.charge_without_lift === undefined
                                    ? '0'
                                    : String(item.charge_without_lift),
                                is_active: Boolean(item.is_active ?? true),
                              });
                            }}>
                            Edit
                          </Button>
                        </XStack>
                      </XStack>
                    </YStack>
                  ))}
                </YStack>
              </YStack>
            ) : null}

            {activeSection === 'bookings' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor={theme.bgCard}
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor={theme.border}>
                  <Text color="#FFFFFF" fontWeight="800" fontSize={t(16)}>
                    Filter and manage bookings.
                  </Text>
                  {Platform.OS === 'web' ? (
                    <style>{`
                      .admin-date-input::placeholder { color: #9CA3AF; opacity: 1; }
                    `}</style>
                  ) : null}
                  <XStack gap="$2" flexWrap="wrap" alignItems="center">
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={180}
                        flexGrow={1}
                        flexBasis={180}>
                        <input
                          value={bookingStartDate}
                          onChange={(e) => setBookingStartDate((e.target as any).value)}
                          type="date"
                          placeholder="Start Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setBookingStartPickerValue(bookingStartDate ? new Date(`${bookingStartDate}T00:00:00.000Z`) : new Date());
                          setBookingStartDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 180, minWidth: 180 } as any}>
                        <Input
                          value={bookingStartDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="Start date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={180}
                        flexGrow={1}
                        flexBasis={180}>
                        <input
                          value={bookingEndDate}
                          onChange={(e) => setBookingEndDate((e.target as any).value)}
                          type="date"
                          placeholder="End Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setBookingEndPickerValue(bookingEndDate ? new Date(`${bookingEndDate}T00:00:00.000Z`) : new Date());
                          setBookingEndDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 180, minWidth: 180 } as any}>
                        <Input
                          value={bookingEndDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="End date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    <Input
                      value={bookingUserFilter}
                      onChangeText={setBookingUserFilter}
                      placeholder="Filter by user name/phone/email"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={220}
                      flexGrow={2}
                      flexBasis={220}
                    />
                  </XStack>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true} style={{ marginBottom: 2 }} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                    {(() => {
                      const counts = bookingStatusCounts;
                      const sum = Object.values(counts).reduce((acc, n) => acc + n, 0);
                      const countFor = (statuses: string[]) => statuses.reduce((acc, s) => acc + (counts[s] ?? 0), 0);
                      const notStarted = countFor(['confirmed', 'pending', 'assigned', 'not_started']);
                      return [
                        { label: 'All', value: 'all', count: sum },
                        { label: 'Not started', value: 'not_started', count: notStarted },
                        { label: 'Assigned', value: 'assigned', count: countFor(['assigned']) },
                        { label: 'Pickup reached', value: 'pickup_reached', count: countFor(['pickup_reached']) },
                        { label: 'In Transit', value: 'in_transit', count: countFor(['in_transit']) },
                        { label: 'Delivered', value: 'delivered', count: countFor(['delivered']) },
                        { label: 'Rescheduled', value: 'rescheduled', count: countFor(['rescheduled']) },
                        { label: 'Cancelled', value: 'cancelled', count: countFor(['cancelled']) },
                      ];
                    })()
                      .map((filter) => (
                        <Button
                          key={filter.value}
                          size="$2"
                          backgroundColor={bookingFilter === filter.value ? theme.accent : theme.bgCardSecondary}
                          borderRadius={999}
                          onPress={() => {
                            const next = filter.value as typeof bookingFilter;
                            setBookingFilter(next);
                            fetchBookings({ status: next });
                          }}>
                          <Text color={bookingFilter === filter.value ? '#FFFFFF' : theme.text} fontSize={t(12)} fontWeight="700">
                            {`${filter.label} (${filter.count})`}
                          </Text>
                        </Button>
                      ))}
                  </ScrollView>
                  <MobileDatePicker value={bookingStartPickerValue} open={bookingStartDatePickerOpen} onClose={() => setBookingStartDatePickerOpen(false)} onChange={(d) => { setBookingStartDate(isoDay(d)); }} />
                  <MobileDatePicker value={bookingEndPickerValue} open={bookingEndDatePickerOpen} onClose={() => setBookingEndDatePickerOpen(false)} onChange={(d) => { setBookingEndDate(isoDay(d)); }} />
                </YStack>

                {bookings.map((item) => {
                  const user = getBookingUser(item);
                  const driver = getBookingDriver(item);
                  const remaining = typeof item.remaining_amount === 'number' ? item.remaining_amount : null;
                  const paymentModeLabel = remaining !== null ? (remaining <= 0 ? 'Full' : 'Advance') : null;
                  const paidAmount = typeof item.advance_amount === 'number' ? item.advance_amount : null;
                  const canUpdateBooking = item.status !== 'cancelled' && item.status !== 'delivered';
                  const currentDriverId = (item as any).driver_id ?? null;
                  const hasAssignedDriver = Boolean(currentDriverId);
                  const hasStarted = ['pickup_reached', 'in_transit', 'delivered'].includes(item.status ?? '');
                  const canAssign = canUpdateBooking && !hasStarted;
                  const statusText = String(item.status ?? '—').replaceAll('_', ' ');
                  const statusColor =
                    item.status === 'assigned'
                      ? theme.info
                      : item.status === 'cancelled'
                        ? theme.danger
                        : item.status === 'delivered'
                          ? theme.success
                          : theme.textMuted;
                  return (
                    <YStack
                      key={item.id}
                      backgroundColor={theme.bgCard}
                      borderRadius={18}
                      padding={16}
                      gap="$2"
                      borderColor={theme.border}
                      borderWidth={1}>
                      <YStack gap="$1">
                        <YStack gap={2}>
                          <Text color="#FFFFFF" fontWeight="800" fontSize={t(14)} numberOfLines={2}>
                            🔴 From: {item.pickup_address ?? 'Pickup address'}
                          </Text>
                          <Text color="#10B981" fontWeight="800" fontSize={t(14)} numberOfLines={2}>
                            🟢 To: {item.drop_address ?? 'Drop address'}
                          </Text>
                        </YStack>
                        <XStack gap={4} flexWrap="wrap" alignItems="center">
                          <Text color="#FFFFFF" fontWeight="800" fontSize={t(13)}>User:</Text>
                          <Text color={theme.textMuted} fontSize={t(13)}>{user.name ?? '—'} • </Text>
                          {user.phone ? (
                            <Pressable onPress={() => Linking.openURL(`tel:${user.phone}`)}>
                              <Text color="#3B82F6" fontWeight="700" fontSize={t(13)} style={{ textDecorationLine: 'underline' }}>
                                {user.phone}
                              </Text>
                            </Pressable>
                          ) : (
                            <Text color={theme.textMuted} fontSize={t(13)}>—</Text>
                          )}
                          {user.email ? (
                            <>
                              <Text color={theme.textMuted} fontSize={t(13)}> • </Text>
                              <Pressable onPress={() => Linking.openURL(`mailto:${user.email}`)}>
                                <Text color="#3B82F6" fontWeight="700" fontSize={t(13)} style={{ textDecorationLine: 'underline' }}>{user.email}</Text>
                              </Pressable>
                            </>
                          ) : <Text color={theme.textMuted} fontSize={t(13)}> • —</Text>}
                        </XStack>
                        <XStack gap={4} flexWrap="wrap">
                          <Text color="#FFFFFF" fontWeight="800" fontSize={t(13)}>Driver:</Text>
                          <Text color={theme.textMuted} fontSize={t(13)}>{hasAssignedDriver ? driver.name ?? '—' : 'Unassigned'}</Text>
                        </XStack>
                        <XStack gap={4} flexWrap="wrap">
                          <Text color="#FFFFFF" fontWeight="800" fontSize={t(13)}>{item.status === 'rescheduled' || item.reschedule_date ? 'Rescheduled Shifting:' : 'Shifting Date:'}</Text>
                          <Text color={theme.textMuted} fontSize={t(13)}>{item.scheduled_date ? `${formatDateDDMMYYYY(item.scheduled_date)}${item.scheduled_time ? `, ${item.scheduled_time}` : ''}` : '—'}</Text>
                        </XStack>
                      </YStack>

                      {renderBookingStepper(item.status)}

                      <YStack gap="$2">
                        {/* Row 1: Media + Assign/Unassign */}
                        <XStack gap="$2" flexWrap="nowrap" alignItems="center">
                          <Button
                            size="$2"
                            backgroundColor={theme.bgCardSecondary}
                            color={theme.text}
                            borderRadius={10}
                            flex={1}
                            pressStyle={{ opacity: 0.8, backgroundColor: theme.border }}
                            disabled={bookingUploadsBusyId === item.id}
                            onPress={async () => {
                              const nextOpen = bookingUploadsOpenId === item.id ? null : item.id;
                              setBookingUploadsOpenId(nextOpen);
                              if (nextOpen) await fetchBookingUploads(item.id);
                            }}>
                            {bookingUploadsOpenId === item.id ? 'Hide media' : 'Media'}
                          </Button>
                          {canUpdateBooking && canAssign ? (
                            <>
                              <Button
                                size="$2"
                                backgroundColor={theme.bgCardSecondary}
                                color={theme.text}
                                borderRadius={10}
                                flex={1}
                                pressStyle={{ opacity: 0.8, backgroundColor: theme.border }}
                                disabled={loading || assignDriverBusy === item.id}
                                onPress={() => setAssigningBookingId((prev) => (prev === item.id ? null : item.id))}>
                                Assign driver
                              </Button>
                              {hasAssignedDriver ? (
                                <Button
                                  size="$2"
                                  backgroundColor={theme.danger}
                                  color="#FFFFFF"
                                  borderRadius={10}
                                  flex={1}
                                  pressStyle={{ opacity: 0.8 }}
                                  onPress={() => assignDriverToBooking(item.id, null, currentDriverId)}
                                  disabled={loading || assignDriverBusy === item.id}>
                                  Unassign
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                        </XStack>
                        {/* Row 2: Track + Cancel + Reschedule */}
                        {canUpdateBooking ? (
                          <XStack gap="$2" flexWrap="nowrap" alignItems="center">
                            <Button
                              size="$2"
                              backgroundColor={theme.info}
                              color="#FFFFFF"
                              borderRadius={10}
                              flex={1}
                              pressStyle={{ opacity: 0.8 }}
                              onPress={() =>
                                router.push({
                                  pathname: '/tracking',
                                  params: { bookingId: item.id },
                                } as any)
                              }>
                              Track
                            </Button>
                            <Button
                              size="$2"
                              backgroundColor={theme.danger}
                              color="#FFFFFF"
                              borderRadius={10}
                              flex={1}
                              pressStyle={{ opacity: 0.8 }}
                              onPress={() => setCancelBookingDialogId(item.id)}>
                              Cancel
                            </Button>
                            <Button
                              size="$2"
                              backgroundColor={theme.accent}
                              color="#FFFFFF"
                              borderRadius={10}
                              flex={1}
                              pressStyle={{ opacity: 0.8 }}
                              onPress={() => setRescheduleDialogId(item.id)}>
                              Reschedule
                            </Button>
                          </XStack>
                        ) : null}
                      </YStack>

                      {canAssign && assigningBookingId === item.id ? (
                        <YStack
                          backgroundColor={theme.bgCardSecondary}
                          borderRadius={14}
                          padding={12}
                          gap="$2"
                          borderWidth={1}
                          borderColor={theme.border}>
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            Select driver
                          </Text>
                          <XStack gap="$2" flexWrap="wrap">
                            {drivers.map((d) => (
                              <Button
                                key={d.id}
                                size="$2"
                                backgroundColor={d.id === currentDriverId ? theme.accent : theme.bgCardSecondary}
                                color={d.id === currentDriverId ? '#FFFFFF' : theme.text}
                                borderRadius={999}
                                pressStyle={{ opacity: 0.8 }}
                                onPress={() => assignDriverToBooking(item.id, d.id, currentDriverId)}
                                disabled={loading || assignDriverBusy === item.id}>
                                {d.name ?? 'Driver'}
                              </Button>
                            ))}
                          </XStack>
                          {!drivers.length ? (
                            <Text color={theme.textMuted} fontSize={t(14)}>
                              No drivers found.
                            </Text>
                          ) : null}
                        </YStack>
                      ) : null}

                      {bookingUploadsOpenId === item.id ? (
                        <YStack
                          backgroundColor={theme.bgCardSecondary}
                          borderRadius={14}
                          padding={12}
                          gap="$2"
                          borderWidth={1}
                          borderColor={theme.border}>
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            Uploaded files
                          </Text>
                          {(bookingUploads[item.id] ?? []).length ? (
                            (bookingUploads[item.id] ?? []).map((u) => {
                              const url = String(u.file_url ?? '').trim();
                              const label = u.file_name || (u.file_type === 'video' ? 'Video' : 'Photo');
                              return (
                                <Pressable
                                  key={u.id}
                                  onPress={() => {
                                    if (!url) return;
                                    Linking.openURL(url);
                                  }}>
                                  <XStack
                                    justifyContent="space-between"
                                    alignItems="center"
                                    paddingVertical={8}
                                    paddingHorizontal={10}
                                    borderRadius={10}
                                    backgroundColor={theme.bgCard}
                                    borderWidth={1}
                                    borderColor={theme.border}
                                    gap="$2">
                                    <YStack flex={1} gap="$1">
                                      <Text color={theme.text} fontSize={t(15)} fontWeight="700" numberOfLines={1}>
                                        {label}
                                      </Text>
                                      <Text color={theme.textMuted} fontSize={t(13)} numberOfLines={1}>
                                        {u.file_type ?? 'file'}
                                      </Text>
                                    </YStack>
                                    <Text color={theme.textMuted} fontSize={t(13)}>
                                      Open
                                    </Text>
                                  </XStack>
                                </Pressable>
                              );
                            })
                          ) : (
                            <Text color={theme.textMuted} fontSize={t(14)}>
                              No uploads.
                            </Text>
                          )}
                        </YStack>
                      ) : null}

                      <XStack gap="$2" flexWrap="wrap" justifyContent="space-between" alignItems="center">
                        <Text color={statusColor} fontSize={t(14)} fontWeight="700">
                          Status: {statusText}
                        </Text>
                        <Text color={theme.textMuted} fontSize={t(14)}>
                          Payment: {String(item.payment_status ?? '—').replaceAll('_', ' ')}
                          {paymentModeLabel ? ` (${paymentModeLabel})` : ''}
                        </Text>
                      </XStack>
                      <XStack gap="$2" flexWrap="wrap" justifyContent="space-between" alignItems="center">
                        <Text color={theme.textMuted} fontSize={t(14)}>
                          Paid: {paidAmount !== null ? `₹${paidAmount.toFixed(2)}` : '—'}
                        </Text>
                        <Text color={theme.textMuted} fontSize={t(14)}>
                          Updated: {formatDateTimeDDMMYYYY(item.updated_at)}
                        </Text>
                      </XStack>
                      {item.status === 'assigned' ? (
                        <Button
                          size="$2"
                          backgroundColor={theme.info}
                          color="#FFFFFF"
                          borderRadius={10}
                          minWidth={120}
                          pressStyle={{ opacity: 0.8 }}
                          onPress={() => updateBookingStatus(item.id, 'not_started')}>
                          Start
                        </Button>
                      ) : null}
                    </YStack>
                  );
                })}
                <RescheduleDialog
                  open={!!rescheduleDialogId}
                  title="Reschedule booking"
                  confirmLabel="Confirm reschedule"
                  onClose={() => setRescheduleDialogId(null)}
                  onConfirm={(day, timeLabel) => {
                    const bookingId = rescheduleDialogId;
                    setRescheduleDialogId(null);
                    const iso = new Date(`${day}T${timeLabelTo24h(timeLabel)}:00`).toISOString();
                    void updateBookingStatus(bookingId ?? '', 'rescheduled', iso, timeLabel);
                  }}
                />
              </YStack>
            ) : null}

            {activeSection === 'home_services' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor={theme.bgCard}
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="700" fontSize={t(16)}>
                    Home Services requests
                  </Text>
                  <Text color={theme.textMuted} fontSize={t(14)}>
                    View and manage home service requests.
                  </Text>

                  {(() => {
                    const total = homeServiceRequests.length;
                    const pending = homeServiceRequests.filter((r) => r.status === 'pending').length;
                    const completed = homeServiceRequests.filter((r) => r.status === 'completed').length;
                    const cancelled = homeServiceRequests.filter((r) => r.status === 'cancelled').length;
                    const paid = homeServiceRequests.filter((r) => r.payment_status === 'paid').length;
                    const unpaid = homeServiceRequests.filter((r) => r.payment_status === 'pending' || !r.payment_status).length;
                    const withCharge = homeServiceRequests.filter((r) => r.payment_status === 'cancelled_with_charge').length;
                    return (
                      <YStack gap="$2" marginTop={4}>
                        {/* Row 1: Total, Pending, Completed, Cancelled */}
                        <XStack gap="$2">
                          <YStack flex={1} backgroundColor={theme.bgCardSecondary} borderRadius={10} paddingVertical={12} alignItems="center">
                            <Text color={theme.text} fontWeight="900" fontSize={t(16)}>{total}</Text>
                            <Text color={theme.textMuted} fontSize={t(11)}>Total</Text>
                          </YStack>
                          <YStack flex={1} backgroundColor={theme.bgCardSecondary} borderRadius={10} paddingVertical={12} alignItems="center">
                            <Text color={theme.warning} fontWeight="900" fontSize={t(16)}>{pending}</Text>
                            <Text color={theme.textMuted} fontSize={t(11)}>Pending</Text>
                          </YStack>
                          <YStack flex={1} backgroundColor={theme.bgCardSecondary} borderRadius={10} paddingVertical={12} alignItems="center">
                            <Text color={theme.success} fontWeight="900" fontSize={t(16)}>{completed}</Text>
                            <Text color={theme.textMuted} fontSize={t(11)}>Completed</Text>
                          </YStack>
                          <YStack flex={1} backgroundColor={theme.bgCardSecondary} borderRadius={10} paddingVertical={12} alignItems="center">
                            <Text color={theme.danger} fontWeight="900" fontSize={t(16)}>{cancelled}</Text>
                            <Text color={theme.textMuted} fontSize={t(11)}>Cancelled</Text>
                          </YStack>
                        </XStack>
                        {/* Row 2: Paid, Unpaid, ₹150 Chrg */}
                        <XStack gap="$2">
                          <YStack flex={1} backgroundColor={theme.bgCardSecondary} borderRadius={10} paddingVertical={12} alignItems="center">
                            <Text color={theme.success} fontWeight="900" fontSize={t(16)}>{paid}</Text>
                            <Text color={theme.textMuted} fontSize={t(11)}>Paid</Text>
                          </YStack>
                          <YStack flex={1} backgroundColor={theme.bgCardSecondary} borderRadius={10} paddingVertical={12} alignItems="center">
                            <Text color={theme.warning} fontWeight="900" fontSize={t(16)}>{unpaid}</Text>
                            <Text color={theme.textMuted} fontSize={t(11)}>Unpaid</Text>
                          </YStack>
                          <YStack flex={1} backgroundColor={theme.bgCardSecondary} borderRadius={10} paddingVertical={12} alignItems="center">
                            <Text color={theme.primary} fontWeight="900" fontSize={t(16)}>{withCharge}</Text>
                            <Text color={theme.textMuted} fontSize={t(11)}>₹150 Chrg</Text>
                          </YStack>
                        </XStack>
                      </YStack>
                    );
                  })()}

                  <XStack gap="$2" flexWrap="wrap" alignItems="center">
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={170}
                        flexGrow={1}
                        flexBasis={170}>
                        <input
                          value={hsStartDate}
                          onChange={(e) => setHsStartDate((e.target as any).value)}
                          type="date"
                          placeholder="Start Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setHsStartPickerValue(hsStartDate ? new Date(`${hsStartDate}T00:00:00.000Z`) : new Date());
                          setHsStartDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                        <Input
                          value={hsStartDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="Start date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={170}
                        flexGrow={1}
                        flexBasis={170}>
                        <input
                          value={hsEndDate}
                          onChange={(e) => setHsEndDate((e.target as any).value)}
                          type="date"
                          placeholder="End Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setHsEndPickerValue(hsEndDate ? new Date(`${hsEndDate}T00:00:00.000Z`) : new Date());
                          setHsEndDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                        <Input
                          value={hsEndDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="End date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    <Input
                      value={hsSearchText}
                      onChangeText={setHsSearchText}
                      placeholder="Search by name/phone"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={200}
                    />
                  </XStack>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true} style={{ marginBottom: 2 }} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                    {(() => {
                      const sum = Object.values(hsStatusCounts).reduce((acc, n) => acc + n, 0);
                      return [
                        { label: 'All', value: 'all', count: sum },
                        { label: 'Pending', value: 'pending', count: hsStatusCounts['pending'] ?? 0 },
                        { label: 'Assigned', value: 'assigned', count: hsStatusCounts['assigned'] ?? 0 },
                        { label: 'Completed', value: 'completed', count: hsStatusCounts['completed'] ?? 0 },
                        { label: 'Rescheduled', value: 'rescheduled', count: hsStatusCounts['rescheduled'] ?? 0 },
                        { label: 'Cancelled', value: 'cancelled', count: hsStatusCounts['cancelled'] ?? 0 },
                      ];
                    })()
                      .map((f) => (
                        <Button
                          key={f.value}
                          size="$2"
                          backgroundColor={hsStatusFilter === f.value ? theme.accent : theme.bgCardSecondary}
                          borderRadius={999}
                          onPress={() => {
                            setHsStatusFilter(f.value as typeof hsStatusFilter);
                            fetchHomeServiceRequests();
                          }}>
                          <Text color={hsStatusFilter === f.value ? '#FFFFFF' : theme.text} fontSize={t(12)} fontWeight="700">
                            {`${f.label} (${f.count})`}
                          </Text>
                        </Button>
                      ))}
                    <Button
                      size="$2"
                      backgroundColor={theme.bgCardSecondary}
                      color={theme.text}
                      borderRadius={10}
                      onPress={fetchHomeServiceRequests}
                      disabled={loading}>
                      Refresh
                    </Button>
                  </ScrollView>
                </YStack>

                {homeServiceRequests.map((r) => {
                  const statusText = String(r.status ?? 'pending').replaceAll('_', ' ');
                  const statusColor =
                    r.status === 'completed'
                      ? theme.success
                      : r.status === 'cancelled'
                        ? theme.danger
                        : r.status === 'assigned'
                          ? theme.info
                          : theme.warning;
                  const open = homeServiceUploadsOpenId === r.id;
                  const slot = `${r.preferred_date ? formatDateDDMMYYYY(r.preferred_date) : '—'}${r.preferred_time ? ` • ${r.preferred_time}` : ''}`;

                  return (
                    <YStack
                      key={r.id}
                      backgroundColor={theme.bgCard}
                      borderRadius={18}
                      padding={16}
                      gap="$2"
                      borderColor={theme.border}
                      borderWidth={1}>
                      <YStack gap="$1">
                        <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                          <YStack flex={1} gap={4}>
                            <XStack gap={8} alignItems="center">
                              <FontAwesome5 name={homeServiceIcon(r.service_key)} size={15} color={theme.accent} />
                              <Text color={theme.text} fontWeight="800" fontSize={t(16)}>
                                {homeServiceLabel(r.service_key)}
                              </Text>
                            </XStack>
                            <XStack gap={4} alignItems="center" flexWrap="wrap">
                              <Text color="#FFFFFF" fontWeight="800" fontSize={t(14)}>Customer:</Text>
                              <Text color={theme.textMuted} fontSize={t(14)}>{r.customer_name ?? '—'} • </Text>
                              {r.customer_phone ? (
                                <Pressable onPress={() => Linking.openURL(`tel:${r.customer_phone}`)}>
                                  <Text color="#3B82F6" fontWeight="700" fontSize={t(14)} style={{ textDecorationLine: 'underline' }}>
                                    {r.customer_phone}
                                  </Text>
                                </Pressable>
                              ) : (
                                <Text color={theme.textMuted} fontSize={t(14)}>—</Text>
                              )}
                            </XStack>
                            <Text color={theme.textMuted} fontSize={t(14)}>
                              {r.locality || r.city || r.state
                                ? `${r.locality ?? ''}${r.locality ? ', ' : ''}${r.city ?? ''}${r.city ? ', ' : ''}${r.state ?? ''}`
                                : 'Location not provided'}
                            </Text>
                            <Text color={theme.textMuted} fontSize={t(14)}>
                              Slot: {slot}
                            </Text>
                          </YStack>

                          <YStack alignItems="flex-end" gap={6}>
                            <Text color={statusColor} fontSize={t(14)} fontWeight="700">
                              Status: {statusText}
                            </Text>
                            <Button
                              size="$2"
                              backgroundColor={theme.inputBg}
                              color={theme.inputText}
                              borderRadius={10}
                              disabled={homeServiceUploadsBusyId === r.id}
                              onPress={async () => {
                                const nextOpen = open ? null : r.id;
                                setHomeServiceUploadsOpenId(nextOpen);
                                if (nextOpen) await fetchHomeServiceUploads(r.id);
                              }}>
                              {open ? 'Hide media' : 'Media'}
                            </Button>
                          </YStack>
                        </XStack>

                        {r.notes ? (
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            Notes: {r.notes}
                          </Text>
                        ) : null}
                      </YStack>

                      <XStack gap="$2" flexWrap="wrap">
                        {['pending', 'assigned', 'completed', 'cancelled'].map((s) => (
                          <Button
                            key={s}
                            size="$2"
                            backgroundColor={String(r.status ?? 'pending') === s ? (s === 'cancelled' ? theme.danger : theme.accent) : theme.bgCardSecondary}
                            color={String(r.status ?? 'pending') === s ? '#FFFFFF' : theme.text}
                            borderRadius={999}
                            disabled={homeServiceStatusBusyId === r.id}
                            onPress={() => {
                              if (s === 'cancelled') {
                                setCancelHomeServiceModalId(r.id);
                              } else {
                                updateHomeServiceStatus(r.id, s);
                              }
                            }}>
                            {s.replaceAll('_', ' ')}
                          </Button>
                        ))}
                        <Button
                          size="$2"
                          backgroundColor={String(r.status ?? '') === 'rescheduled' ? theme.accent : theme.bgCardSecondary}
                          color={String(r.status ?? '') === 'rescheduled' ? '#FFFFFF' : theme.text}
                          borderRadius={999}
                          disabled={homeServiceStatusBusyId === r.id}
                          onPress={() => setHsRescheduleDialogId(r.id)}>
                          Reschedule
                        </Button>
                      </XStack>

                      {open ? (
                        <YStack
                          backgroundColor={theme.bgCardSecondary}
                          borderRadius={14}
                          padding={12}
                          gap="$2"
                          borderWidth={1}
                          borderColor={theme.border}>
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            Uploaded files
                          </Text>
                          {(homeServiceUploads[r.id] ?? []).length ? (
                            (homeServiceUploads[r.id] ?? []).map((u) => {
                              const url = String(u.file_url ?? '').trim();
                              const label = u.file_name || (u.file_type?.includes('video') ? 'Video' : 'Photo');
                              return (
                                <Pressable
                                  key={u.id}
                                  onPress={() => {
                                    if (!url) return;
                                    Linking.openURL(url);
                                  }}>
                                  <XStack
                                    justifyContent="space-between"
                                    alignItems="center"
                                    paddingVertical={8}
                                    paddingHorizontal={10}
                                    borderRadius={10}
                                    backgroundColor={theme.bgCard}
                                    borderWidth={1}
                                    borderColor={theme.border}
                                    gap="$2">
                                    <YStack flex={1} gap="$1">
                                      <Text color={theme.text} fontSize={t(15)} fontWeight="700" numberOfLines={1}>
                                        {label}
                                      </Text>
                                      <Text color={theme.textMuted} fontSize={t(13)} numberOfLines={1}>
                                        {u.file_type ?? 'file'}
                                      </Text>
                                    </YStack>
                                    <Text color={theme.textMuted} fontSize={t(13)}>
                                      Open
                                    </Text>
                                  </XStack>
                                </Pressable>
                              );
                            })
                          ) : (
                            <Text color={theme.textMuted} fontSize={t(14)}>
                              No uploads.
                            </Text>
                          )}
                        </YStack>
                      ) : null}
                    </YStack>
                  );
                })}

                {!homeServiceRequests.length ? (
                  <Text color={theme.textMuted} fontSize={t(14)}>
                    No home service requests.
                  </Text>
                ) : null}
                <MobileDatePicker value={hsStartPickerValue} open={hsStartDatePickerOpen} onClose={() => setHsStartDatePickerOpen(false)} onChange={(d) => { setHsStartDate(isoDay(d)); }} />
                <MobileDatePicker value={hsEndPickerValue} open={hsEndDatePickerOpen} onClose={() => setHsEndDatePickerOpen(false)} onChange={(d) => { setHsEndDate(isoDay(d)); }} />
                <RescheduleDialog
                  open={!!hsRescheduleDialogId}
                  title="Reschedule service"
                  confirmLabel="Reschedule service"
                  busy={Boolean(homeServiceStatusBusyId && homeServiceStatusBusyId === hsRescheduleDialogId)}
                  onClose={() => setHsRescheduleDialogId(null)}
                  onConfirm={async (day, timeLabel) => {
                    const requestId = hsRescheduleDialogId;
                    const iso = new Date(`${day}T${timeLabelTo24h(timeLabel)}:00`).toISOString();
                    await updateHomeServiceStatus(requestId ?? '', 'rescheduled', {
                      preferred_date: day,
                      preferred_time: timeLabel,
                      reschedule_date: iso,
                    });
                    setHsRescheduleDialogId(null);
                  }}
                />
                <Modal visible={Boolean(cancelHomeServiceModalId)} transparent animationType="fade" onRequestClose={() => setCancelHomeServiceModalId(null)}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <YStack backgroundColor={theme.bgCard} borderRadius={18} padding={20} maxWidth={400} width="100%" gap="$3" borderWidth={1} borderColor={theme.border}>
                      <Text fontSize={t(18)} fontWeight="900" color={theme.text}>Cancel Booking</Text>
                      <Text fontSize={t(14)} color={theme.textMuted}>Do you really want to cancel this booking?</Text>
                      <XStack gap="$3" justifyContent="flex-end" marginTop={10}>
                        <Button size="$3" backgroundColor={theme.bgCardSecondary} color={theme.text} onPress={() => setCancelHomeServiceModalId(null)}>
                          NO
                        </Button>
                        <Button size="$3" backgroundColor={theme.danger} color="#FFFFFF" onPress={async () => {
                          if (cancelHomeServiceModalId) {
                            const targetId = cancelHomeServiceModalId;
                            setCancelHomeServiceModalId(null);
                            await updateHomeServiceStatus(targetId, 'cancelled');
                          }
                        }}>
                          YES
                        </Button>
                      </XStack>
                    </YStack>
                  </View>
                </Modal>
              </YStack>
            ) : null}

            {activeSection === 'quote_requests' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor={theme.bgCard}
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor={theme.border}>
                  <Text color={theme.text} fontWeight="700" fontSize={t(16)}>
                    Quote requests
                  </Text>
                  <Text color={theme.textMuted} fontSize={t(14)}>
                    View, search, filter and update callback request status.
                  </Text>
                  <XStack gap="$2" flexWrap="wrap" alignItems="center">
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={170}
                        flexGrow={1}
                        flexBasis={170}>
                        <input
                          value={quoteStartDate}
                          onChange={(e) => setQuoteStartDate((e.target as any).value)}
                          type="date"
                          placeholder="Start Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setQuoteStartPickerValue(quoteStartDate ? new Date(`${quoteStartDate}T00:00:00.000Z`) : new Date());
                          setQuoteStartDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                        <Input
                          value={quoteStartDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="Start date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={170}
                        flexGrow={1}
                        flexBasis={170}>
                        <input
                          value={quoteEndDate}
                          onChange={(e) => setQuoteEndDate((e.target as any).value)}
                          type="date"
                          placeholder="End Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setQuoteEndPickerValue(quoteEndDate ? new Date(`${quoteEndDate}T00:00:00.000Z`) : new Date());
                          setQuoteEndDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                        <Input
                          value={quoteEndDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="End date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    <Input
                      value={quoteRequestSearch}
                      onChangeText={setQuoteRequestSearch}
                      placeholder="Search by name, service, or phone"
                      backgroundColor={theme.inputBg}
                      borderColor={theme.border}
                      color={theme.inputText}
                      minWidth={220}
                      flexGrow={2}
                      flexBasis={220}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true} style={{ marginBottom: 2 }} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                      {(() => {
                        const countFor = (statuses: string[]) =>
                          quoteRequests.filter((q) => {
                            const s = String(q.status ?? 'pending').trim().toLowerCase();
                            return statuses.includes(s === 'completed' ? 'complete' : s === 'canceled' ? 'cancelled' : s);
                          }).length;
                        return [
                          { label: 'All', value: 'all', count: quoteRequests.length },
                          { label: 'Pending', value: 'pending', count: countFor(['pending']) },
                          { label: 'Complete', value: 'complete', count: countFor(['complete']) },
                          { label: 'Cancelled', value: 'cancelled', count: countFor(['cancelled']) },
                        ];
                      })()
                        .map((filter) => (
                          <Button
                            key={filter.value}
                            size="$2"
                            backgroundColor={quoteRequestStatusFilter === filter.value ? theme.accent : theme.bgCardSecondary}
                            borderRadius={999}
                            onPress={() => setQuoteRequestStatusFilter(filter.value as any)}>
                            <Text color={quoteRequestStatusFilter === filter.value ? '#FFFFFF' : theme.text} fontSize={t(12)} fontWeight="700">
                              {`${filter.label} (${filter.count})`}
                            </Text>
                          </Button>
                        ))}
                    </ScrollView>
                  </XStack>
                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      size="$2"
                      backgroundColor={theme.accent}
                      color="#FFFFFF"
                      borderRadius={10}
                      onPress={fetchQuoteRequests}
                      disabled={loading}>
                      Refresh
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.bgCardSecondary}
                      color={theme.text}
                      borderRadius={10}
                      onPress={exportQuoteRequestsCsv}
                      disabled={!quoteRequests.length || quoteRequestsExportCsvLoading}>
                      {quoteRequestsExportCsvLoading ? 'Exporting...' : 'Export CSV'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.bgCardSecondary}
                      color={theme.text}
                      borderRadius={10}
                      onPress={exportQuoteRequestsPdf}
                      disabled={!quoteRequests.length || quoteRequestsExportPdfLoading}>
                      {quoteRequestsExportPdfLoading ? 'Exporting...' : 'Export PDF'}
                    </Button>
                  </XStack>
                  <MobileDatePicker value={quoteStartPickerValue} open={quoteStartDatePickerOpen} onClose={() => setQuoteStartDatePickerOpen(false)} onChange={(d) => { setQuoteStartDate(isoDay(d)); }} />
                  <MobileDatePicker value={quoteEndPickerValue} open={quoteEndDatePickerOpen} onClose={() => setQuoteEndDatePickerOpen(false)} onChange={(d) => { setQuoteEndDate(isoDay(d)); }} />
                </YStack>

                {filteredQuoteRequests.map((request) => {
                  const normalizedStatus = String(request.status ?? 'pending').trim().toLowerCase();
                  const statusKey = normalizedStatus === 'completed' ? 'complete' : normalizedStatus === 'canceled' ? 'cancelled' : normalizedStatus;
                  const statusText = statusKey.replaceAll('_', ' ');
                  const statusColor =
                    statusKey === 'complete'
                      ? theme.success
                      : statusKey === 'cancelled'
                        ? theme.danger
                        : theme.warning;
                  const remarkDraft = quoteRequestRemarkDrafts[request.id] ?? request.remark ?? '';
                  return (
                    <YStack
                      key={request.id}
                      backgroundColor={theme.bgCard}
                      borderRadius={18}
                      padding={16}
                      gap="$2"
                      borderWidth={1}
                      borderColor={theme.border}>
                      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                        <YStack flex={1} gap={4}>
                          <Text color={theme.text} fontWeight="800" fontSize={t(16)}>
                            {request.name ?? 'Unknown'} • {request.service ?? 'Service'}
                          </Text>
                          <XStack gap={4} alignItems="center" flexWrap="wrap">
                            {request.phone ? (
                              <Pressable onPress={() => Linking.openURL(`tel:${request.phone}`)}>
                                <Text color="#3B82F6" fontWeight="700" fontSize={t(14)} style={{ textDecorationLine: 'underline' }}>
                                  {request.phone}
                                </Text>
                              </Pressable>
                            ) : (
                              <Text color={theme.textMuted} fontSize={t(14)}>—</Text>
                            )}
                            <Text color={theme.textMuted} fontSize={t(14)}> • {request.email ?? '—'}</Text>
                          </XStack>
                          <Text color={theme.textMuted} fontSize={t(14)} numberOfLines={2}>
                            {request.message ?? 'No message provided.'}
                          </Text>
                          <Text color={theme.textMuted} fontSize={t(14)}>
                            Source: {request.source ?? 'Web'} • Created: {formatDateTimeDDMMYYYY(request.created_at)}
                          </Text>
                        </YStack>
                        <Text color={statusColor} fontSize={t(14)} fontWeight="700">
                          {statusText}
                        </Text>
                      </XStack>

                      <Input
                        value={remarkDraft}
                        onChangeText={(text) => setQuoteRequestRemarkDrafts((prev) => ({ ...prev, [request.id]: text }))}
                        placeholder="Add remark"
                        backgroundColor={theme.inputBg}
                        borderColor={theme.border}
                        color={theme.inputText}
                        minWidth={200}
                        flexGrow={1}
                        flexBasis={200}
                      />

                      <XStack gap="$2" flexWrap="wrap" alignItems="center">
                        <Button
                          size="$2"
                          backgroundColor="#2563EB"
                          color="#FFFFFF"
                          borderRadius={10}
                          disabled={!request.email}
                          onPress={() => {
                            if (!request.email) {
                              Alert.alert('No Email', 'Customer email address is not available.');
                              return;
                            }
                            const remarkText = quoteRequestRemarkDrafts[request.id] ?? request.remark ?? request.message ?? '';
                            const mailUrl = `mailto:${request.email}?subject=${encodeURIComponent('Gujarat Relocation - Quote Request Update')}&body=${encodeURIComponent(remarkText)}`;
                            Linking.openURL(mailUrl).catch(() => {
                              Alert.alert('Error', 'Could not open mail client.');
                            });
                          }}>
                          Send Email
                        </Button>
                        {(['pending', 'complete', 'cancelled'] as const).map((nextStatus) => (
                          <Button
                            key={nextStatus}
                            size="$2"
                            backgroundColor={statusKey === nextStatus ? theme.accent : theme.bgCardSecondary}
                            color={statusKey === nextStatus ? '#FFFFFF' : theme.text}
                            borderRadius={999}
                            disabled={quoteRequestStatusBusyId === request.id}
                            onPress={async () => {
                              if (!request.id) return;
                              setQuoteRequestStatusBusyId(request.id);
                              try {
                                const { error } = await supabase
                                  .from('quote_requests')
                                  .update({ status: nextStatus, remark: quoteRequestRemarkDrafts[request.id] ?? request.remark, updated_at: new Date().toISOString() } as any)
                                  .eq('id', request.id);
                                if (error) {
                                  setError(error.message);
                                } else {
                                  await fetchQuoteRequests();
                                }
                              } catch (e) {
                                const message = e instanceof Error ? e.message : String(e);
                                setError(message || 'Failed to update quote request.');
                              } finally {
                                setQuoteRequestStatusBusyId(null);
                              }
                            }}>
                            {nextStatus.replaceAll('_', ' ')}
                          </Button>
                        ))}
                      </XStack>
                    </YStack>
                  );
                })}

                {!filteredQuoteRequests.length ? (
                  <Text color={theme.textMuted} fontSize={t(14)}>
                    No quote requests found.
                  </Text>
                ) : null}
              </YStack>
            ) : null}

            {activeSection === 'reports' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor={theme.bgCard}
                  borderRadius={18}
                  padding={16}
                  gap="$3"
                  borderWidth={1}
                  borderColor={theme.border}>
                  <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                    <YStack gap={4}>
                      <Text color={theme.text} fontWeight="800" fontSize={t(16)}>
                        Reports & analytics
                      </Text>
                      <Text color={theme.textMuted} fontSize={t(14)}>
                        Bookings summary between selected dates.
                      </Text>
                    </YStack>
                    <XStack gap="$2" flexWrap="wrap">
                      <Button
                        size="$2"
                        backgroundColor={theme.bgCardSecondary}
                        color={theme.text}
                        borderRadius={10}
                        onPress={() => {
                          ensureReportsDefaultDates();
                          fetchReportsBookings();
                          fetchReportsPayments();
                        }}>
                        Refresh
                      </Button>
                      <Button
                        size="$2"
                        backgroundColor={theme.accent}
                        color={'#FFFFFF'}
                        borderRadius={10}
                        onPress={exportReportsBookingsCsv}
                        disabled={reportsLoading || !reportsBookings.length || reportsExportBookingsCsvLoading}>
                        {reportsExportBookingsCsvLoading ? 'Exporting...' : 'Export bookings CSV'}
                      </Button>
                      <Button
                        size="$2"
                        backgroundColor={theme.accent}
                        color={'#FFFFFF'}
                        borderRadius={10}
                        onPress={exportReportsPaymentsCsv}
                        disabled={reportsLoading || !reportsPayments.length || reportsExportPaymentsCsvLoading}>
                        {reportsExportPaymentsCsvLoading ? 'Exporting...' : 'Export payments CSV'}
                      </Button>
                      <Button
                        size="$2"
                        backgroundColor={theme.bgCardSecondary}
                        color={theme.text}
                        borderRadius={10}
                        onPress={() => (router as any).push('/(tabs)/admin-history' as any)}>
                        Audit logs
                      </Button>
                    </XStack>
                  </XStack>

                  {/* Service Type Filter */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                    {([
                      { label: 'All', value: 'all', icon: 'th-large' },
                      { label: 'Shifting', value: 'shifting', icon: 'truck' },
                      { label: 'Home Services', value: 'home_services', icon: 'tools' },
                      { label: 'Properties', value: 'properties', icon: 'building' },
                    ] as const).map((tab) => (
                      <Button
                        key={tab.value}
                        size="$2"
                        backgroundColor={reportsServiceType === tab.value ? theme.accent : theme.bgCardSecondary}
                        borderRadius={999}
                        onPress={() => setReportsServiceType(tab.value)}>
                        <XStack gap={6} alignItems="center">
                          <FontAwesome5 name={tab.icon as any} size={12} color={reportsServiceType === tab.value ? '#FFFFFF' : theme.text} />
                          <Text color={reportsServiceType === tab.value ? '#FFFFFF' : theme.text} fontSize={t(12)} fontWeight="700">
                            {tab.label}
                          </Text>
                        </XStack>
                      </Button>
                    ))}
                  </ScrollView>

                  <XStack gap="$2" flexWrap="wrap" alignItems="center">
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={170}
                        flexGrow={1}
                        flexBasis={170}>
                        <input
                          value={reportsStartDate}
                          onChange={(e) => setReportsStartDate((e.target as any).value)}
                          type="date"
                          placeholder="Start Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setReportsStartPickerValue(reportsStartDate ? new Date(`${reportsStartDate}T00:00:00.000Z`) : new Date());
                          setReportsStartDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                        <Input
                          value={reportsStartDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="Start date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    {Platform.OS === 'web' ? (
                      <YStack
                        backgroundColor={theme.bgCardSecondary}
                        borderColor={theme.border}
                        borderWidth={1}
                        borderRadius={10}
                        paddingHorizontal={12}
                        paddingVertical={10}
                        minWidth={170}
                        flexGrow={1}
                        flexBasis={170}>
                        <input
                          value={reportsEndDate}
                          onChange={(e) => setReportsEndDate((e.target as any).value)}
                          type="date"
                          placeholder="End Date"
                          className="admin-date-input"
                          style={{
                            width: '100%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: theme.inputText,
                            outline: 'none',
                          }}
                        />
                      </YStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setReportsEndPickerValue(reportsEndDate ? new Date(`${reportsEndDate}T00:00:00.000Z`) : new Date());
                          setReportsEndDatePickerOpen(true);
                        }}
                        style={{ flexGrow: 1, flexBasis: 170, minWidth: 170 } as any}>
                        <Input
                          value={reportsEndDate}
                          editable={false}
                          pointerEvents="none"
                          placeholder="End date"
                          backgroundColor={theme.bgCardSecondary}
                          borderColor={theme.border}
                          color={theme.inputText}
                        />
                      </Pressable>
                    )}
                    <Button
                      size="$2"
                      backgroundColor={theme.accent}
                      color={'#FFFFFF'}
                      borderRadius={10}
                      onPress={() => {
                        fetchReportsBookings();
                        fetchReportsPayments();
                      }}
                      disabled={reportsLoading}>
                      Apply
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor={theme.bgCardSecondary}
                      color={theme.text}
                      borderRadius={10}
                      onPress={() => {
                        setReportsStartDate('');
                        setReportsEndDate('');
                        setTimeout(() => {
                          fetchReportsBookings();
                          fetchReportsPayments();
                        }, 0);
                      }}
                      disabled={reportsLoading}>
                      Last 30 days
                    </Button>
                  </XStack>
                  <MobileDatePicker value={reportsStartPickerValue} open={reportsStartDatePickerOpen} onClose={() => setReportsStartDatePickerOpen(false)} onChange={(d) => { setReportsStartDate(isoDay(d)); }} />
                  <MobileDatePicker value={reportsEndPickerValue} open={reportsEndDatePickerOpen} onClose={() => setReportsEndDatePickerOpen(false)} onChange={(d) => { setReportsEndDate(isoDay(d)); }} />

                  {reportsLoading ? <Text color={theme.textMuted}>Loading report...</Text> : null}
                  {reportsError ? <Text color="#FCA5A5">{reportsError}</Text> : null}
                </YStack>

                {(() => {
                  const filteredReportBookings = reportsServiceType === 'all'
                    ? reportsBookings
                    : reportsServiceType === 'shifting'
                      ? reportsBookings.filter((b) => !(b as any).service_type || (b as any).service_type === 'shifting')
                      : reportsBookings.filter((b) => (b as any).service_type === reportsServiceType);

                  const total = filteredReportBookings.length;
                  const byStatus: Record<string, number> = {};
                  const byDriver: Record<string, number> = {};
                  let advanceSum = 0;
                  let remainingSum = 0;

                  const paymentByStatus: Record<string, number> = {};
                  const paymentByMethod: Record<string, number> = {};
                  let paidAmountSum = 0;
                  let paymentCount = 0;

                  const driverStats: Record<
                    string,
                    {
                      delivered: number;
                      cancelled: number;
                      total: number;
                      durationMsSum: number;
                      durationCount: number;
                    }
                  > = {};

                  const monthKey = (iso: string | null | undefined) => {
                    if (!iso) return '';
                    const d = new Date(iso);
                    if (!Number.isFinite(d.getTime())) return '';
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    return `${y}-${m}`;
                  };

                  const monthlyBookings: Record<string, number> = {};
                  const monthlyPaidAmount: Record<string, number> = {};

                  for (const b of filteredReportBookings) {
                    const status = String((b as any).status ?? 'unknown').trim() || 'unknown';
                    byStatus[status] = (byStatus[status] ?? 0) + 1;

                    const m = monthKey((b as any).created_at);
                    if (m) monthlyBookings[m] = (monthlyBookings[m] ?? 0) + 1;

                    const driver = getBookingDriver(b as any);
                    const driverName = String(driver.name ?? '').trim() || 'Unassigned';
                    byDriver[driverName] = (byDriver[driverName] ?? 0) + 1;

                    const adv = Number((b as any).advance_amount ?? 0);
                    const rem = Number((b as any).remaining_amount ?? 0);
                    if (Number.isFinite(adv)) advanceSum += adv;
                    if (Number.isFinite(rem)) remainingSum += rem;

                    if (driverName !== 'Unassigned') {
                      if (!driverStats[driverName]) {
                        driverStats[driverName] = {
                          delivered: 0,
                          cancelled: 0,
                          total: 0,
                          durationMsSum: 0,
                          durationCount: 0,
                        };
                      }
                      driverStats[driverName].total += 1;
                      if (status === 'delivered') {
                        driverStats[driverName].delivered += 1;
                        const started = new Date((b as any).created_at ?? '').getTime();
                        const ended = new Date((b as any).updated_at ?? '').getTime();
                        if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
                          driverStats[driverName].durationMsSum += ended - started;
                          driverStats[driverName].durationCount += 1;
                        }
                      }
                      if (status === 'cancelled') {
                        driverStats[driverName].cancelled += 1;
                      }
                    }
                  }

                  for (const p of reportsPayments) {
                    paymentCount += 1;
                    const st = String((p as any).status ?? 'unknown').trim() || 'unknown';
                    paymentByStatus[st] = (paymentByStatus[st] ?? 0) + 1;

                    const method =
                      String((p as any)?.booking?.payment_method ?? '').trim() ||
                      String((p as any)?.metadata?.method ?? '').trim() ||
                      'unknown';
                    paymentByMethod[method] = (paymentByMethod[method] ?? 0) + 1;

                    const amt = Number((p as any).amount ?? 0);
                    if (Number.isFinite(amt) && st === 'paid') {
                      paidAmountSum += amt;
                      const m = monthKey((p as any).created_at);
                      if (m) monthlyPaidAmount[m] = (monthlyPaidAmount[m] ?? 0) + amt;
                    }
                  }

                  const statusEntries = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
                  const maxCount = Math.max(1, ...statusEntries.map((x) => x[1]));
                  const topDrivers = Object.entries(byDriver)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);

                  const paymentStatusEntries = Object.entries(paymentByStatus).sort((a, b) => b[1] - a[1]);
                  const paymentMethodEntries = Object.entries(paymentByMethod).sort((a, b) => b[1] - a[1]);
                  const paymentMaxCount = Math.max(1, ...paymentStatusEntries.map((x) => x[1]));
                  const paymentMethodMaxCount = Math.max(1, ...paymentMethodEntries.map((x) => x[1]));

                  const driverPerfEntries = Object.entries(driverStats)
                    .map(([name, s]) => {
                      const cancelRate = s.total ? s.cancelled / s.total : 0;
                      const avgMs = s.durationCount ? s.durationMsSum / s.durationCount : 0;
                      return { name, ...s, cancelRate, avgMs };
                    })
                    .sort((a, b) => b.delivered - a.delivered)
                    .slice(0, 8);

                  const allMonths = Array.from(
                    new Set([...Object.keys(monthlyBookings), ...Object.keys(monthlyPaidAmount)])
                  ).sort();
                  const monthMaxBookings = Math.max(1, ...Object.values(monthlyBookings));
                  const monthMaxPaid = Math.max(1, ...Object.values(monthlyPaidAmount));

                  const formatDuration = (ms: number) => {
                    if (!ms || !Number.isFinite(ms)) return '—';
                    const minutes = Math.round(ms / (1000 * 60));
                    const hours = Math.floor(minutes / 60);
                    const mins = minutes % 60;
                    if (hours <= 0) return `${mins}m`;
                    return `${hours}h ${mins}m`;
                  };

                  return (
                    <YStack gap="$3">
                      <XStack gap="$2" flexWrap="wrap">
                        <YStack
                          backgroundColor={theme.bgCard}
                          borderRadius={18}
                          padding={16}
                          gap="$1"
                          borderWidth={1}
                          borderColor={theme.border}
                          minWidth={220}
                          flexGrow={1}
                          flexBasis={220}>
                          <Text color={theme.textMuted} fontSize={t(14)}>Total bookings</Text>
                          <Text color={theme.text} fontWeight="900" fontSize={t(24)}>{String(total)}</Text>
                        </YStack>

                        <YStack
                          backgroundColor={theme.bgCard}
                          borderRadius={18}
                          padding={16}
                          gap="$1"
                          borderWidth={1}
                          borderColor={theme.border}
                          minWidth={220}
                          flexGrow={1}
                          flexBasis={220}>
                          <Text color={theme.textMuted} fontSize={t(14)}>Advance collected</Text>
                          <Text color={theme.text} fontWeight="900" fontSize={t(24)}>₹{Math.round(advanceSum).toLocaleString('en-IN')}</Text>
                        </YStack>

                        <YStack
                          backgroundColor={theme.bgCard}
                          borderRadius={18}
                          padding={16}
                          gap="$1"
                          borderWidth={1}
                          borderColor={theme.border}
                          minWidth={220}
                          flexGrow={1}
                          flexBasis={220}>
                          <Text color={theme.textMuted} fontSize={t(14)}>Remaining amount</Text>
                          <Text color={theme.text} fontWeight="900" fontSize={t(24)}>₹{Math.round(remainingSum).toLocaleString('en-IN')}</Text>
                        </YStack>

                        <YStack
                          backgroundColor={theme.bgCard}
                          borderRadius={18}
                          padding={16}
                          gap="$1"
                          borderWidth={1}
                          borderColor={theme.border}
                          minWidth={220}
                          flexGrow={1}
                          flexBasis={220}>
                          <Text color={theme.textMuted} fontSize={t(14)}>Payments (paid)</Text>
                          <Text color={theme.text} fontWeight="900" fontSize={t(24)}>₹{Math.round(paidAmountSum).toLocaleString('en-IN')}</Text>
                          <Text color={theme.textMuted} fontSize={t(13)}>From {String(paymentCount)} payment record(s)</Text>
                        </YStack>
                      </XStack>

                      <YStack
                        backgroundColor={theme.bgCard}
                        borderRadius={18}
                        padding={16}
                        gap="$2"
                        borderWidth={1}
                        borderColor={theme.border}>
                        <Text color={theme.text} fontWeight="800">Bookings by status</Text>
                        {!statusEntries.length ? (
                          <Text color={theme.textMuted} fontSize={t(14)}>No data for selected range.</Text>
                        ) : (
                          <YStack gap={10}>
                            {statusEntries.map(([st, count]) => {
                              const pct = Math.max(0.06, count / maxCount);
                              return (
                                <YStack key={st} gap={6}>
                                  <XStack justifyContent="space-between" alignItems="center">
                                    <Text color={theme.text} fontSize={t(14)} fontWeight="800">{st.replaceAll('_', ' ')}</Text>
                                    <Text color={theme.textMuted} fontSize={t(14)}>{String(count)}</Text>
                                  </XStack>
                                  <YStack height={10} backgroundColor={theme.bgCardSecondary} borderRadius={999} overflow="hidden">
                                    <YStack height={10} width={`${Math.round(pct * 100)}%`} backgroundColor={theme.accent} />
                                  </YStack>
                                </YStack>
                              );
                            })}
                          </YStack>
                        )}
                      </YStack>

                      <YStack
                        backgroundColor={theme.bgCard}
                        borderRadius={18}
                        padding={16}
                        gap="$2"
                        borderWidth={1}
                        borderColor={theme.border}>
                        <Text color={theme.text} fontWeight="800">Payments by status</Text>
                        {!paymentStatusEntries.length ? (
                          <Text color={theme.textMuted} fontSize={t(14)}>No payments for selected range.</Text>
                        ) : (
                          <YStack gap={10}>
                            {paymentStatusEntries.map(([st, count]) => {
                              const pct = Math.max(0.06, count / paymentMaxCount);
                              return (
                                <YStack key={st} gap={6}>
                                  <XStack justifyContent="space-between" alignItems="center">
                                    <Text color={theme.text} fontSize={t(14)} fontWeight="800">{st.replaceAll('_', ' ')}</Text>
                                    <Text color={theme.textMuted} fontSize={t(14)}>{String(count)}</Text>
                                  </XStack>
                                  <YStack height={10} backgroundColor={theme.bgCardSecondary} borderRadius={999} overflow="hidden">
                                    <YStack height={10} width={`${Math.round(pct * 100)}%`} backgroundColor={theme.accent} />
                                  </YStack>
                                </YStack>
                              );
                            })}
                          </YStack>
                        )}
                      </YStack>

                      <YStack
                        backgroundColor={theme.bgCard}
                        borderRadius={18}
                        padding={16}
                        gap="$2"
                        borderWidth={1}
                        borderColor={theme.border}>
                        <Text color={theme.text} fontWeight="800">Payments by method</Text>
                        {!paymentMethodEntries.length ? (
                          <Text color={theme.textMuted} fontSize={t(14)}>No payment methods found.</Text>
                        ) : (
                          <YStack gap={10}>
                            {paymentMethodEntries.slice(0, 8).map(([method, count]) => {
                              const pct = Math.max(0.06, count / paymentMethodMaxCount);
                              return (
                                <YStack key={method} gap={6}>
                                  <XStack justifyContent="space-between" alignItems="center">
                                    <Text color={theme.text} fontSize={t(14)} fontWeight="800">{method.replaceAll('_', ' ')}</Text>
                                    <Text color={theme.textMuted} fontSize={t(14)}>{String(count)}</Text>
                                  </XStack>
                                  <YStack height={10} backgroundColor={theme.bgCardSecondary} borderRadius={999} overflow="hidden">
                                    <YStack height={10} width={`${Math.round(pct * 100)}%`} backgroundColor={theme.accent} />
                                  </YStack>
                                </YStack>
                              );
                            })}
                          </YStack>
                        )}
                      </YStack>

                      <YStack
                        backgroundColor={theme.bgCard}
                        borderRadius={18}
                        padding={16}
                        gap="$2"
                        borderWidth={1}
                        borderColor={theme.border}>
                        <Text color={theme.text} fontWeight="800">Driver performance (approx.)</Text>
                        <Text color={theme.textMuted} fontSize={t(13)}>
                          Avg completion time uses created_at → updated_at for delivered bookings.
                        </Text>
                        {!driverPerfEntries.length ? (
                          <Text color={theme.textMuted} fontSize={t(14)}>No driver data found for selected range.</Text>
                        ) : (
                          <YStack gap={10}>
                            {driverPerfEntries.map((d) => (
                              <YStack key={d.name} gap={6} paddingBottom={6} borderBottomWidth={1} borderColor={theme.border}>
                                <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                                  <Text color={theme.text} fontSize={t(14)} fontWeight="900">{d.name}</Text>
                                  <Text color={theme.textMuted} fontSize={t(14)}>
                                    Delivered: {String(d.delivered)} | Cancelled: {String(d.cancelled)} | Cancel rate:{' '}
                                    {`${Math.round(d.cancelRate * 100)}%`}
                                  </Text>
                                </XStack>
                                <Text color={theme.textMuted} fontSize={t(14)}>Avg completion: {formatDuration(d.avgMs)}</Text>
                              </YStack>
                            ))}
                          </YStack>
                        )}
                      </YStack>

                      <YStack
                        backgroundColor={theme.bgCard}
                        borderRadius={18}
                        padding={16}
                        gap="$2"
                        borderWidth={1}
                        borderColor={theme.border}>
                        <Text color={theme.text} fontWeight="800">Monthly trends</Text>
                        {!allMonths.length ? (
                          <Text color={theme.textMuted} fontSize={t(14)}>No monthly data for selected range.</Text>
                        ) : (
                          <YStack gap={12}>
                            <YStack gap={10}>
                              <Text color={theme.textMuted} fontSize={t(14)}>Bookings per month</Text>
                              {allMonths.map((m) => {
                                const count = monthlyBookings[m] ?? 0;
                                const pct = Math.max(0.06, count / monthMaxBookings);
                                return (
                                  <YStack key={`b-${m}`} gap={6}>
                                    <XStack justifyContent="space-between" alignItems="center">
                                      <Text color={theme.text} fontSize={t(14)} fontWeight="800">{m}</Text>
                                      <Text color={theme.textMuted} fontSize={t(14)}>{String(count)}</Text>
                                    </XStack>
                                    <YStack height={10} backgroundColor={theme.bgCardSecondary} borderRadius={999} overflow="hidden">
                                      <YStack height={10} width={`${Math.round(pct * 100)}%`} backgroundColor={theme.accent} />
                                    </YStack>
                                  </YStack>
                                );
                              })}
                            </YStack>

                            <YStack gap={10}>
                              <Text color={theme.textMuted} fontSize={t(14)}>Paid amount per month</Text>
                              {allMonths.map((m) => {
                                const amt = monthlyPaidAmount[m] ?? 0;
                                const pct = Math.max(0.06, amt / monthMaxPaid);
                                return (
                                  <YStack key={`p-${m}`} gap={6}>
                                    <XStack justifyContent="space-between" alignItems="center">
                                      <Text color={theme.text} fontSize={t(14)} fontWeight="800">{m}</Text>
                                      <Text color={theme.textMuted} fontSize={t(14)}>₹{Math.round(amt).toLocaleString('en-IN')}</Text>
                                    </XStack>
                                    <YStack height={10} backgroundColor={theme.bgCardSecondary} borderRadius={999} overflow="hidden">
                                      <YStack height={10} width={`${Math.round(pct * 100)}%`} backgroundColor={theme.accent} />
                                    </YStack>
                                  </YStack>
                                );
                              })}
                            </YStack>
                          </YStack>
                        )}
                      </YStack>

                      <YStack
                        backgroundColor={theme.bgCard}
                        borderRadius={18}
                        padding={16}
                        gap="$2"
                        borderWidth={1}
                        borderColor={theme.border}>
                        <Text color={theme.text} fontWeight="800">Top drivers (by assigned bookings)</Text>
                        {!topDrivers.length ? (
                          <Text color={theme.textMuted} fontSize={t(14)}>No driver assignments found.</Text>
                        ) : (
                          <YStack gap={10}>
                            {topDrivers.map(([name, count]) => (
                              <XStack key={name} justifyContent="space-between" alignItems="center">
                                <Text color={theme.text} fontSize={t(14)} fontWeight="800">{name}</Text>
                                <Text color={theme.textMuted} fontSize={t(14)}>{String(count)}</Text>
                              </XStack>
                            ))}
                          </YStack>
                        )}
                      </YStack>
                    </YStack>
                  );
                })()}
              </YStack>
            ) : null}
          </>
        )}
        <ConfirmDialog
          open={!!cancelBookingDialogId}
          title="Do you want to cancel this booking?"
          message="This will cancel the booking and notify the customer."
          onClose={() => setCancelBookingDialogId(null)}
          onConfirm={() => {
            const targetId = cancelBookingDialogId;
            if (!targetId) return;
            setCancelBookingDialogId(null);
            void updateBookingStatus(targetId, 'cancelled');
          }}
        />
      </YStack>
      </ScrollView>
    </View>
  );
}
