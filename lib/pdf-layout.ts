export const A4_W = 210;
export const A4_H = 297;

export const PDF_MARGINS = {
  top: 20,
  bottom: 20,
  left: 18,
  right: 18,
};

export function pageMarginCss(): string {
  return `@page { margin: ${PDF_MARGINS.top}mm ${PDF_MARGINS.right}mm ${PDF_MARGINS.bottom}mm ${PDF_MARGINS.left}mm; }`;
}

export function baseCss(): string {
  return `
* { box-sizing: border-box; }
body {
  font-family: 'Times New Roman', Times, serif;
  color: #1e293b;
  margin: 0;
  padding: 0;
  widows: 3;
  orphans: 3;
}
.section { page-break-inside: avoid; }
h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
table { page-break-inside: avoid; }
img { page-break-inside: avoid; }`;
}

export function wrapAsPdf(bodyHtml: string, extraCss?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
${pageMarginCss()}
${baseCss()}
${extraCss ?? ''}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
