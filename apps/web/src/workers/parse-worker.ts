/**
 * Parser worker (T032). The main thread hands the worker a file payload; the
 * worker runs the shared parsing package (CSV via Papa Parse, text PDF via
 * pdfjs) and posts progress + results. Running parsing off the main thread
 * keeps the UI responsive and enforces the parser safety limits.
 */

import { configurePdfWorker, parseCsv, parsePdf } from '@expense-tracker/parsing';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import type { ParsedStatement, ParseProgress } from '@expense-tracker/parsing';

export interface ParseRequest {
  fileType: 'csv' | 'pdf';
  fileName: string;
  currency?: string;
  /** CSV text content. */
  csvContent?: string;
  /** PDF bytes. */
  pdfBytes?: ArrayBuffer;
}

export type WorkerMessage =
  | { kind: 'progress'; fileName: string; progress: ParseProgress }
  | { kind: 'result'; fileName: string; statement: ParsedStatement }
  | { kind: 'error'; fileName: string; code: string; message: string };

configurePdfWorker(pdfWorkerUrl);

const ctx = self as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const request = event.data;
  try {
    if (request.fileType === 'csv') {
      const statement = parseCsv(request.csvContent ?? '', {
        fileName: request.fileName,
        currency: request.currency,
        onProgress: (progress) =>
          ctx.postMessage({ kind: 'progress', fileName: request.fileName, progress }),
      });
      ctx.postMessage({ kind: 'result', fileName: request.fileName, statement });
      return;
    }

    const statement = await parsePdf(request.pdfBytes ?? new Uint8Array(0), {
      fileName: request.fileName,
      currency: request.currency,
      onProgress: (progress) =>
        ctx.postMessage({ kind: 'progress', fileName: request.fileName, progress }),
    });
    ctx.postMessage({ kind: 'result', fileName: request.fileName, statement });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parsing failed.';
    const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : 'IMPORT_PARSE_FAILED';
    ctx.postMessage({ kind: 'error', fileName: request.fileName, code, message });
  }
};

export {};
