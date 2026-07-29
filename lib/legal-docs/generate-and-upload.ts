import { downloadPdf, openPdf } from '@/lib/pdf-actions';
import { printHtmlToPdfUri } from '@/lib/print-pdf';
import { getPrivacyPolicyHtml } from './privacy-html';
import { getTermsConditionsHtml } from './terms-html';

async function generatePdf(html: string, title: string): Promise<string> {
  return printHtmlToPdfUri(html, title);
}

export async function getOrCreateTermsPdfUri(): Promise<string> {
  return generatePdf(await getTermsConditionsHtml(), 'Terms and Conditions');
}

export async function getOrCreatePrivacyPdfUri(): Promise<string> {
  return generatePdf(await getPrivacyPolicyHtml(), 'Privacy Policy');
}

/** Opens the viewer only—sharing is intentionally handled by the report share action. */
export async function openLegalPdf(uri: string): Promise<void> {
  await openPdf(uri);
}

export async function downloadLegalPdf(uri: string, fileName: string): Promise<boolean> {
  return downloadPdf(uri, fileName);
}
