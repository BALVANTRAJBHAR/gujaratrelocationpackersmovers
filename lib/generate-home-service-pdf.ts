import * as Print from 'expo-print';
import { Platform } from 'react-native';
import { getLogoSrcForPdf } from '@/lib/get-logo-base64';
import { getQrDataUri } from '@/lib/get-qr-data-uri';
import { downloadPdf, sharePdf } from '@/lib/pdf-actions';
import { COMPANY_EMAIL, COMPANY_NAME, COMPANY_PHONE } from '@/constants/company';
import { createWebPdfUri } from '@/lib/web-pdf';
import { wrapAsPdf } from '@/lib/pdf-layout';
import { calculateConvenienceFee } from '@/lib/payment-convenience-fee';

type HomeServicePdfData = {
  id: string;
  booking_number?: number | null;
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
  payment_option: string | null;
  payment_status: string | null;
  advance_payment: number | null;
  after_service_payment_method: string | null;
  cash_paid_at: string | null;
  provider_id: string | null;
  provider_name: string | null;
};

const COMPANY_ADDRESS = 'Ahmedabad, Gujarat, India';
const COMPANY_CONTACT = `Phone: ${COMPANY_PHONE} | Email: ${COMPANY_EMAIL}`;
const HOME_SERVICE_PAYMENT = calculateConvenienceFee(150);

const serviceLabels: Record<string, string> = {
  ac: 'AC Service & Repair',
  carpenter: 'Carpenter',
  electrician: 'Electrician',
  plumber: 'Plumber',
  pest: 'Pest Control',
  cleaning: 'Deep Cleaning',
  painting: 'Painting',
  ro: 'RO Service',
};

function labelForService(key: string): string {
  return serviceLabels[String(key ?? '').toLowerCase()] || key;
}

function fmtCurrency(amount: number | null | undefined): string {
  const val = Number(amount ?? 0);
  if (!Number.isFinite(val) || val <= 0) return '₹0';
  return `₹${(Number.isInteger(val) ? val : Number(val.toFixed(2))).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(val) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return String(iso); }
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(iso); }
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function generateHomeServicePdf(data: HomeServicePdfData): Promise<string> {
  const bookingLabel = data.booking_number ? `GRH${data.booking_number}` : `RPT-HS-${String(data.id).slice(0, 8).toUpperCase()}`;
  const reportId = bookingLabel;
  console.log('[generateHomeServicePdf] Loading assets...');
  const [logo, qrUrl] = await Promise.all([
    getLogoSrcForPdf(),
    getQrDataUri(reportId),
  ]);
  console.log('[generateHomeServicePdf] Assets loaded, building HTML...');
  const now = new Date();
  const serviceLabel = labelForService(data.service_key);

  const paymentDone = (data.payment_option === 'online_now' && data.payment_status === 'paid') || data.payment_option === 'after_service';

  function paymentLabel(): string {
    if (data.payment_option === 'online_now' && data.payment_status === 'paid') {
      return 'Advance Paid';
    }
    if (data.payment_option === 'after_service') {
      return 'After Service';
    }
    return String(data.payment_status ?? 'pending').replace('_', ' ');
  }

  const extraCss = `
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .header-left img { width: 56px; height: 56px; object-fit: contain; }
  .company-details { flex: 1; }
  .company-name { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 2px 0; }
  .company-address { font-size: 11px; color: #64748b; margin: 0 0 1px 0; }
  .company-contact { font-size: 11px; color: #64748b; margin: 0; }
  .qr-section { text-align: right; }
  .qr-section img { width: 100px; height: 100px; }
  .report-id-label { font-size: 9px; color: #94a3b8; margin-top: 2px; }
  .title-section { text-align: center; margin: 12px 0 14px 0; }
  .title-section h1 { font-size: 22px; font-weight: 900; color: #0f172a; margin: 0; letter-spacing: 0.5px; }
  .title-section .divider { height: 3px; width: 80px; background: #d7b56d; margin: 6px auto 0; border-radius: 2px; }
  .info-bar { display: flex; justify-content: space-between; margin-bottom: 12px; padding: 8px 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
  .info-bar .item { font-size: 11px; color: #475569; }
  .info-bar .item strong { color: #0f172a; }
  .booking-id-box { text-align: center; margin-bottom: 14px; padding: 8px; background: #f1f5f9; border-radius: 8px; border: 1px solid #e2e8f0; }
  .booking-id-box label { font-size: 11px; color: #64748b; }
  .booking-id-box .id { font-size: 13px; font-weight: 800; color: #1e3a5f; letter-spacing: 0.5px; font-family: 'Courier New', monospace; }
  .section { border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 12px; overflow: hidden; }
  .section-title { background: #f8fafc; padding: 10px 14px; font-size: 14px; font-weight: 800; color: #0f172a; border-bottom: 1px solid #e2e8f0; margin: 0; }
  .section-body { padding: 10px 14px; }
  .info-grid { display: flex; flex-wrap: wrap; gap: 0; }
  .info-grid .row { width: 100%; display: flex; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
  .info-grid .row:last-child { border-bottom: none; }
  .info-grid .label { width: 38%; font-size: 12px; color: #64748b; }
  .info-grid .value { width: 62%; font-size: 12px; color: #1e293b; font-weight: 600; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .status-paid { background: #dcfce7; color: #166534; }
  .status-cancelled { background: #fee2e2; color: #991b1b; }
  .status-completed { background: #dbeafe; color: #1e40af; }
  .status-assigned { background: #e0e7ff; color: #3730a3; }
  .status-confirmed { background: #d1fae5; color: #065f46; }
  .footer { text-align: center; margin-top: 16px; font-size: 10px; color: #94a3b8; }
  .footer .line { margin: 2px 0; }
`;

  const bodyHtml = `
  <div class="header">
    <div class="header-left">
      ${logo ? `<img src="${logo}" alt=""/>` : ''}
      <div class="company-details">
        <p class="company-name">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-address">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-contact">${escapeHtml(COMPANY_CONTACT)}</p>
      </div>
    </div>
    <div class="qr-section">
      ${qrUrl ? `<img src="${qrUrl}" alt="QR"/>` : ''}
      <div class="report-id-label">Report ID: ${escapeHtml(reportId)}</div>
    </div>
  </div>

  <div class="title-section">
    <h1>Home Service Report</h1>
    <div class="divider"></div>
  </div>

  <div class="info-bar">
    <div class="item"><strong>Service:</strong> ${escapeHtml(serviceLabel)}</div>
    <div class="item"><strong>Report Generated:</strong> ${escapeHtml(fmtDate(now.toISOString()))} ${escapeHtml(fmtTime(now.toISOString()))}</div>
  </div>

  <div class="booking-id-box">
    <label>Home Service Request ID</label>
    <div class="id">${escapeHtml(bookingLabel)}</div>
  </div>

  <div class="section">
    <p class="section-title">Service Status</p>
    <div class="section-body">
      <div class="info-grid">
        <div class="row">
          <span class="label">Status</span>
          <span class="value"><span class="status-badge status-${escapeHtml(String(data.status ?? 'pending'))}">${escapeHtml(String(data.status ?? 'pending').replace('_', ' '))}</span></span>
        </div>
        ${paymentDone ? `<div class="row">
          <span class="label">Payment Status</span>
          <span class="value"><span class="status-badge status-paid">${escapeHtml(paymentLabel())}</span></span>
        </div>` : ''}
      </div>
    </div>
  </div>

  <div class="section">
    <p class="section-title">Contact &amp; Address</p>
    <div class="section-body">
      <div class="info-grid">
        <div class="row">
          <span class="label">Customer Name</span>
          <span class="value">${escapeHtml(data.customer_name ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">Phone Number</span>
          <span class="value">${escapeHtml(data.customer_phone ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">Address Line 1</span>
          <span class="value">${escapeHtml(data.address_line1 ?? '—')}</span>
        </div>
        ${data.address_line2 ? `<div class="row">
          <span class="label">Address Line 2</span>
          <span class="value">${escapeHtml(data.address_line2)}</span>
        </div>` : ''}
        <div class="row">
          <span class="label">Locality</span>
          <span class="value">${escapeHtml(data.locality ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">City</span>
          <span class="value">${escapeHtml(data.city ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">State</span>
          <span class="value">${escapeHtml(data.state ?? '—')}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <p class="section-title">Schedule &amp; Service Details</p>
    <div class="section-body">
      <div class="info-grid">
        <div class="row">
          <span class="label">Service Type</span>
          <span class="value">${escapeHtml(serviceLabel)}</span>
        </div>
        <div class="row">
          <span class="label">Preferred Date</span>
          <span class="value">${escapeHtml(data.preferred_date ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">Preferred Time</span>
          <span class="value">${escapeHtml(data.preferred_time ?? '—')}</span>
        </div>
        ${data.provider_name ? `<div class="row">
          <span class="label">Service Provider</span>
          <span class="value">${escapeHtml(data.provider_name)}</span>
        </div>` : ''}
      </div>
    </div>
  </div>

  ${data.notes ? `<div class="section">
    <p class="section-title">Notes</p>
    <div class="section-body">
      <p style="margin:0;font-size:12px;color:#1e293b;">${escapeHtml(data.notes)}</p>
    </div>
  </div>` : ''}

  <div class="section">
    <p class="section-title">Payment Summary</p>
    <div class="section-body">
      <div class="info-grid">
        ${data.advance_payment && data.advance_payment > 0 ? `<div class="row">
          <span class="label">Booking Total</span>
          <span class="value">${escapeHtml(fmtCurrency(HOME_SERVICE_PAYMENT.bookingTotal))}</span>
        </div>
        <div class="row">
          <span class="label">Convenience Fee</span>
          <span class="value">${escapeHtml(fmtCurrency(HOME_SERVICE_PAYMENT.convenienceFee))}</span>
        </div>
        <div class="row">
          <span class="label">Final Payable</span>
          <span class="value">${escapeHtml(fmtCurrency(HOME_SERVICE_PAYMENT.finalPayable))}</span>
        </div>` : ''}
        ${data.advance_payment && data.advance_payment > 0 ? `<div class="row">
          <span class="label">Advance Payment</span>
          <span class="value">${escapeHtml(fmtCurrency(data.advance_payment))}</span>
        </div>` : ''}
        <div class="row">
          <span class="label">Payment Option</span>
          <span class="value">${escapeHtml(data.payment_option === 'after_service' ? 'Pay After Service' : data.payment_option ?? '—')}</span>
        </div>
        ${data.after_service_payment_method ? `<div class="row">
          <span class="label">Payment Method</span>
          <span class="value">${escapeHtml(data.after_service_payment_method === 'cash' ? 'Cash' : data.after_service_payment_method === 'online' ? 'Online' : data.after_service_payment_method)}</span>
        </div>` : ''}
        ${data.cash_paid_at ? `<div class="row">
          <span class="label">Paid At</span>
          <span class="value">${escapeHtml(fmtDate(data.cash_paid_at))} ${escapeHtml(fmtTime(data.cash_paid_at))}</span>
        </div>` : ''}
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="line">${escapeHtml(COMPANY_NAME)}</div>
    <div class="line">${escapeHtml(COMPANY_ADDRESS)}</div>
    <div class="line">${escapeHtml(COMPANY_CONTACT)}</div>
  </div>
`;

  const html = wrapAsPdf(bodyHtml.trim(), extraCss);
  console.log('[generateHomeServicePdf] HTML built, generating PDF...');

  if (Platform.OS === 'web') {
    const webUri = await createWebPdfUri(html, 'Home Service Report');
    console.log('[generateHomeServicePdf] Web PDF URI:', webUri?.slice(0, 80));
    return webUri;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  console.log('[generateHomeServicePdf] PDF generated at:', uri);
  if (!uri) throw new Error('Print.printToFileAsync returned empty URI');
  return uri;
}

export async function shareHomeServicePdf(data: HomeServicePdfData): Promise<boolean> {
  try {
    console.log('[shareHomeServicePdf] Generating PDF...');
    const uri = await generateHomeServicePdf(data);
    if (!uri) {
      console.error('[shareHomeServicePdf] generateHomeServicePdf returned empty URI');
      return false;
    }
    console.log('[shareHomeServicePdf] PDF URI:', uri?.slice(0, 80));

    const label = data.booking_number ? `GRH${data.booking_number}` : `RPT-HS-${String(data.id).slice(0, 8).toUpperCase()}`;
    const fileName = `Home_Service_Report_${label}.pdf`;

    console.log('[shareHomeServicePdf] Sharing as:', fileName);
    return sharePdf(uri, fileName, `Home Service Report - ${label}`);
  } catch (e) {
    console.error('[shareHomeServicePdf] Failed:', e);
    return false;
  }
}

export async function downloadHomeServicePdf(data: HomeServicePdfData): Promise<boolean> {
  try {
    console.log('[downloadHomeServicePdf] Generating PDF...');
    const uri = await generateHomeServicePdf(data);
    if (!uri) {
      console.error('[downloadHomeServicePdf] generateHomeServicePdf returned empty URI');
      return false;
    }
    console.log('[downloadHomeServicePdf] PDF URI:', uri?.slice(0, 80));

    const label = data.booking_number ? `GRH${data.booking_number}` : `RPT-HS-${String(data.id).slice(0, 8).toUpperCase()}`;
    const fileName = `Home_Service_Report_${label}.pdf`;

    console.log('[downloadHomeServicePdf] Downloading as:', fileName);
    return downloadPdf(uri, fileName);
  } catch (e) {
    console.error('[downloadHomeServicePdf] Failed:', e);
    return false;
  }
}
