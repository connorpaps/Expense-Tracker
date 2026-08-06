import type { ParsedStatement, ParseProgress } from '@expense-tracker/parsing';
import type { ParseError } from '@expense-tracker/parsing';
import type { WorkerMessage, ParseRequest } from '../../workers/parse-worker';

export interface ParseOutcome {
  statement: ParsedStatement;
}

export type ParseFileFn = (
  file: File,
  onProgress: (p: ParseProgress) => void,
  currency?: string,
) => Promise<ParseOutcome>;

const WORKER_FALLBACK_TIMEOUT_MS = 10_000;

/** Default parse implementation: off-main-thread via the parser worker. */
export const parseFileInWorker: ParseFileFn = (file, onProgress, currency) => {
  // PDF.js is already asynchronous, but its worker bootstrap can fail in
  // browsers that cannot resolve the PDF.js worker/module graph. Keep PDF
  // parsing in-process so parser-specific errors reach the UI reliably;
  // CSV parsing remains worker-backed below.
  if (file.name.toLowerCase().endsWith('.pdf')) {
    return parseFileInProcess(file, onProgress, currency);
  }

  return new Promise<ParseOutcome>((resolve, reject) => {
    let settled = false;
    let fallbackStarted = false;
    let worker: Worker | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      worker?.terminate();
      worker = null;
      callback();
    };

    const retryInProcess = () => {
      if (settled || fallbackStarted) return;
      fallbackStarted = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      worker?.terminate();
      worker = null;
      // A worker can fail before it posts the parser's structured error (for
      // example when a browser cannot initialize one of the PDF.js modules),
      // or it can hang while loading a module. Retry locally so the parser's
      // specific code is preserved instead of reducing the failure to a
      // generic IMPORT_PARSE_FAILED message.
      void parseFileInProcess(file, onProgress, currency)
        .then((outcome) => finish(() => resolve(outcome)))
        .catch((error) => finish(() => reject(error)));
    };

    try {
      worker = new Worker(new URL('../../workers/parse-worker.ts', import.meta.url), {
        type: 'module',
        name: 'statement-parser',
      });
    } catch {
      retryInProcess();
      return;
    }

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.kind === 'progress') {
        onProgress(message.progress);
      } else if (message.kind === 'result') {
        finish(() => resolve({ statement: message.statement }));
      } else {
        const error = new Error(message.message) as ParseError;
        error.name = 'ParseError';
        (error as { code: string }).code = message.code;
        finish(() => reject(error));
      }
    };

    worker.onerror = () => {
      retryInProcess();
    };

    fallbackTimer = setTimeout(retryInProcess, WORKER_FALLBACK_TIMEOUT_MS);

    const request: ParseRequest = {
      fileType: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'csv',
      fileName: file.name,
      currency,
    };
    const readAndPost = async () => {
      try {
        if (request.fileType === 'csv') {
          request.csvContent = await file.text();
        } else {
          request.pdfBytes = await file.arrayBuffer();
        }
        if (!settled) worker?.postMessage(request);
      } catch (error) {
        finish(() => reject(error));
      }
    };
    void readAndPost();
  });
};

export interface ReadableFile {
  name: string;
  text?(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

/** Read a file as text, falling back to FileReader (jsdom lacks Blob.text). */
export function readFileText(file: ReadableFile): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsText(file as unknown as Blob);
  });
}

/** Read a file as bytes, falling back to FileReader (jsdom lacks Blob.arrayBuffer). */
export function readFileBytes(file: ReadableFile): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsArrayBuffer(file as unknown as Blob);
  });
}

/** In-process fallback used by tests and environments without workers. */
export async function parseFileInProcess(
  file: ReadableFile,
  onProgress: (p: ParseProgress) => void,
  currency?: string,
): Promise<ParseOutcome> {
  const { parseCsv, parsePdf } = await import('@expense-tracker/parsing');
  if (file.name.toLowerCase().endsWith('.pdf')) {
    const statement = await parsePdf(await readFileBytes(file), {
      fileName: file.name,
      onProgress,
      currency,
    });
    return { statement };
  }
  const statement = parseCsv(await readFileText(file), {
    fileName: file.name,
    onProgress,
    currency,
  });
  return { statement };
}
