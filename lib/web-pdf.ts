import { A4_W, A4_H, PDF_MARGINS } from '@/lib/pdf-layout';

export type WebPdfResult = {
  blob: Blob;
  uri: string;
};

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

function parsePdfDocument(html: string): { body: HTMLElement; margins: ReturnType<typeof parsePageMargin> } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  if (!body?.children.length) throw new Error('Missing PDF body content');
  return { body, margins: parsePageMargin(html) };
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

/** Browser-only PDF generation that renders actual HTML+CSS layout using html2canvas + jsPDF. */
export async function createWebPdf(html: string, _title: string): Promise<WebPdfResult> {
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');
  const html2canvas = (await import('html2canvas')).default;

  const { body: sourceBody, margins } = parsePdfDocument(html);
  const contentHeightMm = A4_H - margins.top - margins.bottom;

  // Measure block heights in an A4-width container (DOMParser nodes must be adopted into the live document)
  const measureHost = document.createElement('div');
  measureHost.style.cssText = `position:absolute;left:-9999px;top:0;width:${A4_W}mm;background:#fff;visibility:hidden;`;
  document.body.appendChild(measureHost);

  const measureBody = document.createElement('div');
  measureBody.style.cssText = `width:100%;padding:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;box-sizing:border-box;`;
  for (const child of Array.from(sourceBody.children)) {
    measureBody.appendChild(child.cloneNode(true));
  }
  measureHost.appendChild(measureBody);

  const pxPerMm = measureHost.offsetWidth / A4_W;
  const contentHeightPx = contentHeightMm * pxPerMm;
  const blocks = Array.from(measureBody.children) as HTMLElement[];
  const pages = groupBlocksIntoPages(blocks, contentHeightPx);
  document.body.removeChild(measureHost);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    const pageDiv = document.createElement('div');
    pageDiv.style.cssText = `width:${A4_W}mm;height:${A4_H}mm;overflow:hidden;background:#fff;box-sizing:border-box;`;

    const inner = document.createElement('div');
    inner.style.cssText = `width:100%;height:100%;padding:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;box-sizing:border-box;background:#fff;`;

    for (const block of pages[i]) {
      inner.appendChild(block.cloneNode(true));
    }
    pageDiv.appendChild(inner);
    document.body.appendChild(pageDiv);

    // Wait for images (logo, QR) to decode before capture
    await Promise.all(
      Array.from(pageDiv.querySelectorAll('img')).map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              }),
      ),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await html2canvas(pageDiv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
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

  const blob = pdf.output('blob') as Blob;
  const uri = URL.createObjectURL(blob);
  return { blob, uri };
}

/** @deprecated Prefer createWebPdf — kept for callers that only need a blob URL. */
export async function createWebPdfUri(html: string, title: string): Promise<string> {
  const { uri } = await createWebPdf(html, title);
  return uri;
}
