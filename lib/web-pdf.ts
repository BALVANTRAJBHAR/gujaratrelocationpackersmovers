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

async function waitForImages(root: HTMLElement): Promise<void> {
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map(
      (img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
    ),
  );
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/**
 * Web PDF renderer — mirrors mobile expo-print layout by rendering the same HTML
 * as one continuous A4-width document (with @page margins as body padding),
 * then slicing the canvas at A4 page heights.
 */
export async function createWebPdfUri(html: string, _title: string): Promise<string> {
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');
  const html2canvas = (await import('html2canvas')).default;

  const margins = parsePageMargin(html);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    `width:${A4_W}mm`,
    `padding:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
    'box-sizing:border-box',
    'background:#fff',
    "font-family:'Times New Roman',Times,serif",
    'color:#1e293b',
  ].join(';');

  for (const styleNode of Array.from(doc.head.querySelectorAll('style'))) {
    const styleCopy = document.createElement('style');
    styleCopy.textContent = styleNode.textContent;
    wrapper.appendChild(styleCopy);
  }

  for (const child of Array.from(doc.body.childNodes)) {
    wrapper.appendChild(child.cloneNode(true));
  }

  host.appendChild(wrapper);
  document.body.appendChild(host);

  await waitForImages(wrapper);

  const canvas = await html2canvas(host, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    width: host.offsetWidth,
    height: host.scrollHeight,
    logging: false,
  });

  document.body.removeChild(host);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const pageHeightPx = (pdfH * canvas.width) / pdfW;

  let srcY = 0;
  let pageIndex = 0;

  while (srcY < canvas.height) {
    const sliceHeight = Math.min(Math.ceil(pageHeightPx), canvas.height - srcY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const ctx = pageCanvas.getContext('2d');
    ctx?.drawImage(canvas, 0, srcY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const pageData = pageCanvas.toDataURL('image/png');
    if (pageIndex > 0) pdf.addPage();
    const sliceHeightMm = (sliceHeight * pdfW) / canvas.width;
    pdf.addImage(pageData, 'PNG', 0, 0, pdfW, sliceHeightMm);

    srcY += sliceHeight;
    pageIndex += 1;
  }

  return URL.createObjectURL(pdf.output('blob') as Blob);
}
