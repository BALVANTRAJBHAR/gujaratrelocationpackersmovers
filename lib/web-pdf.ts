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

  let y = margin;
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
