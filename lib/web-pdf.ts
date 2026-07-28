/** Browser-only PDF generation used because expo-print opens the print dialog on web. */
export async function createWebPdfUri(html: string, title: string): Promise<string> {
  // Use the browser bundle explicitly. Metro otherwise resolves jsPDF's Node entry
  // while statically rendering Expo Router routes.
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const margin = 42;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = pdf.internal.pageSize.getHeight() - margin;
  const documentText = new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
  const paragraphs = documentText
    .replace(/\r/g, '')
    .split(/\n\s*\n|\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // jsPDF does not render the supplied HTML; it receives extracted text below.
  // Embed the bundled asset explicitly so every web report contains the logo.
  const logoMatch = html.match(/<img\s+src="(data:image\/png;base64,[^"]+)"[^>]*>/i);
  if (logoMatch?.[1]) {
    try {
      pdf.addImage(logoMatch[1], 'PNG', margin, margin, 48, 48);
    } catch (error) {
      console.warn('[web-pdf] Unable to embed logo:', error);
    }
  }

  const qrMatch = html.match(/<img\s+src="(https:\/\/api\.qrserver\.com\/[^\"]+)"[^>]*>/i);
  if (qrMatch?.[1]) {
    try {
      const response = await fetch(qrMatch[1]);
      const blob = await response.blob();
      const qrData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      pdf.addImage(qrData, 'PNG', pdf.internal.pageSize.getWidth() - margin - 52, margin, 52, 52);
    } catch (error) {
      console.warn('[web-pdf] Unable to embed QR code:', error);
    }
  }

  let y = margin + (logoMatch?.[1] ? 64 : 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(title, margin, y);
  y += 28;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);

  for (const paragraph of paragraphs) {
    const lines = pdf.splitTextToSize(paragraph, width) as string[];
    const requiredHeight = lines.length * 14 + 8;
    if (y + requiredHeight > pageHeight) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(lines, margin, y);
    y += requiredHeight;
  }

  return pdf.output('bloburl') as string;
}
