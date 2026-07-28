/** Browser-only PDF generation that renders the actual HTML+CSS layout using html2canvas + jsPDF.
 *  Output matches native expo-print PDFs because the same HTML and CSS are rendered. */
export async function createWebPdfUri(html: string, _title: string): Promise<string> {
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');
  const html2canvas = (await import('html2canvas')).default;

  // Render HTML in a hidden container at A4 width so the layout matches the native PDF
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm';
  container.style.backgroundColor = '#ffffff';

  // html2canvas ignores @page CSS (print-only). Extract its margin and apply as body
  // padding so the rendered canvas matches native expo-print output.
  const pageMargin = html.match(/@page\s*\{\s*margin:\s*([^;}]+)\s*\}/i);
  if (pageMargin?.[1]?.trim()) {
    const body = container.querySelector('body');
    if (body) body.style.padding = pageMargin[1].trim();
  }

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      width: container.scrollWidth,
      height: container.scrollHeight,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const totalHeight = (canvas.height * pdfWidth) / canvas.width;

    let remaining = totalHeight;
    let srcY = 0;

    while (remaining > 0) {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.min(canvas.height, (pdfHeight * canvas.width) / pdfWidth);
      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          canvas, 0, srcY, canvas.width, pageCanvas.height,
          0, 0, pageCanvas.width, pageCanvas.height
        );
      }
      const pageData = pageCanvas.toDataURL('image/png');

      if (srcY > 0) pdf.addPage();
      pdf.addImage(pageData, 'PNG', 0, 0, pdfWidth, (pageCanvas.height * pdfWidth) / canvas.width);

      srcY += pageCanvas.height;
      remaining -= (pageCanvas.height * pdfWidth) / canvas.width;
    }

    return pdf.output('bloburl') as string;
  } finally {
    document.body.removeChild(container);
  }
}