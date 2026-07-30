import { BOOKING_STATUS_CONFIRMED } from '@/lib/booking-status';
import { getQrDataUri } from '@/lib/get-qr-data-uri';
import { downloadPdf, sharePdf } from '@/lib/pdf-actions';
import { COMPANY_EMAIL, COMPANY_NAME, COMPANY_PHONE } from '@/constants/company';
import { pdfImg, wrapAsPdf } from '@/lib/pdf-layout';
import { printHtmlToPdfUri } from '@/lib/print-pdf';

type BookingPdfData = {
  id: string;
  booking_number?: number | null;
  pickup_address: string | null;
  drop_address: string | null;
  distance_km: number | null;
  estimated_price: number | null;
  advance_amount: number | null;
  remaining_amount: number | null;
  status: string | null;
  payment_status: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  labor_count: number | null;
  vehicle_type_name?: string | null;
  pickup_floor: string | null;
  drop_floor: string | null;
  pickup_lift_available: boolean | null;
  drop_lift_available: boolean | null;
  items_description: string | null;
  fare_breakdown: Record<string, any> | null;
  created_at: string;
};

const COMPANY_ADDRESS = 'Sethia Aashray, Mumbai 400101';
const COMPANY_CONTACT = `Phone: ${COMPANY_PHONE} | Email: ${COMPANY_EMAIL}`;

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

function buildFareTable(breakdown: Record<string, any> | null, estimated: number | null): string {
  if (!breakdown) {
    return `<tr><td style="padding:8px 0;color:#334155;">Total Estimated</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0f172a;">${fmtCurrency(estimated)}</td></tr>`;
  }
  const rows: string[] = [];
  const labels: Record<string, string> = {
    base_fare: 'Base Fare',
    per_km: 'Per Km Charge',
    distance_km: 'Distance (km)',
    labor_fee: 'Labor Fee',
    labor_count: 'Labor Count',
    labor_unit: 'Labor Unit Rate',
    floor_fee: 'Floor Charge',
    box_charge: 'Box Charges',
    box_count: 'Boxes',
    pickup_floor_charge: 'Pickup Floor Charge',
    drop_floor_charge: 'Drop Floor Charge',
    pickup_floor_label: 'Pickup Floor',
    drop_floor_label: 'Drop Floor',
    pickup_lift_available: 'Pickup Lift',
    drop_lift_available: 'Drop Lift',
    subtotal: 'Subtotal',
    gst: 'GST (5%)',
    total: 'Booking Total',
    convenience_fee: 'Convenience Fee',
    final_payable: 'Final Payable',
    vehicle_type_id: 'Vehicle Type',
  };
  for (const [key, val] of Object.entries(breakdown)) {
    const label = labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    let display: string;
    if (typeof val === 'boolean') {
      display = val ? 'Available' : 'Not Available';
    } else if (typeof val === 'number') {
      if (key === 'gst') {
        display = `₹${val.toFixed(2)}`; continue; // Show GST as part of total
      }
      display = key === 'distance_km' || key === 'labor_count' || key === 'labor_unit' || key === 'pickup_floor_label' || key === 'drop_floor_label'
        ? String(val) : fmtCurrency(val);
    } else {
      display = String(val ?? '—');
    }
    if (key === 'total' || key === 'final_payable') {
      rows.push(`<tr style="border-top:2px solid #e2e8f0;"><td style="padding:10px 0 4px 0;font-weight:800;color:#0f172a;font-size:15px;">${label}</td><td style="padding:10px 0 4px 0;text-align:right;font-weight:800;color:#0f172a;font-size:17px;">${display}</td></tr>`);
    } else if (key === 'subtotal' || key === 'gst') {
      rows.push(`<tr><td style="padding:4px 0;color:#475569;font-size:14px;">${label}</td><td style="padding:4px 0;text-align:right;color:#475569;font-size:14px;">${display}</td></tr>`);
    } else if (key !== 'vehicle_type_id') {
      rows.push(`<tr><td style="padding:4px 0;color:#64748b;font-size:14px;">${label}</td><td style="padding:4px 0;text-align:right;color:#64748b;font-size:14px;">${display}</td></tr>`);
    }
  }
  if (!rows.length) {
    return `<tr><td style="padding:8px 0;color:#334155;">Total Estimated</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0f172a;">${fmtCurrency(estimated)}</td></tr>`;
  }
  return rows.join('\n');
}

function paymentLabel(data: BookingPdfData): string {
  if (data.payment_status === 'paid') {
    const remaining = Number(data.remaining_amount ?? 0);
    return remaining <= 0 ? 'Full Paid' : 'Advance Payment';
  }
  return String(data.payment_status ?? 'pending').replace('_', ' ');
}

export async function generateBookingPdf(data: BookingPdfData): Promise<string> {
  const bookingLabel = data.booking_number ? `GRS${data.booking_number}` : `RPT-${String(data.id).slice(0, 8).toUpperCase()}`;
  const reportId = bookingLabel;
  console.log('[generateBookingPdf] Loading assets...');
  const [logo, qrUrl] = await Promise.all([
    getLogoBase64(),
    getQrDataUri(reportId),
  ]);
  console.log('[generateBookingPdf] Assets loaded, building HTML...');
  const now = new Date();

  const extraCss = `
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .header-left img { width: 56px; height: 56px; object-fit: contain; }
  .company-details { flex: 1; }
  .company-name { font-size: 30px; font-weight: 800; color: #0f172a; margin: 0 0 2px 0; }
  .company-address { font-size: 12px; color: #64748b; margin: 0 0 1px 0; }
  .company-contact { font-size: 12px; color: #64748b; margin: 0; }
  .qr-section { text-align: right; }
  .qr-section img { width: 100px; height: 100px; }
  .report-id-label { font-size: 9px; color: #94a3b8; margin-top: 2px; }
  .title-section { text-align: center; margin: 12px 0 14px 0; }
  .title-section h1 { font-size: 22px; font-weight: 900; color: #0f172a; margin: 0; letter-spacing: 0.5px; }
  .title-section .divider { height: 3px; width: 80px; background: #d7b56d; margin: 6px auto 0; border-radius: 2px; }
  .info-bar { display: flex; justify-content: space-between; margin-bottom: 12px; padding: 8px 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
  .info-bar .item { font-size: 12px; color: #475569; }
  .info-bar .item strong { color: #0f172a; }
  .booking-id-box { text-align: center; margin-bottom: 14px; padding: 8px; background: #f1f5f9; border-radius: 8px; border: 1px solid #e2e8f0; }
  .booking-id-box label { font-size: 11px; color: #64748b; }
  .booking-id-box .id { font-size: 13px; font-weight: 800; color: #1e3a5f; letter-spacing: 0.5px; font-family: 'Courier New', monospace; }
  .section { border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 12px; overflow: hidden; }
  .section-title { background: #f8fafc; padding: 10px 14px; font-size: 15px; font-weight: 800; color: #0f172a; border-bottom: 1px solid #e2e8f0; margin: 0; }
  .section-body { padding: 10px 14px; }
  .info-grid { display: flex; flex-wrap: wrap; gap: 0; }
  .info-grid .row { width: 100%; display: flex; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
  .info-grid .row:last-child { border-bottom: none; }
  .info-grid .label { width: 38%; font-size: 13px; color: #64748b; }
  .info-grid .value { width: 62%; font-size: 13px; color: #1e293b; font-weight: 600; }
  table.fare { width: 100%; border-collapse: collapse; }
  table.fare td { font-size: 14px; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .status-paid { background: #dcfce7; color: #166534; }
  .status-cancelled { background: #fee2e2; color: #991b1b; }
  .status-completed { background: #dbeafe; color: #1e40af; }
  .status-assigned { background: #e0e7ff; color: #3730a3; }
  .status-confirmed { background: #d1fae5; color: #065f46; }
  .status-full-paid { background: #dcfce7; color: #166534; }
  .status-advance-payment { background: #fef3c7; color: #92400e; }
  .footer { text-align: center; margin-top: 16px; font-size: 11px; color: #94a3b8; }
  .footer .line { margin: 2px 0; }
`;

  const bodyHtml = `
  <div class="header">
    <div class="header-left">
      ${pdfImg(logo, 56, 56)}
      <div class="company-details">
        <p class="company-name">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-address">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-contact">${escapeHtml(COMPANY_CONTACT)}</p>
      </div>
    </div>
    <div class="qr-section">
      ${pdfImg(qrUrl, 64, 64, 'QR')}
      <div class="report-id-label">Report ID: ${escapeHtml(reportId)}</div>
    </div>
  </div>

  <div class="title-section">
    <h1>Shifting Booking Report</h1>
    <div class="divider"></div>
  </div>

  <div class="info-bar">
    <div class="item"><strong>Booking Date:</strong> ${escapeHtml(fmtDate(data.created_at))} ${escapeHtml(fmtTime(data.created_at))}</div>
    <div class="item"><strong>Report Generated:</strong> ${escapeHtml(fmtDate(now.toISOString()))} ${escapeHtml(fmtTime(now.toISOString()))}</div>
  </div>

  <div class="booking-id-box">
    <label>Shifting Booking ID</label>
    <div class="id">${escapeHtml(bookingLabel)}</div>
  </div>

  <div class="section">
    <p class="section-title">Booking Status</p>
    <div class="section-body">
      <div class="info-grid">
        <div class="row">
          <span class="label">Status</span>
          <span class="value"><span class="status-badge status-${escapeHtml(String(data.status ?? 'pending'))}">${escapeHtml(String(data.status ?? 'pending').replace('_', ' '))}</span></span>
        </div>
        <div class="row">
          <span class="label">Payment Status</span>
          <span class="value"><span class="status-badge status-${escapeHtml(String(data.payment_status ?? 'pending'))}">${escapeHtml(paymentLabel(data))}</span></span>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <p class="section-title">Location Details</p>
    <div class="section-body">
      <div class="info-grid">
        <div class="row">
          <span class="label">Pickup Address</span>
          <span class="value">${escapeHtml(data.pickup_address ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">Drop Address</span>
          <span class="value">${escapeHtml(data.drop_address ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">Distance</span>
          <span class="value">${escapeHtml(data.distance_km != null ? String(data.distance_km) + ' km' : '—')}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <p class="section-title">Schedule &amp; Resources</p>
    <div class="section-body">
      <div class="info-grid">
        <div class="row">
          <span class="label">Scheduled Date</span>
          <span class="value">${escapeHtml(data.scheduled_date ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">Scheduled Time</span>
          <span class="value">${escapeHtml(data.scheduled_time ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">Vehicle Type</span>
          <span class="value">${escapeHtml(data.vehicle_type_name ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">Labor Count</span>
          <span class="value">${escapeHtml(data.labor_count != null ? String(data.labor_count) : '—')}</span>
        </div>
        <div class="row">
          <span class="label">Pickup Floor</span>
          <span class="value">${escapeHtml(data.pickup_floor ?? '—')}</span>
        </div>
        <div class="row">
          <span class="label">Drop Floor</span>
          <span class="value">${escapeHtml(data.drop_floor ?? '—')}</span>
        </div>
      </div>
    </div>
  </div>

  ${data.items_description ? `<div class="section">
    <p class="section-title">Items Description</p>
    <div class="section-body">
      <p style="margin:0;font-size:12px;color:#1e293b;">${escapeHtml(data.items_description)}</p>
    </div>
  </div>` : ''}

  <div class="section">
    <p class="section-title">Fare Summary</p>
    <div class="section-body" style="padding:10px 14px;">
      <table class="fare">
        ${buildFareTable(data.fare_breakdown, data.estimated_price)}
        <tr style="border-top:1px solid #cbd5e1;">
          <td style="padding:10px 0 4px 0;font-weight:800;color:#0f172a;font-size:15px;">Advance Paid</td>
          <td style="padding:10px 0 4px 0;text-align:right;font-weight:700;color:#16a34a;font-size:15px;">- ${fmtCurrency(data.advance_amount)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0 10px 0;font-weight:800;color:#0f172a;font-size:16px;">Remaining to Pay</td>
          <td style="padding:4px 0 10px 0;text-align:right;font-weight:800;color:#dc2626;font-size:16px;">${fmtCurrency(data.remaining_amount)}</td>
        </tr>
      </table>
    </div>
  </div>

  <div class="footer">
    <div class="line">${escapeHtml(COMPANY_NAME)}</div>
    <div class="line">${escapeHtml(COMPANY_ADDRESS)}</div>
    <div class="line">${escapeHtml(COMPANY_CONTACT)}</div>
  </div>
`;

  const html = wrapAsPdf(bodyHtml.trim(), extraCss);
  console.log('[generateBookingPdf] HTML built, generating PDF...');
  return printHtmlToPdfUri(html, 'Shifting Booking Report');
}

async function generateFileName(data: BookingPdfData): Promise<string> {
  const label = data.booking_number ? `GRS${data.booking_number}` : `RPT-${String(data.id).slice(0, 8).toUpperCase()}`;
  return `Shifting_Booking_Report_${label}.pdf`;
}

export async function downloadBookingPdf(data: BookingPdfData): Promise<boolean> {
  try {
    console.log('[downloadBookingPdf] Generating PDF...');
    const uri = await generateBookingPdf(data);
    console.log('[downloadBookingPdf] PDF URI:', uri?.slice(0, 80));
    if (!uri) throw new Error('generateBookingPdf returned empty URI');

    const fileName = await generateFileName(data);
    console.log('[downloadBookingPdf] Downloading as:', fileName);
    return downloadPdf(uri, fileName);
  } catch (e) {
    console.error('[downloadBookingPdf] Failed:', e);
    return false;
  }
}

export async function shareBookingPdf(data: BookingPdfData): Promise<boolean> {
  try {
    console.log('[shareBookingPdf] Generating PDF...');
    const uri = await generateBookingPdf(data);
    if (!uri) {
      console.error('[shareBookingPdf] generateBookingPdf returned empty URI');
      return false;
    }
    console.log('[shareBookingPdf] PDF URI:', uri?.slice(0, 80));

    const fileName = await generateFileName(data);
    const label = data.booking_number ? `GRS${data.booking_number}` : `RPT-${String(data.id).slice(0, 8).toUpperCase()}`;

    console.log('[shareBookingPdf] Sharing as:', fileName);
    return sharePdf(uri, fileName, `Shifting Booking Report - ${label}`);
  } catch (e) {
    console.error('[shareBookingPdf] Failed:', e);
    return false;
  }
}
