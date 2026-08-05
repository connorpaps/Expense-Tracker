/**
 * Deterministic generator for a minimal single-page text PDF statement
 * (US Bank-style columns: Date Description Amount). Real bank PDFs cannot be
 * committed to the repository; this generator produces byte-identical output
 * for web and iOS parser parity tests.
 */

export interface PdfTextRow {
  date: string;
  description: string;
  amount: string;
}

export interface PdfTableRow {
  date: string;
  description: string;
  withdrawal?: string;
  deposit?: string;
  balance: string;
}

export function buildPdfStatementText(rows: PdfTextRow[]): string {
  return [
    'Expense Tracker Bank - Monthly Statement',
    'Account ending in 2410',
    'Statement period: 07/01/2026 - 07/31/2026',
    'Date    Description              Amount',
    ...rows.map((row) => `${row.date}    ${row.description.padEnd(22)}    ${row.amount}`),
    '',
  ].join('\n');
}

function escapePdfString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Builds a valid PDF 1.4 byte array with correct xref offsets. */
export function generatePdfStatement(rows: PdfTextRow[]): Uint8Array {
  const text = buildPdfStatementText(rows);
  const content = `BT /F1 10 Tf 72 740 Td 16 TL\n${text
    .split('\n')
    .map((line) => `(${escapePdfString(line)}) Tj T*`)
    .join('\n')}\nET`;
  return buildPdf(content);
}

/** Deterministic positioned table PDF used to exercise coordinate reconstruction. */
export function generatePdfTableStatement(rows: PdfTableRow[] = [
  { date: '07/01', description: 'Beginning Balance', balance: '2,845.50' },
  { date: '07/02', description: 'UBER *TRIP HELP.UBER.COM CA', withdrawal: '18.45', balance: '2,827.05' },
  { date: '07/03', description: 'DIRECT DEP - PAYROLL GUSTO', deposit: '2,050.00', balance: '4,877.05' },
  { date: '07/04', description: 'SQ *LOCAL COFFEE SHOP SAN FRAN', withdrawal: '6.50', balance: '4,870.55' },
]) : Uint8Array {
  const items = [
    [60, 700, 'Expense Tracker Bank - Daily Account Activity'],
    [60, 682, 'Statement period: 07/01/2026 - 07/31/2026'],
    ...rows.flatMap((row, index) => {
      const y = 640 - index * 18;
      return [
        [60, y, row.date],
        [117.6, y, row.description],
        ...(row.withdrawal ? [[388, y, row.withdrawal]] : []),
        ...(row.deposit ? [[449, y, row.deposit]] : []),
        [520.86, y, row.balance],
      ];
    }),
  ];
  const content = items
    .map(([x, y, text]) => `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfString(String(text))}) Tj ET`)
    .join('\n');
  return buildPdf(content);
}

function buildPdf(content: string): Uint8Array {
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  objects[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${offsets[i]!.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/** The standard generated bank statement used by golden tests. */
export function standardPdfStatement(): Uint8Array {
  return generatePdfStatement([
    { date: '07/01/2026', description: 'STARBUCKS', amount: '-6.50' },
    { date: '07/02/2026', description: 'GAS STATION #2211', amount: '-38.00' },
    { date: '07/03/2026', description: 'NETFLIX.COM', amount: '-15.99' },
    { date: '07/04/2026', description: 'DIRECT DEPOSIT PAYROLL', amount: '2400.00' },
  ]);
}

/** A valid PDF with no extractable text at all (image-only simulation). */
export function generateNoTextPdf(): Uint8Array {
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>';
  objects[4] = '<< /Length 0 >>\nstream\nendstream';
  objects[5] = '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${offsets[i]!.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
