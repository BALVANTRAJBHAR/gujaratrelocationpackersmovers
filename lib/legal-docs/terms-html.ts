import { getLogoBase64 } from '@/lib/get-logo-base64';

export async function getTermsConditionsHtml(): Promise<string> {
  const logo = await getLogoBase64();
  const websiteQrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=https%3A%2F%2Fgujaratrelocationpackers.com';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  @page { margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; color: #1e293b; margin: 0; padding: 0; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 3px solid #d7b56d; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .header-left img { width: 56px; height: 56px; object-fit: contain; }
  .qr-section { text-align: right; }
  .qr-section img { width: 64px; height: 64px; }
  .qr-label { font-size: 9px; color: #64748b; margin-top: 2px; }
  .company-details { flex: 1; }
  .company-name { font-size: 28px; font-weight: 800; color: #0f172a; margin: 0 0 2px 0; }
  .company-address { font-size: 11px; color: #64748b; margin: 0 0 1px 0; }
  .company-contact { font-size: 11px; color: #64748b; margin: 0; }
  .title-section { text-align: center; margin: 14px 0 16px 0; }
  .title-section h1 { font-size: 24px; font-weight: 900; color: #0f172a; margin: 0; letter-spacing: 0.5px; }
  .title-section .divider { height: 3px; width: 100px; background: #d7b56d; margin: 8px auto 0; border-radius: 2px; }
  .section { margin-bottom: 14px; }
  .section-title { font-size: 16px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; }
  .section-body { font-size: 13px; color: #334155; margin: 0; line-height: 1.6; }
  .section-body p { margin: 6px 0; }
  .section-body ul { margin: 4px 0 8px 16px; padding: 0; }
  .section-body li { margin: 2px 0; }
  .highlight-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin: 8px 0; }
  .highlight-box p { margin: 2px 0; }
  .footer { text-align: center; margin-top: 20px; padding-top: 10px; border-top: 2px solid #d7b56d; font-size: 11px; color: #94a3b8; }
  .footer .line { margin: 2px 0; }
  .page-number { text-align: center; font-size: 10px; color: #cbd5e1; margin-top: 16px; }
  strong { color: #0f172a; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <img src="${logo}" alt=""/>
      <div class="company-details">
        <p class="company-name">Gujarat Relocation Packers</p>
        <p class="company-address">Sethia Aashray, Mumbai 400101</p>
        <p class="company-contact">Phone: +91 9987963470 | Email: Gujaratrelocation.owner@gmail.com</p>
      </div>
    </div>
    <div class="qr-section">
      <img src="${websiteQrUrl}" alt=""/>
      <div class="qr-label">Scan to visit our website</div>
    </div>
  </div>

  <div class="title-section">
    <h1>Terms &amp; Conditions</h1>
    <div class="divider"></div>
  </div>

  <div class="section">
    <p class="section-title">1. Transfer of Valuables &amp; Important Documents</p>
    <div class="section-body">
      <p>Customers must retain personal valuables such as cash, jewellery, educational certificates, property papers, vehicle documents, medical records, share certificates, and similar important documents. <strong>Gujarat Relocation Packers shall not be liable for any loss, theft, or damage to such items if transported through our service.</strong></p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">2. Travel Advisory</p>
    <div class="section-body">
      <p>Customers are advised <strong>not to schedule any air, rail, or road travel on the moving day</strong>. House shifting is time-consuming, and the company shall not be responsible for missed travel plans or delays.</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">3. Packaging Materials &amp; Labour Charges</p>
    <div class="section-body">
      <p>Packaging materials remain the property of Gujarat Relocation Packers and must be returned after delivery.</p>
      <p><strong>Retention Charges:</strong></p>
      <ul>
        <li>Corrugated Box: ₹60 per box</li>
        <li>GR Branded Red Box: ₹500 per box</li>
      </ul>
      <p>Rope lifting/lowering is performed only at the customer's request and risk.</p>
      <p>Mathadi/Union labour charges (where applicable, e.g. Mumbai, Pune, Kerala) are <strong>not included</strong> in the quotation and must be paid by the customer.</p>
      <p>Unpacking and rearranging services are not available in Kerala.</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">4. Long Carry Charges</p>
    <div class="section-body">
      <div class="highlight-box">
        <p><strong>✓ Carry distance up to 30 meters</strong> at Pickup and Drop is included in the service.</p>
        <p><strong>✗ If the carrying distance exceeds 30 meters</strong>, additional Long Carry charges will apply.</p>
        <p>Extra charges will be calculated based on the configured per-meter rate.</p>
        <p>The extra charge will be shown separately in the payment summary before payment.</p>
      </div>
    </div>
  </div>

  <div class="section">
    <p class="section-title">5. Damage Claims</p>
    <div class="section-body">
      <p><strong>Damage Classification:</strong></p>
      <ul>
        <li><strong>Minor Damage:</strong> Cosmetic damage only.</li>
        <li><strong>Major Damage:</strong> Functional/structural damage but repairable.</li>
        <li><strong>Total Loss:</strong> Item cannot be repaired.</li>
      </ul>
      <p><strong>Claim Rules:</strong></p>
      <ul>
        <li>Purchase proof is <strong>mandatory</strong>.</li>
        <li>Without proof, compensation is limited to <strong>₹5,000 per item</strong>.</li>
        <li>Claims are <strong>not accepted</strong> for:
          <ul>
            <li>Self-packed goods</li>
            <li>Internal electronic damage</li>
            <li>Items missing from the packing list</li>
            <li>Incorrectly declared item values</li>
          </ul>
        </li>
        <li>Damage must be reported within <strong>48 hours</strong> of delivery.</li>
        <li>Supporting documents must be submitted within <strong>72 hours</strong>.</li>
        <li>TV claims require <strong>before and after photographs</strong>.</li>
        <li>Vehicle transport does not cover accessories left inside vehicles.</li>
      </ul>
    </div>
  </div>

  <div class="section">
    <p class="section-title">6. Documentation</p>
    <div class="section-body">
      <p>Only communication through the <strong>Gujarat Relocation Packers App</strong>, Email, or Official Support is considered valid.</p>
      <p>Customers <strong>must verify all items</strong> before signing POD (Proof of Delivery).</p>
      <p><strong>Claims after POD signature without remarks will not be accepted.</strong></p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">7. Vehicle Access &amp; Delivery</p>
    <div class="section-body">
      <p>Vehicle type depends on <strong>availability and location</strong>.</p>
      <p>Customers must inform society restrictions or vehicle entry rules <strong>in advance</strong>.</p>
      <p>Delivery timelines depend on traffic, route conditions, commercial vehicle restrictions, weather, and force majeure events.</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">8. Service Inclusions &amp; Exclusions</p>
    <div class="section-body">
      <p>Quotation may change if booking date, inventory, or distance changes.</p>
      <p><strong>Charges do NOT include:</strong></p>
      <ul>
        <li>Carpentry work</li>
        <li>Electrical work</li>
        <li>AC gas refilling</li>
        <li>Extra AC pipes or wiring</li>
        <li>Long Carry beyond 30 meters</li>
        <li>Any additional services not included in the quotation</li>
      </ul>
    </div>
  </div>

  <div class="section">
    <p class="section-title">9. Liability</p>
    <div class="section-body">
      <p>Customers must ensure vehicle access at pickup and drop locations.</p>
      <p>Transportation is at <strong>customer's risk</strong> unless protection/insurance is selected.</p>
      <p>Payment terms are decided by Gujarat Relocation Packers.</p>
      <p>If the company cancels the booking due to unavoidable circumstances, only the booking/token amount will be refunded.</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">10. Cancellation &amp; Refund</p>
    <div class="section-body">
      <p>Cancellation charges apply according to the cancellation policy.</p>
      <p>Rescheduling is allowed <strong>up to 48 hours</strong> before shifting.</p>
      <p>Surge pricing may apply on high-demand dates.</p>
      <p>Refunds are processed within <strong>5–6 working days</strong>.</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">11. Weekend &amp; Month-End Advisory</p>
    <div class="section-body">
      <div class="highlight-box">
        <p>During weekends and month-end, bookings are higher than usual. Customers are requested to cooperate with the team, as timelines may be affected <strong>due to traffic, vehicle availability, and society regulations</strong>.</p>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="line">&copy; Gujarat Relocation Packers. All Rights Reserved.</div>
    <div class="line">Sethia Aashray, Mumbai 400101 | +91 9987963470 | Gujaratrelocation.owner@gmail.com</div>
    <div class="line">www.gujaratrelocationpackers.com</div>
  </div>

  <div class="page-number">Page 1 of 1</div>
</body>
</html>`;
}
