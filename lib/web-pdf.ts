import { A4_W, A4_H, PDF_MARGINS } from '@/lib/pdf-layout';

function parsePageMargin(html: string): { top: number; bottom: number; left: number; right: number } {
  const m = PDF_MARGINS;
  const match = html.match(/@page\s*\{\s*margin:\s*([^;}]+)\s*\}/i);
  if (!match?.[1]?.trim()) return m;
  const parts = match[1].trim().split(/\s+/).map((s) => parseFloat(s));
  if (parts.length === 1) return { top: parts[0], bottom: parts[0], left: parts[0], right: parts[0] };
  if (parts.length === 2) return { top: parts[0], bottom: parts[0], left: parts[1], right: parts[1] };
  if (parts.length === 4) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  return m;
}

/** Groups consecutive body children into A4 pages based on their natural heights. */
function groupBlocksIntoPages(
  children: HTMLElement[],
  contentHeightPx: number,
): HTMLElement[][] {
  const pages: HTMLElement[][] = [];
  let page: HTMLElement[] = [];
  let pageY = 0;

  for (const el of children) {
    const h = el.offsetHeight || 1;
    if (pageY + h > contentHeightPx && page.length > 0) {
      pages.push(page);
      page = [];
      pageY = 0;
    }
    page.push(el);
    pageY += h;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

/** Browser-only PDF generation that renders actual HTML+CSS layout using html2canvas + jsPDF.
 *  Each A4 page is captured independently so content never gets sliced mid-element. */
export async function createWebPdfUri(html: string, _title: string): Promise<string> {
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');
  const html2canvas = (await import('html2canvas')).default;

  const margins = parsePageMargin(html);
  const contentHeightMm = A4_H - margins.top - margins.bottom;

  // 1. Render full HTML in a hidden A4-width container to measure block heights
  const measureBox = document.createElement('div');
  measureBox.innerHTML = html;
  measureBox.style.cssText = `position:absolute;left:-9999px;top:0;width:${A4_W}mm;background:#fff;`;
  document.body.appendChild(measureBox);

  const pxPerMm = measureBox.offsetWidth / A4_W;
  const contentHeightPx = contentHeightMm * pxPerMm;

  const bodyEl = measureBox.querySelector('body');
  if (!bodyEl) throw new Error('Missing <body> in PDF HTML');
  const blocks = Array.from(bodyEl.children) as HTMLElement[];

  // 2. Group blocks into pages
  const pages = groupBlocksIntoPages(blocks, contentHeightPx);

  // 3. Remove measurement container
  document.body.removeChild(measureBox);

  // 4. Create the PDF — render each page independently
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    const pageDiv = document.createElement('div');
    pageDiv.style.cssText = `width:${A4_W}mm;height:${A4_H}mm;overflow:hidden;background:#fff;`;

    const inner = document.createElement('div');
    inner.style.padding = `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`;

    // Clone blocks for this page into the inner wrapper
    for (const block of pages[i]) {
      inner.appendChild(block.cloneNode(true));
    }
    pageDiv.appendChild(inner);
    document.body.appendChild(pageDiv);

    // Let the browser lay out the page before capturing
    await new Promise((r) => setTimeout(r, 20));

    const canvas = await html2canvas(pageDiv, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      width: pageDiv.offsetWidth,
      height: pageDiv.offsetHeight,
      logging: false,
    });

    document.body.removeChild(pageDiv);

    const imgData = canvas.toDataURL('image/png');
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
  }

  return pdf.output('bloburl') as string;
}
