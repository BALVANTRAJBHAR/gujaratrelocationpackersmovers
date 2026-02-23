import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView } from 'react-native';
import TextRecognition from 'react-native-text-recognition';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import DateTimePicker from '@/components/AppDateTimePicker';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/providers/session-provider';

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
  pickup_address: string | null;
  drop_address: string | null;
  status: string | null;
  payment_status: string | null;
  driver_id?: string | null;
  advance_amount?: number | null;
  remaining_amount?: number | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at?: string | null;
  user:
    | { name: string | null; phone: string | null; email: string | null }[]
    | { name: string | null; phone: string | null; email: string | null }
    | null;
  driver: { name: string | null }[] | null;
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
};

export default function AdminScreen() {
  const { session, profile } = useSession();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#0B0B12' : '#FFFFFF';
  const panelBg = isDark ? '#111827' : '#F3F4F6';
  const border = isDark ? '#1F2937' : '#E5E7EB';
  const titleColor = isDark ? '#F9FAFB' : '#111827';
  const muted = isDark ? '#9CA3AF' : '#6B7280';
  const idleBtnBg = isDark ? '#111827' : '#E5E7EB';
  const idleBtnText = isDark ? '#E5E7EB' : '#111827';
  const activeBtnBg = '#F97316';
  const activeBtnText = '#0B0B12';
  const params = useLocalSearchParams<{ section?: string }>();
  const router = useRouter();
  const sectionParam = (params as any)?.section;
  const section = Array.isArray(sectionParam) ? sectionParam[0] : sectionParam;
  const { refreshProfile } = useSession();
  const maxContentWidth = 1200;
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [bookings, setBookings] = useState<BookingAdmin[]>([]);
  const [assigningBookingId, setAssigningBookingId] = useState<string | null>(null);
  const [assignDriverBusy, setAssignDriverBusy] = useState<string | null>(null);
  const [staffMembers, setStaffMembers] = useState<StaffProfile[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeAdmin[]>([]);
  const [floorOptions, setFloorOptions] = useState<FloorOptionAdmin[]>([]);
  const [coupons, setCoupons] = useState<CouponAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'users' | 'vehicles' | 'floors' | 'coupons' | 'bookings' | 'reports'>(
    'users'
  );
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
  const [bookingStartDate, setBookingStartDate] = useState('');
  const [bookingEndDate, setBookingEndDate] = useState('');
  const [bookingUserFilter, setBookingUserFilter] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [reschedulePickerBookingId, setReschedulePickerBookingId] = useState<string | null>(null);
  const [reschedulePickerValue, setReschedulePickerValue] = useState<Date>(new Date());

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

  const uploadUserDocumentImageAndGetPublicUrl = async (effectiveUserId: string, uri: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const uploaderId = auth.user?.id;
    if (!uploaderId) throw new Error('Please login again.');

    const inferredExt = (uri.split('.').pop() || '').toLowerCase();
    const fileExt = inferredExt && inferredExt.length <= 5 ? inferredExt : 'jpg';
    const filePath = `${uploaderId}/${effectiveUserId}/user-doc-${Date.now()}.${fileExt}`;

    const response = await fetch(uri);
    const contentTypeFromFetch = response.headers.get('content-type');
    const fixedExt = fileExt === 'jpg' && contentTypeFromFetch ? guessDocImageExtFromMime(contentTypeFromFetch) : fileExt;
    const finalPath =
      fixedExt !== fileExt ? `${uploaderId}/${effectiveUserId}/user-doc-${Date.now()}.${fixedExt}` : filePath;
    const contentType = guessDocImageContentType(contentTypeFromFetch, fixedExt);
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage.from('driver-docs').upload(finalPath, bytes, {
      contentType,
      upsert: true,
    });

    if (uploadError) throw new Error(uploadError.message);
    const { data } = supabase.storage.from('driver-docs').getPublicUrl(finalPath);
    return data.publicUrl;
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

    const uri = result.assets[0].uri;
    setDocumentFormImageUri(uri);

    try {
      const lines =
        Platform.OS === 'web' ? await recognizeTextFromWebImage(uri) : await TextRecognition.recognize(uri);
      const extracted = extractDocumentNumber(documentFormType, lines);
      if (extracted) {
        setDocumentFormNumber((prev) => (prev.trim() ? prev : extracted));
      }
    } catch {
      // ignore
    }
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
    if (normalized === 'vehicles' || normalized === 'floors' || normalized === 'coupons' || normalized === 'users') {
      setActiveSection(normalized as typeof activeSection);
    }
  }, [section]);

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
          const rows: Array<{
            user_id: string;
            document_type: string;
            document_number: string;
            image_url?: string | null;
            created_by?: string | null;
          }> = [];

          for (const doc of pendingDocuments) {
            let image_url: string | null = null;
            if (doc.image_uri) {
              image_url = await uploadUserDocumentImageAndGetPublicUrl(managedUserForm.id, doc.image_uri);
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

  const BOOKING_STATUS_STEPS: Array<{ key: string; label: string }> = [
    { key: 'not_started', label: 'Start' },
    { key: 'pickup_reached', label: 'Pickup reached' },
    { key: 'in_transit', label: 'In Transit' },
    { key: 'delivered', label: 'Delivered' },
  ];

  const normalizeBookingStepperStatus = (status: string | null) => {
    const s = String(status ?? '').trim();
    if (!s) return null;
    if (s === 'pending' || s === 'assigned') return 'not_started';
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
                fontSize={11}
                paddingHorizontal={10}
                paddingVertical={6}
                borderRadius={999}
                backgroundColor={isActive ? '#F97316' : '#0F172A'}
                color={isActive ? '#0B0B12' : '#94A3B8'}>
                {step.label}
              </Text>
              {idx !== BOOKING_STATUS_STEPS.length - 1 ? (
                <Text color="#374151" fontSize={12}>
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

      const { data: publicUrl } = supabase.storage.from('vehicle-images').getPublicUrl(fileName);
      setVehicleForm((p) => ({ ...p, image_url: publicUrl.publicUrl }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image upload failed');
    } finally {
      setLoading(false);
    }
  };

  const resetFloorForm = () => {
    setFloorForm({
      id: null,
      label: '',
      sort_order: '0',
      charge_with_lift: '0',
      charge_without_lift: '0',
      is_active: true,
    });
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

  const fetchBookings = async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    let query = supabase
      .from('bookings')
      .select(
        'id, pickup_address, drop_address, status, payment_status, driver_id, advance_amount, remaining_amount, scheduled_at, created_at, updated_at, user:users!user_id(name, phone, email), driver:users!driver_id(name)'
      )
      .order('created_at', { ascending: false });

    if (bookingFilter !== 'all') {
      query = query.eq('status', bookingFilter);
    }
    if (bookingStartDate) {
      query = query.gte('created_at', `${bookingStartDate}T00:00:00.000Z`);
    }
    if (bookingEndDate) {
      query = query.lte('created_at', `${bookingEndDate}T23:59:59.999Z`);
    }

    const { data, error: fetchError } = await query;
    if (fetchError) {
      if (!String(fetchError.message ?? '').includes('AbortError')) {
        setError(fetchError.message);
      }
    } else {
      const items = (data ?? []) as BookingAdmin[];
      if (bookingUserFilter) {
        const search = bookingUserFilter.toLowerCase();
        setBookings(
          items.filter(
            (booking) => {
              const user = getBookingUser(booking);
              return (
                user.name?.toLowerCase().includes(search) ||
                user.phone?.toLowerCase().includes(search) ||
                user.email?.toLowerCase().includes(search)
              );
            }
          )
        );
      } else {
        setBookings(items);
      }
    }
    setLoading(false);
  };

  const updateBookingStatus = async (bookingId: string, status: string, rescheduleOverride?: string) => {
    setLoading(true);
    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    const nextRescheduleDate = rescheduleOverride ?? rescheduleDate;
    if (status === 'rescheduled' && !nextRescheduleDate) {
      setError('Please provide reschedule date (YYYY-MM-DD).');
      setLoading(false);
      return;
    }
    if (status === 'rescheduled') payload.reschedule_date = nextRescheduleDate;

    const { error: updateError } = await supabase.from('bookings').update(payload).eq('id', bookingId);
    if (updateError) {
      setError(updateError.message);
    } else {
      try {
        await supabase.functions.invoke('send-booking-status-push', {
          body: { booking_id: bookingId, status },
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

  useEffect(() => {
    if (!canManage) return;
    if (activeSection === 'users') fetchManagedUsers();
    if (activeSection === 'vehicles') fetchVehicleTypes();
    if (activeSection === 'floors') fetchFloorOptions();
    if (activeSection === 'coupons') fetchCoupons();
    if (activeSection === 'bookings') fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, canManage]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: pageBg }}
      contentContainerStyle={{ padding: 24, paddingBottom: 40 } as any}
      keyboardShouldPersistTaps="handled">
      <YStack width="100%" maxWidth={maxContentWidth} alignSelf="center" gap="$4">
        <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" rowGap="$3">
          <YStack gap="$1">
            <Text color={activeBtnBg} fontSize={12} letterSpacing={2} textTransform="uppercase">
              Admin
            </Text>
            <H2 color={titleColor}>Admin dashboard</H2>
            <Paragraph color={muted}>Manage staff, bookings, approvals, and reports.</Paragraph>
          </YStack>
          <XStack gap="$2" flexWrap="wrap" justifyContent="flex-end">
            <Button
              size="$2"
              backgroundColor={idleBtnBg}
              color={idleBtnText}
              borderRadius={10}
              onPress={() => {
                fetchDrivers();
                fetchStaff();
                fetchManagedUsers();
                fetchBookings();
                fetchVehicleTypes();
                fetchFloorOptions();
                fetchCoupons();
              }}>
              Refresh
            </Button>
          </XStack>
        </XStack>

        {!canManage ? (
          <YStack backgroundColor={panelBg} padding={20} borderRadius={18} gap="$2" borderWidth={1} borderColor={border}>
            <Text color={titleColor} fontWeight="700">Admin access only</Text>
            <Text color={muted} fontSize={12}>
              You do not have permission to manage drivers.
            </Text>
          </YStack>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 2 } as any}>
              {[
                { label: 'User Management', value: 'users' },
                { label: 'Vehicle Types', value: 'vehicles' },
                { label: 'Floors', value: 'floors' },
                { label: 'Coupons', value: 'coupons' },
                { label: 'Bookings', value: 'bookings' },
              ].map((tab) => (
                <Button
                  key={tab.value}
                  size="$2"
                  backgroundColor={activeSection === tab.value ? activeBtnBg : idleBtnBg}
                  color={activeSection === tab.value ? activeBtnText : idleBtnText}
                  borderRadius={999}
                  onPress={() => setActiveSection(tab.value as typeof activeSection)}>
                  {tab.label}
                </Button>
              ))}
            </ScrollView>

            {loading ? <Text color="#94A3B8">Loading...</Text> : null}
            {error ? <Text color="#FCA5A5">{error}</Text> : null}

            {activeSection === 'users' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor="#111827"
                  borderRadius={18}
                  padding={16}
                  gap="$3"
                  borderWidth={1}
                  borderColor="#1F2937">
                  <Text color="#F9FAFB" fontWeight="800" fontSize={14}>
                    User management
                  </Text>

                  {userMgmtInfo ? (
                    <Text color="#93C5FD" fontSize={12}>
                      {userMgmtInfo}
                    </Text>
                  ) : null}

                  <XStack gap="$2" flexWrap="wrap" alignItems="center">
                    <Input
                      value={userSearchText}
                      onChangeText={setUserSearchText}
                      placeholder="Search by name/phone/email"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
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
                          backgroundColor={userRoleFilter === opt.value ? '#F97316' : '#0F172A'}
                          color={userRoleFilter === opt.value ? '#0B0B12' : '#E5E7EB'}
                          borderRadius={999}
                          onPress={() => setUserRoleFilter(opt.value)}>
                          {opt.label}
                        </Button>
                      ))}
                    </XStack>
                  </XStack>
                </YStack>

                {!filteredManagedUsers.length ? (
                  <YStack backgroundColor="#111827" borderRadius={18} padding={16} borderWidth={1} borderColor="#1F2937" gap="$1">
                    <Text color="#F9FAFB" fontWeight="800">No users found</Text>
                    <Text color="#94A3B8" fontSize={12}>
                      Try changing filters or ensure users exist with role driver/staff/admin/worker.
                    </Text>
                  </YStack>
                ) : null}

                {filteredManagedUsers.map((item, idx) => {
                  const isSelected = selectedManagedUserId === item.id;
                  const roleKey = (item.role ?? 'staff').toString().toLowerCase();
                  const badgeColor =
                    roleKey === 'worker'
                      ? '#0EA5E9'
                      : roleKey === 'customer'
                        ? '#94A3B8'
                      : roleKey === 'admin'
                        ? '#F97316'
                        : roleKey === 'driver'
                          ? '#A78BFA'
                          : '#22C55E';

                  return (
                    <Pressable key={`${String(item.id ?? '').trim() || 'managed-user'}-${idx}`} onPress={() => selectManagedUser(item)}>
                      <YStack
                        backgroundColor={isSelected ? '#0F172A' : '#111827'}
                        borderRadius={18}
                        padding={16}
                        gap="$2"
                        borderWidth={1}
                        borderColor={isSelected ? '#F97316' : '#1F2937'}>
                        <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                          <YStack gap={6} flexShrink={1}>
                            <XStack gap="$2" alignItems="center" flexWrap="wrap">
                              <Text color="#F9FAFB" fontWeight="900" fontSize={15}>
                                {item.name ?? '—'}
                              </Text>
                              <YStack backgroundColor={badgeColor} paddingHorizontal={10} paddingVertical={5} borderRadius={999}>
                                <Text color="#0B0B12" fontWeight="900" fontSize={11}>
                                  {(item.role ?? 'staff').toString().toUpperCase()}
                                </Text>
                              </YStack>
                            </XStack>
                            <Text color="#94A3B8" fontSize={12}>Phone: {item.phone ?? '—'}</Text>
                            <Text color="#94A3B8" fontSize={12}>Email: {item.email ?? '—'}</Text>
                          </YStack>
                          <YStack alignItems="flex-end" gap="$2">
                            <Text color={item.is_verified ? '#22C55E' : '#FCA5A5'} fontSize={12} fontWeight="800">
                              {item.is_verified ? 'ACTIVE' : 'INACTIVE'}
                            </Text>
                            <Text color="#94A3B8" fontSize={12}>Tap to edit</Text>
                          </YStack>
                        </XStack>
                      </YStack>
                    </Pressable>
                  );
                })}

                {managedUserForm.id ? (
                  <YStack backgroundColor="#111827" borderRadius={18} padding={16} gap="$3" borderWidth={1} borderColor="#1F2937">
                    <Text color="#F9FAFB" fontWeight="800" fontSize={14}>
                      Edit user
                    </Text>

                    <XStack gap="$2" flexWrap="wrap">
                      <Input
                        value={managedUserForm.name}
                        onChangeText={(v) => setManagedUserForm((p) => ({ ...p, name: v }))}
                        placeholder="Name"
                        backgroundColor="#0F172A"
                        borderColor="#1F2937"
                        color="#E5E7EB"
                        minWidth={220}
                        flexGrow={2}
                        flexBasis={260}
                      />
                      <Input
                        value={managedUserForm.phone}
                        onChangeText={(v) => setManagedUserForm((p) => ({ ...p, phone: v }))}
                        placeholder="Phone"
                        backgroundColor="#0F172A"
                        borderColor="#1F2937"
                        color="#E5E7EB"
                        minWidth={180}
                        flexGrow={1}
                        flexBasis={200}
                      />
                      <Input
                        value={managedUserForm.email}
                        editable={false as any}
                        placeholder="Email"
                        backgroundColor="#0B0B12"
                        borderColor="#1F2937"
                        color="#94A3B8"
                        minWidth={240}
                        flexGrow={2}
                        flexBasis={260}
                      />
                    </XStack>

                    <XStack gap="$2" flexWrap="wrap" alignItems="center">
                      <Text color="#E5E7EB" fontSize={12} fontWeight="800">
                        Role:
                      </Text>
                      {(['customer', 'driver', 'staff', 'admin', 'worker'] as const).map((r) => (
                        <Button
                          key={r}
                          size="$2"
                          backgroundColor={managedUserForm.role === r ? '#F97316' : '#0F172A'}
                          color={managedUserForm.role === r ? '#0B0B12' : '#E5E7EB'}
                          borderRadius={999}
                          onPress={() => setManagedUserForm((p) => ({ ...p, role: r }))}>
                          {r.toUpperCase()}
                        </Button>
                      ))}

                      <Button
                        size="$2"
                        backgroundColor={managedUserForm.is_verified ? '#22C55E' : '#EF4444'}
                        color="#0B0B12"
                        borderRadius={999}
                        onPress={() => setManagedUserForm((p) => ({ ...p, is_verified: !p.is_verified }))}>
                        {managedUserForm.is_verified ? 'Active' : 'Inactive'}
                      </Button>
                    </XStack>

                    <YStack gap="$2" backgroundColor="#0F172A" borderRadius={14} padding={12} borderWidth={1} borderColor="#1F2937">
                      <Text color="#E5E7EB" fontSize={12} fontWeight="800">
                        Documents
                      </Text>

                      {userDocuments.length ? (
                        <YStack gap="$2">
                          {userDocuments.map((doc, idx) => (
                            <XStack
                              key={`${String(doc.id ?? '').trim() || 'user-doc'}-${idx}`}
                              justifyContent="space-between"
                              alignItems="center"
                              flexWrap="wrap"
                              gap="$2"
                              backgroundColor="#111827"
                              borderRadius={12}
                              padding={10}
                              borderWidth={1}
                              borderColor="#1F2937">
                              <YStack gap={4} flexShrink={1}>
                                <Text color="#F9FAFB" fontWeight="800" fontSize={12}>
                                  {(doc.document_type ?? '').toString().toUpperCase()}
                                </Text>
                                <Text color="#E5E7EB" fontSize={12}>
                                  {doc.document_number}
                                </Text>
                                <Text color="#94A3B8" fontSize={11}>
                                  {new Date(doc.created_at).toLocaleString()}
                                </Text>
                              </YStack>
                              <XStack gap="$2" alignItems="center">
                                {doc.image_url ? (
                                  <Pressable
                                    onPress={() => {
                                      try {
                                        void Linking.openURL(doc.image_url as string);
                                      } catch {
                                        // ignore
                                      }
                                    }}>
                                    <Image
                                      source={{ uri: doc.image_url }}
                                      style={{ width: 68, height: 44, borderRadius: 8, backgroundColor: '#0F172A' }}
                                      resizeMode="cover"
                                    />
                                  </Pressable>
                                ) : (
                                  <YStack
                                    width={68}
                                    height={44}
                                    borderRadius={8}
                                    backgroundColor="#0F172A"
                                    borderWidth={1}
                                    borderColor="#1F2937"
                                    alignItems="center"
                                    justifyContent="center">
                                    <Text color="#94A3B8" fontSize={10}>
                                      No image
                                    </Text>
                                  </YStack>
                                )}
                              </XStack>
                            </XStack>
                          ))}
                        </YStack>
                      ) : (
                        <Text color="#94A3B8" fontSize={12}>
                          No documents added.
                        </Text>
                      )}

                      {pendingDocuments.length ? (
                        <YStack gap="$2" paddingTop={6}>
                          <Text color="#E5E7EB" fontSize={12} fontWeight="800">
                            Pending documents (will save on Save)
                          </Text>
                          {pendingDocuments.map((doc, idx) => (
                            <XStack
                              key={`${String(doc.key ?? '').trim() || 'pending-doc'}-${idx}`}
                              justifyContent="space-between"
                              alignItems="center"
                              flexWrap="wrap"
                              gap="$2"
                              backgroundColor="#111827"
                              borderRadius={12}
                              padding={10}
                              borderWidth={1}
                              borderColor="#1F2937">
                              <YStack gap={4} flexShrink={1}>
                                <Text color="#F9FAFB" fontWeight="800" fontSize={12}>
                                  {(doc.document_type ?? '').toString().toUpperCase()}
                                </Text>
                                <Text color="#E5E7EB" fontSize={12}>
                                  {doc.document_number}
                                </Text>
                              </YStack>
                              <XStack gap="$2" alignItems="center">
                                {doc.image_uri ? (
                                  <Image
                                    source={{ uri: doc.image_uri }}
                                    style={{ width: 68, height: 44, borderRadius: 8, backgroundColor: '#0F172A' }}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <YStack
                                    width={68}
                                    height={44}
                                    borderRadius={8}
                                    backgroundColor="#0F172A"
                                    borderWidth={1}
                                    borderColor="#1F2937"
                                    alignItems="center"
                                    justifyContent="center">
                                    <Text color="#94A3B8" fontSize={10}>
                                      No image
                                    </Text>
                                  </YStack>
                                )}
                                <Button
                                  size="$2"
                                  backgroundColor="#111827"
                                  color="#FCA5A5"
                                  borderRadius={10}
                                  onPress={() => setPendingDocuments((p) => p.filter((x) => x.key !== doc.key))}
                                  disabled={documentBusy}>
                                  Remove
                                </Button>
                              </XStack>
                            </XStack>
                          ))}
                        </YStack>
                      ) : null}

                      <YStack gap="$2" paddingTop={4}>
                        <Text color="#E5E7EB" fontSize={12} fontWeight="800">
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
                              backgroundColor={documentFormType === opt.value ? '#F97316' : '#111827'}
                              color={documentFormType === opt.value ? '#0B0B12' : '#E5E7EB'}
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
                            backgroundColor="#111827"
                            borderColor="#1F2937"
                            color="#E5E7EB"
                            minWidth={240}
                            flexGrow={2}
                            flexBasis={260}
                          />

                          <Button
                            size="$2"
                            backgroundColor="#111827"
                            color="#E5E7EB"
                            borderRadius={10}
                            onPress={() => pickDocumentImage('gallery')}
                            disabled={documentBusy}>
                            Pick image
                          </Button>
                          {Platform.OS !== 'web' ? (
                            <Button
                              size="$2"
                              backgroundColor="#111827"
                              color="#E5E7EB"
                              borderRadius={10}
                              onPress={() => pickDocumentImage('camera')}
                              disabled={documentBusy}>
                              Camera
                            </Button>
                          ) : null}

                          <Button
                            size="$2"
                            backgroundColor="#F97316"
                            color="#0B0B12"
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
                              style={{ width: 68, height: 44, borderRadius: 8, backgroundColor: '#0F172A' }}
                              resizeMode="cover"
                            />
                            <Text color="#94A3B8" fontSize={11}>
                              Image selected.
                            </Text>
                          </XStack>
                        ) : null}
                      </YStack>
                    </YStack>

                    <XStack gap="$2" flexWrap="wrap">
                      <Button
                        size="$3"
                        backgroundColor="#F97316"
                        color="#0B0B12"
                        borderRadius={12}
                        onPress={saveManagedUser}
                        disabled={loading}>
                        Save
                      </Button>
                      <Button
                        size="$3"
                        backgroundColor="#0F172A"
                        color="#E5E7EB"
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
                    </XStack>
                  </YStack>
                ) : null}
              </YStack>
            ) : null}

            {activeSection === 'vehicles' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor="#111827"
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor="#1F2937">
                  <Text color="#F9FAFB" fontWeight="700" fontSize={14}>
                    Manage vehicle types
                  </Text>
                  <Text color="#94A3B8" fontSize={12}>
                    Add or update vehicles shown in the booking wizard.
                  </Text>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={vehicleForm.name}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, name: v }))}
                      placeholder="Vehicle name (e.g., Tata Ace)"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={220}
                      flexGrow={2}
                      flexBasis={260}
                    />
                    <Input
                      value={vehicleForm.capacity}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, capacity: v }))}
                      placeholder="Capacity (e.g., 750 kg)"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
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
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                    <Input
                      value={vehicleForm.vehicle_number}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, vehicle_number: v }))}
                      placeholder="Vehicle number"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                    <Input
                      value={vehicleForm.vehicle_model}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, vehicle_model: v }))}
                      placeholder="Vehicle model"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                  </XStack>

                  <Input
                    value={vehicleForm.description}
                    onChangeText={(v) => setVehicleForm((p) => ({ ...p, description: v }))}
                    placeholder="Description"
                    backgroundColor="#0F172A"
                    borderColor="#1F2937"
                    color="#E5E7EB"
                  />

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={vehicleForm.base_price}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, base_price: v }))}
                      placeholder="Base price"
                      keyboardType="numeric"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={150}
                      flexGrow={1}
                      flexBasis={160}
                    />
                    <Input
                      value={vehicleForm.per_km_price}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, per_km_price: v }))}
                      placeholder="Per km price"
                      keyboardType="numeric"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={150}
                      flexGrow={1}
                      flexBasis={160}
                    />
                    <Input
                      value={vehicleForm.labor_price}
                      onChangeText={(v) => setVehicleForm((p) => ({ ...p, labor_price: v }))}
                      placeholder="Labor price"
                      keyboardType="numeric"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={150}
                      flexGrow={1}
                      flexBasis={160}
                    />
                  </XStack>

                  <Input
                    value={vehicleForm.image_url}
                    onChangeText={(v) => setVehicleForm((p) => ({ ...p, image_url: v }))}
                    placeholder="Image URL"
                    backgroundColor="#0F172A"
                    borderColor="#1F2937"
                    color="#E5E7EB"
                  />

                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      size="$2"
                      backgroundColor={vehicleForm.is_active ? '#22C55E' : '#111827'}
                      color={vehicleForm.is_active ? '#0B0B12' : '#E5E7EB'}
                      borderRadius={999}
                      onPress={() => setVehicleForm((p) => ({ ...p, is_active: !p.is_active }))}>
                      {vehicleForm.is_active ? 'Active' : 'Inactive'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#F97316"
                      color="#0B0B12"
                      borderRadius={10}
                      onPress={upsertVehicleType}
                      disabled={loading}>
                      {vehicleForm.id ? 'Update vehicle' : 'Add vehicle'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#111827"
                      color="#E5E7EB"
                      borderRadius={10}
                      onPress={resetVehicleForm}
                      disabled={loading}>
                      Clear
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#0F172A"
                      color="#E5E7EB"
                      borderRadius={10}
                      onPress={fetchVehicleTypes}
                      disabled={loading}>
                      Refresh list
                    </Button>
                  </XStack>
                </YStack>

                <YStack gap="$3">
                  {vehicleTypes.map((item, idx) => (
                    <YStack key={`${String(item.id ?? '').trim() || 'vehicle-type'}-${idx}`} backgroundColor="#111827" borderRadius={18} padding={16} gap="$2">
                      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                        <YStack>
                          <Text color="#F9FAFB" fontWeight="700" fontSize={14}>
                            {item.name}
                          </Text>
                          <Text color="#94A3B8" fontSize={12}>
                            {item.description ?? '—'}
                          </Text>
                        </YStack>
                        <Button
                          size="$2"
                          backgroundColor={item.is_active ? '#22C55E' : '#EF4444'}
                          color="#0B0B12"
                          borderRadius={10}
                          onPress={() => toggleVehicleActive(item.id, !(item.is_active ?? true))}
                          disabled={loading}>
                          {item.is_active ? 'Disable' : 'Enable'}
                        </Button>
                      </XStack>
                      <Text color="#94A3B8" fontSize={12}>Capacity: {item.capacity ?? '—'}</Text>
                      {(item.vehicle_type || item.vehicle_number || item.vehicle_model) ? (
                        <Text color="#94A3B8" fontSize={12}>
                          Type: {item.vehicle_type ?? '—'} • No: {item.vehicle_number ?? '—'} • Model: {item.vehicle_model ?? '—'}
                        </Text>
                      ) : null}
                      <Text color="#94A3B8" fontSize={12}>
                        Base: {item.base_price ?? '—'} • Per km: {item.per_km_price ?? '—'} • Labor: {item.labor_price ?? '—'}
                      </Text>
                      <Text color="#94A3B8" fontSize={12}>Image: {item.image_url ?? '—'}</Text>
                      <XStack gap="$2" flexWrap="wrap">
                        <Button
                          size="$2"
                          backgroundColor="#0F172A"
                          color="#E5E7EB"
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
                      </XStack>
                    </YStack>
                  ))}
                </YStack>
              </YStack>
            ) : null}

            {activeSection === 'coupons' ? (
              <YStack gap="$3">
                <YStack
                  backgroundColor="#111827"
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor="#1F2937">
                  <Text color="#F9FAFB" fontWeight="700" fontSize={14}>
                    Manage coupons
                  </Text>
                  <Text color="#94A3B8" fontSize={12}>
                    Create discount codes for bookings.
                  </Text>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={couponForm.code}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, code: v }))}
                      placeholder="Code (e.g., SAVE50)"
                      autoCapitalize="characters"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={220}
                    />
                    <Input
                      value={couponForm.title}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, title: v }))}
                      placeholder="Title (optional)"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
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
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={220}
                    />
                    <Input
                      value={couponForm.discount_value}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, discount_value: v }))}
                      placeholder="Discount value"
                      keyboardType="numeric"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                    <Input
                      value={couponForm.max_discount}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, max_discount: v }))}
                      placeholder="Max discount (optional)"
                      keyboardType="numeric"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
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
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={200}
                    />
                    <Input
                      value={couponForm.usage_limit}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, usage_limit: v }))}
                      placeholder="Usage limit (optional)"
                      keyboardType="numeric"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
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
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={220}
                    />
                    <Input
                      value={couponForm.valid_until}
                      onChangeText={(v) => setCouponForm((p) => ({ ...p, valid_until: v }))}
                      placeholder="Valid until (YYYY-MM-DD)"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={220}
                    />
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      size="$2"
                      backgroundColor={couponForm.is_active ? '#22C55E' : '#111827'}
                      color={couponForm.is_active ? '#0B0B12' : '#E5E7EB'}
                      borderRadius={999}
                      onPress={() => setCouponForm((p) => ({ ...p, is_active: !p.is_active }))}>
                      {couponForm.is_active ? 'Active' : 'Inactive'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#F97316"
                      color="#0B0B12"
                      borderRadius={10}
                      onPress={upsertCoupon}
                      disabled={loading}>
                      {couponForm.id ? 'Update coupon' : 'Add coupon'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#111827"
                      color="#E5E7EB"
                      borderRadius={10}
                      onPress={resetCouponForm}
                      disabled={loading}>
                      Clear
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#0F172A"
                      color="#E5E7EB"
                      borderRadius={10}
                      onPress={fetchCoupons}
                      disabled={loading}>
                      Refresh list
                    </Button>
                  </XStack>
                </YStack>

                <YStack gap="$3">
                  {coupons.map((item) => (
                    <YStack key={item.id} backgroundColor="#111827" borderRadius={18} padding={16} gap="$2">
                      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                        <YStack>
                          <Text color="#F9FAFB" fontWeight="700" fontSize={14}>
                            {item.code}
                          </Text>
                          <Text color="#94A3B8" fontSize={12}>
                            {item.discount_type ?? '—'} • {item.discount_value ?? '—'}
                            {item.max_discount ? ` (max ${item.max_discount})` : ''}
                          </Text>
                        </YStack>
                        <XStack gap="$2" flexWrap="wrap">
                          <Button
                            size="$2"
                            backgroundColor={item.is_active ? '#22C55E' : '#EF4444'}
                            color="#0B0B12"
                            borderRadius={10}
                            onPress={() => toggleCouponActive(item.id, !(item.is_active ?? true))}
                            disabled={loading}>
                            {item.is_active ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="$2"
                            backgroundColor="#0F172A"
                            color="#E5E7EB"
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
                      <Text color="#94A3B8" fontSize={12}>
                        Min order: {item.min_order_amount ?? 0} • Used: {item.used_count ?? 0}
                        {item.usage_limit ? ` / ${item.usage_limit}` : ''}
                      </Text>
                      <Text color="#94A3B8" fontSize={12}>
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
                  backgroundColor="#111827"
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor="#1F2937">
                  <Text color="#F9FAFB" fontWeight="700" fontSize={14}>
                    Manage floors
                  </Text>
                  <Text color="#94A3B8" fontSize={12}>
                    Add or update floor charges used in the booking wizard.
                  </Text>

                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={floorForm.label}
                      onChangeText={(v) => setFloorForm((p) => ({ ...p, label: v }))}
                      placeholder="Label (e.g., Ground, 1st, 2nd)"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={220}
                      flexGrow={2}
                      flexBasis={260}
                    />
                    <Input
                      value={floorForm.sort_order}
                      onChangeText={(v) => setFloorForm((p) => ({ ...p, sort_order: v }))}
                      placeholder={nextFloorSortOrder}
                      keyboardType="numeric"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
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
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={160}
                      flexGrow={1}
                      flexBasis={200}
                    />
                    <Input
                      value={floorForm.charge_without_lift}
                      onChangeText={(v) => setFloorForm((p) => ({ ...p, charge_without_lift: v }))}
                      placeholder="Charge (without lift)"
                      keyboardType="numeric"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={220}
                    />
                  </XStack>

                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      size="$2"
                      backgroundColor={floorForm.is_active ? '#22C55E' : '#111827'}
                      color={floorForm.is_active ? '#0B0B12' : '#E5E7EB'}
                      borderRadius={999}
                      onPress={() => setFloorForm((p) => ({ ...p, is_active: !p.is_active }))}>
                      {floorForm.is_active ? 'Active' : 'Inactive'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#F97316"
                      color="#0B0B12"
                      borderRadius={10}
                      onPress={upsertFloorOption}
                      disabled={loading}>
                      {floorForm.id ? 'Update floor' : 'Add floor'}
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#111827"
                      color="#E5E7EB"
                      borderRadius={10}
                      onPress={resetFloorForm}
                      disabled={loading}>
                      Clear
                    </Button>
                    <Button
                      size="$2"
                      backgroundColor="#0F172A"
                      color="#E5E7EB"
                      borderRadius={10}
                      onPress={fetchFloorOptions}
                      disabled={loading}>
                      Refresh list
                    </Button>
                  </XStack>
                </YStack>

                <YStack gap="$3">
                  {floorOptions.map((item) => (
                    <YStack key={item.id} backgroundColor="#111827" borderRadius={18} padding={16} gap="$2">
                      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                        <YStack>
                          <Text color="#F9FAFB" fontWeight="700" fontSize={14}>
                            {item.label}
                          </Text>
                          <Text color="#94A3B8" fontSize={12}>
                            Sort: {item.sort_order ?? 0} • With lift: {item.charge_with_lift ?? 0} • Without lift: {item.charge_without_lift ?? 0}
                          </Text>
                        </YStack>
                        <XStack gap="$2" flexWrap="wrap">
                          <Button
                            size="$2"
                            backgroundColor={item.is_active ? '#22C55E' : '#EF4444'}
                            color="#0B0B12"
                            borderRadius={10}
                            onPress={() => toggleFloorActive(item.id, !(item.is_active ?? true))}
                            disabled={loading}>
                            {item.is_active ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="$2"
                            backgroundColor="#0F172A"
                            color="#E5E7EB"
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
                  backgroundColor="#111827"
                  borderRadius={18}
                  padding={16}
                  gap="$2"
                  borderWidth={1}
                  borderColor="#1F2937">
                  <Text color="#F9FAFB" fontWeight="700" fontSize={14}>
                    Bookings
                  </Text>
                  <Text color="#94A3B8" fontSize={12}>
                    Filter and manage bookings.
                  </Text>
                  <XStack gap="$2" flexWrap="wrap">
                    <Input
                      value={bookingStartDate}
                      onChangeText={setBookingStartDate}
                      placeholder="Start date YYYY-MM-DD"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={180}
                    />
                    <Input
                      value={bookingEndDate}
                      onChangeText={setBookingEndDate}
                      placeholder="End date YYYY-MM-DD"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={180}
                      flexGrow={1}
                      flexBasis={180}
                    />
                    <Input
                      value={bookingUserFilter}
                      onChangeText={setBookingUserFilter}
                      placeholder="Filter by user name/phone/email"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={220}
                      flexGrow={2}
                      flexBasis={220}
                    />
                    <Input
                      value={rescheduleDate}
                      onChangeText={setRescheduleDate}
                      placeholder="Reschedule date YYYY-MM-DD"
                      backgroundColor="#0F172A"
                      borderColor="#1F2937"
                      color="#E5E7EB"
                      minWidth={200}
                      flexGrow={1}
                      flexBasis={200}
                    />
                  </XStack>
                  <XStack gap="$2" flexWrap="wrap">
                    {[
                      { label: 'All', value: 'all' },
                      { label: 'Not started', value: 'not_started' },
                      { label: 'Assigned', value: 'assigned' },
                      { label: 'Pickup reached', value: 'pickup_reached' },
                      { label: 'In Transit', value: 'in_transit' },
                      { label: 'Delivered', value: 'delivered' },
                      { label: 'Cancelled', value: 'cancelled' },
                    ].map((filter) => (
                      <Button
                        key={filter.value}
                        size="$2"
                        backgroundColor={bookingFilter === filter.value ? '#F97316' : '#111827'}
                        color={bookingFilter === filter.value ? '#0B0B12' : '#E5E7EB'}
                        borderRadius={999}
                        onPress={() => setBookingFilter(filter.value as typeof bookingFilter)}>
                        {filter.label}
                      </Button>
                    ))}
                    <Button
                      size="$2"
                      backgroundColor="#0F172A"
                      color="#E5E7EB"
                      borderRadius={10}
                      onPress={fetchBookings}
                      disabled={loading}>
                      Apply
                    </Button>
                  </XStack>
                </YStack>

                {bookings.map((item) => {
                  const user = getBookingUser(item);
                  const remaining = typeof item.remaining_amount === 'number' ? item.remaining_amount : null;
                  const paymentModeLabel = remaining !== null ? (remaining <= 0 ? 'Full' : 'Advance') : null;
                  const paidAmount = typeof item.advance_amount === 'number' ? item.advance_amount : null;
                  const canUpdateBooking = item.status !== 'cancelled' && item.status !== 'rescheduled';
                  const currentDriverId = (item as any).driver_id ?? null;
                  const canAssign = canUpdateBooking;
                  return (
                    <YStack
                      key={item.id}
                      backgroundColor="#111827"
                      borderRadius={18}
                      padding={16}
                      gap="$2"
                      borderColor="#1F2937"
                      borderWidth={1}>
                      <YStack gap="$1">
                        <Text color="#F9FAFB" fontWeight="800" fontSize={14}>
                          {item.pickup_address ?? 'Pickup'} → {item.drop_address ?? 'Drop'}
                        </Text>
                        <Text color="#94A3B8" fontSize={12}>
                          User: {user.name ?? '—'} • {user.phone ?? '—'} • {user.email ?? '—'}
                        </Text>
                        <Text color="#94A3B8" fontSize={12}>
                          Driver: {item.driver?.[0]?.name ?? 'Unassigned'}
                        </Text>
                      </YStack>

                      {renderBookingStepper(item.status)}

                      {canAssign ? (
                        <YStack gap="$2">
                          <XStack gap="$2" flexWrap="wrap" alignItems="center" justifyContent="space-between">
                            <Button
                              size="$2"
                              backgroundColor="#0F172A"
                              color="#E5E7EB"
                              borderRadius={10}
                              onPress={() => setAssigningBookingId((prev) => (prev === item.id ? null : item.id))}
                              disabled={loading || assignDriverBusy === item.id}>
                              Assign driver
                            </Button>
                            {currentDriverId ? (
                              <Button
                                size="$2"
                                backgroundColor="#111827"
                                color="#E5E7EB"
                                borderRadius={10}
                                onPress={() => assignDriverToBooking(item.id, null, currentDriverId)}
                                disabled={loading || assignDriverBusy === item.id}>
                                Unassign
                              </Button>
                            ) : null}
                          </XStack>

                          {assigningBookingId === item.id ? (
                            <YStack
                              backgroundColor="#0F172A"
                              borderRadius={14}
                              padding={12}
                              gap="$2"
                              borderWidth={1}
                              borderColor="#1F2937">
                              <Text color="#94A3B8" fontSize={12}>
                                Select driver
                              </Text>
                              <XStack gap="$2" flexWrap="wrap">
                                {drivers.map((d) => (
                                  <Button
                                    key={d.id}
                                    size="$2"
                                    backgroundColor={d.id === currentDriverId ? '#F97316' : '#111827'}
                                    color={d.id === currentDriverId ? '#0B0B12' : '#E5E7EB'}
                                    borderRadius={999}
                                    onPress={() => assignDriverToBooking(item.id, d.id, currentDriverId)}
                                    disabled={loading || assignDriverBusy === item.id}>
                                    {d.name ?? 'Driver'}
                                  </Button>
                                ))}
                              </XStack>
                              {!drivers.length ? (
                                <Text color="#94A3B8" fontSize={12}>
                                  No drivers found.
                                </Text>
                              ) : null}
                            </YStack>
                          ) : null}
                        </YStack>
                      ) : null}

                      <XStack gap="$2" flexWrap="wrap" justifyContent="space-between" alignItems="center">
                        <Text color="#94A3B8" fontSize={12}>
                          Status: {String(item.status ?? '—').replaceAll('_', ' ')}
                        </Text>
                        <Text color="#94A3B8" fontSize={12}>
                          Payment: {String(item.payment_status ?? '—').replaceAll('_', ' ')}
                          {paymentModeLabel ? ` (${paymentModeLabel})` : ''}
                        </Text>
                      </XStack>
                      <XStack gap="$2" flexWrap="wrap" justifyContent="space-between" alignItems="center">
                        <Text color="#94A3B8" fontSize={12}>
                          Paid: {paidAmount !== null ? `₹${paidAmount.toFixed(2)}` : '—'}
                        </Text>
                        <Text color="#94A3B8" fontSize={12}>
                          Updated: {item.updated_at ? new Date(item.updated_at).toLocaleString() : '—'}
                        </Text>
                      </XStack>
                      {canUpdateBooking ? (
                        <XStack gap="$2" flexWrap="wrap">
                          <Button
                            size="$2"
                            backgroundColor="#0F172A"
                            color="#E5E7EB"
                            borderRadius={10}
                            minWidth={120}
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
                            backgroundColor="#EF4444"
                            color="#0B0B12"
                            borderRadius={10}
                            minWidth={120}
                            onPress={() => updateBookingStatus(item.id, 'cancelled')}>
                            Cancel
                          </Button>
                          <Button
                            size="$2"
                            backgroundColor="#F97316"
                            color="#0B0B12"
                            borderRadius={10}
                            minWidth={120}
                            onPress={() => {
                              if (Platform.OS !== 'web') {
                                setReschedulePickerBookingId(item.id);
                                setReschedulePickerValue(new Date());
                                return;
                              }
                              updateBookingStatus(item.id, 'rescheduled');
                            }}>
                            Reschedule
                          </Button>
                        </XStack>
                      ) : null}
                    </YStack>
                  );
                })}
                {reschedulePickerBookingId ? (
                  <DateTimePicker
                    value={reschedulePickerValue}
                    mode="datetime"
                    onChange={(_event: any, selected?: Date) => {
                      if (!selected) {
                        setReschedulePickerBookingId(null);
                        return;
                      }
                      const bookingId = reschedulePickerBookingId;
                      setReschedulePickerBookingId(null);
                      const iso = selected.toISOString();
                      setRescheduleDate(iso);
                      void updateBookingStatus(bookingId, 'rescheduled', iso);
                    }}
                  />
                ) : null}
              </YStack>
            ) : null}
          </>
        )}
      </YStack>
    </ScrollView>
  );
}
