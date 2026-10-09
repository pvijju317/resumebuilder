import { AppError, type RESUME_MIME, type ResumeMime } from '@tailor/shared';
import mammoth from 'mammoth';

/** Limits for resume text extraction. */
export const EXTRACT_LIMITS = { maxPages: 10, maxChars: 60_000, minChars: 200 } as const;

export type FileKind = (typeof RESUME_MIME)[ResumeMime];

/** Identify the real file type from its bytes; the declared MIME type is not trusted. */
export function sniffKind(buf: Uint8Array): FileKind | null {
  const head = Buffer.from(buf.subarray(0, 8)).toString('latin1');
  if (head.startsWith('%PDF-')) return 'pdf';
  if (head.startsWith('PK\x03\x04')) return 'docx';
  // Plain text: valid UTF-8, no NUL bytes in the first 8 KB.
  const sample = buf.subarray(0, 8192);
  if (sample.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return 'txt';
  } catch {
    return null;
  }
}

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Order positioned PDF text into reading order. Lines are grouped by baseline; if the page has a
 * clear vertical gutter (two-column resume), the left column is emitted before the right.
 */
export function orderPageText(items: Item[], pageWidth: number): string {
  return orderPage(items, pageWidth).text;
}

function orderPage(items: Item[], pageWidth: number): { text: string; twoColumn: boolean } {
  const text = items.filter((i) => i.str.trim().length > 0);
  if (text.length === 0) return { text: '', twoColumn: false };

  const gutter = findGutter(text, pageWidth);
  const columns =
    gutter === null
      ? [text]
      : [text.filter((i) => i.x < gutter), text.filter((i) => i.x >= gutter)];
  return {
    text: columns
      .map((col) => toLines(col))
      .filter(Boolean)
      .join('\n\n'),
    twoColumn: gutter !== null,
  };
}

function toLines(items: Item[]): string {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const line = lines.at(-1);
    const tol = Math.max(2, (it.h || 10) * 0.45);
    if (line && Math.abs(line[0]!.y - it.y) <= tol) line.push(it);
    else lines.push([it]);
  }
  return lines
    .map((line) => {
      line.sort((a, b) => a.x - b.x);
      let out = '';
      let prevEnd: number | null = null;
      for (const it of line) {
        const gap = prevEnd === null ? 0 : it.x - prevEnd;
        if (
          prevEnd !== null &&
          gap > (it.h || 10) * 0.2 &&
          !out.endsWith(' ') &&
          !it.str.startsWith(' ')
        )
          out += ' ';
        out += it.str;
        prevEnd = it.x + it.w;
      }
      return out.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean)
    .join('\n');
}

/** An x position between 25% and 75% of the page that no text item crosses, with text on both sides. */
function findGutter(items: Item[], pageWidth: number): number | null {
  const lo = pageWidth * 0.25;
  const hi = pageWidth * 0.75;
  const step = pageWidth / 200;
  let best: { x: number; width: number } | null = null;
  let runStart: number | null = null;
  for (let x = lo; x <= hi; x += step) {
    const crossed = items.some((i) => i.x < x && i.x + i.w > x);
    if (!crossed && runStart === null) runStart = x;
    if ((crossed || x + step > hi) && runStart !== null) {
      const width = x - runStart;
      if (!best || width > best.width) best = { x: runStart + width / 2, width };
      runStart = null;
    }
  }
  if (!best || best.width < pageWidth * 0.015) return null;
  const left = items.filter((i) => i.x + i.w <= best!.x).length;
  const right = items.filter((i) => i.x >= best!.x).length;
  // Both sides must carry real content (not just a few dates in a right margin).
  return left >= items.length * 0.15 && right >= items.length * 0.15 ? best.x : null;
}

async function extractPdf(buf: Uint8Array): Promise<{ text: string; twoColumn: boolean }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    if (doc.numPages > EXTRACT_LIMITS.maxPages) {
      throw new AppError(
        'VALIDATION',
        `Resumes over ${EXTRACT_LIMITS.maxPages} pages are not supported.`,
        400,
      );
    }
    const pages: string[] = [];
    let twoColumn = false;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: Item[] = content.items.flatMap((i) =>
        'str' in i
          ? [
              {
                str: i.str,
                x: i.transform[4] as number,
                y: i.transform[5] as number,
                w: i.width,
                h: i.height,
              },
            ]
          : [],
      );
      const ordered = orderPage(items, viewport.width);
      pages.push(ordered.text);
      twoColumn ||= ordered.twoColumn;
      page.cleanup();
    }
    return { text: pages.join('\n\n'), twoColumn };
  } finally {
    await task.destroy();
  }
}

async function extractDocx(buf: Uint8Array): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  return value;
}

/** Extract plain text from a resume file. Throws friendly AppErrors for unusable files. */
export async function extractResumeText(
  buf: Uint8Array,
): Promise<{ kind: FileKind; text: string; twoColumn: boolean }> {
  const kind = sniffKind(buf);
  if (!kind) throw new AppError('VALIDATION', 'That file is not a readable PDF, DOCX or TXT.', 400);
  let raw: string;
  let twoColumn = false;
  try {
    if (kind === 'pdf') ({ text: raw, twoColumn } = await extractPdf(buf));
    else raw = kind === 'docx' ? await extractDocx(buf) : new TextDecoder().decode(buf);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      'VALIDATION',
      'We could not read that file. Try saving it again as PDF or DOCX.',
      400,
      { cause: e },
    );
  }
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length < EXTRACT_LIMITS.minChars) {
    throw new AppError(
      'VALIDATION',
      'We found almost no text in that file. If it is a scanned image, paste your resume text instead.',
      400,
    );
  }
  return { kind, text: text.slice(0, EXTRACT_LIMITS.maxChars), twoColumn };
}
