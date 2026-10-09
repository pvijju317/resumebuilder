import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERSONAS, range } from '../../../evals/resumes/personas.js';
import { extractResumeText, orderPageText, sniffKind } from '../src/services/extract.js';

const FILES = resolve(import.meta.dirname, '../../../evals/resumes/files');
const ext = (layout: string) =>
  layout.startsWith('pdf') ? 'pdf' : layout.startsWith('docx') ? 'docx' : 'txt';

describe('extractResumeText on the 10 synthetic resumes', () => {
  for (const p of PERSONAS) {
    it(`${p.id} (${p.layout})`, async () => {
      const buf = readFileSync(resolve(FILES, `${p.id}.${ext(p.layout)}`));
      const { kind, text } = await extractResumeText(buf);
      expect(kind).toBe(ext(p.layout));
      expect(text.toLowerCase()).toContain(p.name.toLowerCase());
      for (const r of p.roles) {
        expect(text).toContain(r.company);
        expect(text).toContain(r.title);
        expect(text.replace(/\s+/g, ' ')).toContain(range(r, p.dateStyle));
        // Reading order: the role's title, company and dates sit directly above its first bullet,
        // with no sidebar text interleaved.
        const bulletAt = text.indexOf(r.bullets[0]!.slice(0, 30));
        expect(bulletAt).toBeGreaterThan(0);
        const before = text.slice(Math.max(0, bulletAt - 140), bulletAt).replace(/\s+/g, ' ');
        expect(before).toContain(r.title);
        expect(before).toContain(r.company);
        expect(before).toContain(range(r, p.dateStyle));
      }
    });
  }
});

describe('sniffKind and failure modes', () => {
  it('trusts bytes, not names', () => {
    expect(sniffKind(Buffer.from('%PDF-1.7 ...'))).toBe('pdf');
    expect(sniffKind(Buffer.from('PK\x03\x04rest', 'latin1'))).toBe('docx');
    expect(sniffKind(Buffer.from('Plain résumé text'))).toBe('txt');
    expect(sniffKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))).toBeNull();
    expect(sniffKind(Buffer.from([0xff, 0xfe, 0xc3, 0x28]))).toBeNull();
  });

  it('rejects unknown types, corrupt files and near-empty text (scans)', async () => {
    await expect(
      extractResumeText(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(extractResumeText(Buffer.from('%PDF-1.7 garbage'))).rejects.toMatchObject({
      message: /could not read/,
    });
    await expect(
      extractResumeText(Buffer.from('PK\x03\x04garbage', 'latin1')),
    ).rejects.toMatchObject({ message: /could not read/ });
    await expect(extractResumeText(Buffer.from('too short'))).rejects.toMatchObject({
      message: /scanned image/,
    });
  });
});

describe('orderPageText', () => {
  const it_ = (str: string, x: number, y: number, w = 40) => ({ str, x, y, w, h: 10 });

  it('groups items into lines by baseline and orders left to right', () => {
    expect(
      orderPageText([it_('World', 60, 700), it_('Hello', 10, 701), it_('Next', 10, 680)], 600),
    ).toBe('Hello World\nNext');
  });

  it('emits the left column before the right when a gutter exists', () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => it_(`side${i}`, 20, 700 - i * 20, 120)),
      ...Array.from({ length: 5 }, (_, i) => it_(`main${i}`, 240, 700 - i * 20, 300)),
    ];
    expect(orderPageText(items, 600)).toBe(
      'side0\nside1\nside2\nside3\nside4\n\nmain0\nmain1\nmain2\nmain3\nmain4',
    );
  });

  it('does not split a single-column page with right-aligned dates', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      it_(`line${i} long text`, 40, 700 - i * 20, 300),
    );
    items.push(it_('2021', 520, 700, 30));
    expect(orderPageText(items, 600).split('\n')[0]).toBe('line0 long text 2021');
    expect(orderPageText([], 600)).toBe('');
  });
});
