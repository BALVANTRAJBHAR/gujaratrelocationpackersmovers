import { getLogoBase64 } from '@/lib/get-logo-base64';

export async function getPrivacyPolicyHtml(): Promise<string> {
  const logo = await getLogoBase64();
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
  .footer { text-align: center; margin-top: 20px; padding-top: 10px; border-top: 2px solid #d7b56d; font-size: 11px; color: #94a3b8; }
  .footer .line { margin: 2px 0; }
  .page-number { text-align: center; font-size: 10px; color: #cbd5e1; margin-top: 16px; }
  strong { color: #0f172a; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <img src="${logo}" alt="Logo"/>
      <div class="company-details">
        <p class="company-name">Gujarat Relocation Packers</p>
        <p class="company-address">Sethia Aashray, Mumbai 400101</p>
        <p class="company-contact">Phone: +91 9987963470 | Email: Gujaratrelocation.owner@gmail.com</p>
      </div>
    </div>
  </div>

  <div class="title-section">
    <h1>Privacy Policy</h1>
    <div class="divider"></div>
  </div>

  <div class="section">
    <p class="section-title">1. Information We Collect</p>
    <div class="section-body">
      <p>We collect information you provide directly when using our services, including:</p>
      <ul>
        <li><strong>Personal Information:</strong> Name, phone number, email address, and billing details.</li>
        <li><strong>Service Information:</strong> Pickup and drop locations, shifting inventory details, property addresses, and service preferences.</li>
        <li><strong>Media:</strong> Photos and videos of items being shifted, properties, or premises.</li>
        <li><strong>Device Information:</strong> Device type, operating system, and app version for analytics and troubleshooting.</li>
      </ul>
    </div>
  </div>

  <div class="section">
    <p class="section-title">2. How We Use Your Information</p>
    <div class="section-body">
      <p>We use the collected information for:</p>
      <ul>
        <li>Providing and managing shifting, home services, and property management services.</li>
        <li>Processing payments and generating invoices/receipts.</li>
        <li>Communicating booking status, updates, and support requests.</li>
        <li>Improving our services, app performance, and user experience.</li>
        <li>Sending service-related notifications (SMS, email, or in-app).</li>
        <li>Complying with legal obligations and resolving disputes.</li>
      </ul>
    </div>
  </div>

  <div class="section">
    <p class="section-title">3. Information Sharing</p>
    <div class="section-body">
      <p>We do <strong>not</strong> sell your personal information to third parties.</p>
      <p>We may share information with:</p>
      <ul>
        <li><strong>Service Partners:</strong> Drivers, labourers, and moving staff to fulfil your booking.</li>
        <li><strong>Payment Processors:</strong> Razorpay for secure payment processing.</li>
        <li><strong>Legal Authorities:</strong> If required by law or to protect our rights.</li>
      </ul>
    </div>
  </div>

  <div class="section">
    <p class="section-title">4. Data Security</p>
    <div class="section-body">
      <p>We implement industry-standard security measures to protect your data:</p>
      <ul>
        <li>SSL/TLS encryption for all data transmission.</li>
        <li>Secure storage using Supabase with row-level security.</li>
        <li>Access controls to limit data access to authorized personnel only.</li>
      </ul>
      <p>However, no method of electronic storage or transmission is 100% secure. We recommend using strong passwords and keeping your login credentials confidential.</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">5. Data Retention</p>
    <div class="section-body">
      <p>We retain your personal information for as long as your account is active or as needed to provide services. We may retain certain data for legal or legitimate business purposes (e.g., tax records, dispute resolution).</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">6. Your Rights</p>
    <div class="section-body">
      <p>You have the right to:</p>
      <ul>
        <li><strong>Access</strong> your personal data held by us.</li>
        <li><strong>Correct</strong> inaccurate or incomplete data.</li>
        <li><strong>Delete</strong> your account and associated data (subject to legal obligations).</li>
        <li><strong>Withdraw consent</strong> for marketing communications at any time.</li>
      </ul>
      <p>To exercise these rights, contact us at Gujaratrelocation.owner@gmail.com.</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">7. Third-Party Services</p>
    <div class="section-body">
      <p>Our app integrates with third-party services:</p>
      <ul>
        <li><strong>Supabase</strong> — Database and authentication.</li>
        <li><strong>Razorpay</strong> — Payment processing.</li>
        <li><strong>Mapbox</strong> — Location and mapping services.</li>
        <li><strong>Expo</strong> — App development and distribution.</li>
      </ul>
      <p>These services have their own privacy policies governing data handling.</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">8. Children's Privacy</p>
    <div class="section-body">
      <p>Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal information from minors.</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">9. Changes to This Policy</p>
    <div class="section-body">
      <p>We may update this Privacy Policy from time to time. Changes will be notified via the app or email. Continued use of our services after changes constitutes acceptance of the updated policy.</p>
    </div>
  </div>

  <div class="section">
    <p class="section-title">10. Contact Us</p>
    <div class="section-body">
      <p>For questions or concerns regarding this Privacy Policy, please contact:</p>
      <p><strong>Email:</strong> Gujaratrelocation.owner@gmail.com</p>
      <p><strong>Phone:</strong> +91 9987963470</p>
      <p><strong>Address:</strong> Sethia Aashray, Mumbai 400101</p>
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
