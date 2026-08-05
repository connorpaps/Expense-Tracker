/**
 * Text-PDF statement parser (T029). Extracts text with pdfjs-dist, enforces
 * page/text limits, detects encrypted and image-only PDFs explicitly, and
 * supports cancellation. OCR is deferred; image-only PDFs are surfaced as an
 * explicit unsupported state, never silently producing incomplete data.
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { RowDiagnostic } from '@expense-tracker/domain';
import { DIAGNOSTIC_CODES } from '@expense-tracker/contracts';
import type { ParsedRow, ParsedStatement, ParseOptions } from '../types';
import { ParseError, mergedLimits, throwIfCancelled } from '../types';
import { parseStatementDate } from '../normalization/dates';
import { parseAmountMinor } from '../normalization/amounts';
import { displayMerchant } from '../normalization/merchant';

export const PDF_PARSER_VERSION = 'pdf-0.1.0';

interface PdfTextItem {
  text: string;
  x: number;
  y: number;
}

interface PdfPageText {
  lines: string[];
  items: PdfTextItem[];
}

/** Configure the PDF.js worker when the host bundler provides its URL. */
export function configurePdfWorker(workerSrc: string): void {
  GlobalWorkerOptions.workerSrc = workerSrc;
}

export async function parsePdf(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions,
): Promise<ParsedStatement> {
  const limits = mergedLimits(options.limits);
  const currency = options.currency ?? 'USD';

  if (data.byteLength > limits.maxFileSizeBytes) {
    throw new ParseError(
      'IMPORT_TOO_LARGE',
      `This file is larger than the ${Math.round(limits.maxFileSizeBytes / 1024 / 1024)} MB import limit.`,
    );
  }

  // Node's fs.readFile returns a Buffer subclass, which PDF.js's loopback
  // worker cannot structured-clone. Normalize all typed-array input to a plain
  // Uint8Array while leaving browser ArrayBuffer input intact.
  const pdfData = data instanceof Uint8Array ? new Uint8Array(data) : data;

  let document;
  try {
    document = await getDocument({
      data: pdfData,
      // The host configures GlobalWorkerOptions.workerSrc when running in a
      // browser. Node keeps PDF.js's built-in fake-worker behavior.
      disableFontFace: true,
      useSystemFonts: true,
      verbosity: 0,
    } as Parameters<typeof getDocument>[0]).promise;
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new ParseError(
        'IMPORT_PDF_ENCRYPTED',
        'This PDF is password-protected. Export it without a password and try again.',
      );
    }
    throw new ParseError('IMPORT_PARSE_FAILED', 'This PDF could not be read as a text statement.', false);
  }

  if (document.numPages === 0) {
    void document.destroy();
    throw new ParseError('IMPORT_EMPTY', 'This PDF has no pages to import.');
  }
  const pagesToRead = Math.min(document.numPages, limits.maxPdfPages);
  const statementWarnings: string[] = [];
  if (document.numPages > limits.maxPdfPages) {
    statementWarnings.push(
      `This PDF has ${document.numPages} pages; only the first ${limits.maxPdfPages} were read.`,
    );
  }

  const lines: string[] = [];
  const pages: PdfPageText[] = [];
  let extractedBytes = 0;
  try {
    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      throwIfCancelled(options.token);
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageLines: string[] = [];
      const pageItems: PdfTextItem[] = [];
      // Reconstruct lines from text items using the hasEOL marker (items are
      // NOT newline-delimited), while preserving coordinates for table PDFs.
      let line = '';
      for (const item of textContent.items) {
        if ('str' in item) {
          const itemText = item.str;
          if (itemText.trim().length > 0) {
            pageItems.push({
              text: itemText.trim(),
              x: item.transform[4] ?? 0,
              y: item.transform[5] ?? 0,
            });
          }
          line += itemText;
          if (item.hasEOL) {
            pageLines.push(line);
            line = '';
          } else {
            line += ' ';
          }
        }
      }
      if (line.trim().length > 0) {
        pageLines.push(line);
      }
      pages.push({ lines: pageLines, items: pageItems });
      lines.push(...pageLines);
      extractedBytes += pageLines.join('\n').length;
      if (extractedBytes > limits.maxExtractedTextBytes) {
        statementWarnings.push('The extracted text exceeds the import limit and was truncated.');
        break;
      }
      options.onProgress?.({ phase: 'parsing', current: pageNumber, total: pagesToRead });
      page.cleanup();
    }
  } finally {
    void document.destroy();
  }

  const joined = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  const text = joined.join('\n');
  if (text.length === 0) {
    throw new ParseError(
      'IMPORT_PDF_IMAGE_ONLY',
      'This PDF has no readable text. Import it as a CSV, or type the transactions manually.',
    );
  }

  const rows: ParsedRow[] = [];
  let errorCount = 0;
  let recognizedRows = 0;
  let rowIndex = 0;
  let usedCoordinateLayout = false;

  for (const line of joined) {
    throwIfCancelled(options.token);
    const match = /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{1,2}-\d{1,2})\s+(.+?)\s+([-+]?\$?[\d,]+(?:\.\d{2})?)$/.exec(
      line,
    );
    if (!match) continue;

    rowIndex += 1;
    const diagnostics: RowDiagnostic[] = [];
    const parsedDate = parseStatementDate(match[1]!);
    const merchantDisplay = displayMerchant(match[2]!);
    const parsedAmount = parseAmountMinor(match[3]!, currency);

    if (parsedDate === null) {
      diagnostics.push({ code: DIAGNOSTIC_CODES.ROW_INVALID_DATE, message: `Date "${match[1]}" could not be read.`, severity: 'error' });
    }
    if (!merchantDisplay) {
      diagnostics.push({ code: DIAGNOSTIC_CODES.ROW_MISSING_MERCHANT, message: 'This row has no merchant description.', severity: 'error' });
    }
    if (parsedAmount === null) {
      diagnostics.push({ code: DIAGNOSTIC_CODES.ROW_INVALID_AMOUNT, message: `Amount "${match[3]}" could not be read.`, severity: 'error' });
    }

    const hasErrors = diagnostics.some((d) => d.severity === 'error');
    const row: ParsedRow = {
      sourceRowNumber: rowIndex,
      parsedDate,
      parsedMerchant: merchantDisplay,
      merchantOriginal: match[2]!.trim(),
      parsedAmountMinor: parsedAmount,
      currency,
      diagnostics,
      rowStatus: hasErrors ? 'error' : 'valid',
    };
    if (hasErrors) errorCount += 1;
    if (parsedDate !== null && merchantDisplay !== null && parsedAmount !== null) {
      recognizedRows += 1;
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    const coordinateRows = reconstructCoordinateRows(pages, inferStatementYear(joined), currency);
    rows.push(...coordinateRows);
    recognizedRows = coordinateRows.filter((row) => row.rowStatus === 'valid').length;
    rowIndex = rows.length;
    usedCoordinateLayout = coordinateRows.length > 0;
  }

  if (rows.length === 0) {
    throw new ParseError(
      'IMPORT_PDF_UNSUPPORTED_LAYOUT',
      'This PDF contains readable text, but no supported transaction rows were found.',
    );
  }

  return {
    profile: usedCoordinateLayout ? 'pdf_text_table' : 'pdf_text',
    fileType: 'pdf',
    totalRows: rows.length,
    recognizedRows,
    rows,
    warningCount: statementWarnings.length,
    errorCount,
    cancelled: false,
    statementWarnings,
    parserVersion: PDF_PARSER_VERSION,
  };
}

function inferStatementYear(lines: string[]): number | null {
  for (const line of lines) {
    const match = /(?:statement\s+period|period)[:\s].*?(\d{4})/i.exec(line);
    if (match) return Number(match[1]);
  }
  return null;
}

function reconstructCoordinateRows(
  pages: PdfPageText[],
  statementYear: number | null,
  currency: string,
): ParsedRow[] {
  if (statementYear === null) return [];

  const rows: ParsedRow[] = [];
  let dateRowCount = 0;
  let balanceEvidenceCount = 0;
  for (const page of pages) {
    const groups: PdfTextItem[][] = [];
    for (const item of [...page.items].sort((left, right) => right.y - left.y || left.x - right.x)) {
      const group = groups.find((candidate) => Math.abs(candidate[0]!.y - item.y) <= 2);
      if (group) group.push(item);
      else groups.push([item]);
    }

    for (const group of groups) {
      const ordered = group.sort((left, right) => left.x - right.x);
      const dateItem = ordered.find((item) => item.x < 100 && /^(\d{1,2})\/(\d{1,2})$/.test(item.text));
      if (!dateItem) continue;
      dateRowCount += 1;

      const descriptionItems = ordered.filter((item) => item.x >= 100 && item.x < 360);
      const debitItem = ordered.find((item) => item.x >= 360 && item.x < 430 && isMoney(item.text));
      const creditItem = ordered.find((item) => item.x >= 430 && item.x < 510 && isMoney(item.text));
      const balanceItem = ordered.find((item) => item.x >= 510 && isMoney(item.text));
      if (balanceItem) balanceEvidenceCount += 1;
      const originalDescription = descriptionItems.map((item) => item.text).join(' ').trim();
      const description = displayMerchant(originalDescription);
      const dateMatch = /^(\d{1,2})\/(\d{1,2})$/.exec(dateItem.text);
      // A table row must have one and only one debit/credit amount plus a
      // running balance. Never guess when both amount columns are populated.
      if (
        !dateMatch ||
        !originalDescription ||
        !description ||
        !balanceItem ||
        (debitItem && creditItem) ||
        (!debitItem && !creditItem)
      ) continue;

      const rawAmount = creditItem?.text ?? debitItem?.text ?? '';
      const amount = parseAmountMinor(rawAmount, currency);
      const parsedDate = parseStatementDate(`${dateMatch[1]}/${dateMatch[2]}/${statementYear}`);
      if (parsedDate === null || amount === null) continue;

      rows.push({
        sourceRowNumber: rows.length + 1,
        parsedDate,
        parsedMerchant: description,
        merchantOriginal: originalDescription,
        parsedAmountMinor: creditItem ? Math.abs(amount) : -Math.abs(amount),
        currency,
        diagnostics: [],
        rowStatus: 'valid',
      });
    }
  }
  // Avoid applying the table heuristic to arbitrary positioned text. The TD
  // shape must repeat across at least two dated rows and expose balances.
  return dateRowCount >= 2 && balanceEvidenceCount >= 2 ? rows : [];
}

function isMoney(value: string): boolean {
  return /^\$?\s*[\d,]+(?:\.\d{2})?$/.test(value);
}
