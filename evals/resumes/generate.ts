/**
 * Generates the synthetic resume fixtures: `pnpm fixtures:resumes`.
 * Output (committed): evals/resumes/files/<id>.<pdf|docx|txt> and evals/resumes/truth.json.
 */
import { chromium } from '@playwright/test';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERSONAS, range, truth, type Persona } from './personas.js';

const OUT = resolve(import.meta.dirname, 'files');
mkdirSync(OUT, { recursive: true });

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.4; }
  h1 { font-size: 20pt; } h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .06em; margin: 14px 0 6px; border-bottom: 1px solid #999; }
  h3 { font-size: 10.5pt; } ul { margin: 4px 0 8px 16px; } .muted { color: #444; } .row { display: flex; justify-content: space-between; gap: 12px; }
`;

function experience(p: Persona) {
  return p.roles
    .map(
      (
        r,
      ) => `<div><div class="row"><h3>${esc(r.title)}, ${esc(r.company)}</h3><span class="muted">${esc(range(r, p.dateStyle))}</span></div>
      <div class="muted">${esc(r.location)}</div><ul>${r.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>`,
    )
    .join('');
}
function education(p: Persona) {
  return p.education
    .map(
      (e) =>
        `<div class="row"><span><b>${esc(e.degree)}</b>, ${esc(e.institution)}</span><span class="muted">${esc(e.years)}</span></div>`,
    )
    .join('');
}
function projects(p: Persona) {
  return p.projects
    ? `<h2>Projects</h2>${p.projects.map((pr) => `<h3>${esc(pr.name)}</h3><ul>${pr.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`).join('')}`
    : '';
}

function htmlSingle(p: Persona) {
  return `<style>${BASE_CSS} body{padding:40px 48px}</style>
  <h1>${esc(p.name)}</h1><div class="muted">${esc(p.headline)}</div>
  <div class="muted">${esc(p.email)} | ${esc(p.phone)} | ${esc(p.city)} | ${esc(p.link)}</div>
  <h2>Summary</h2><p>${esc(p.summary)}</p>
  <h2>Experience</h2>${experience(p)}${projects(p)}
  <h2>Education</h2>${education(p)}
  <h2>Skills</h2><p>${p.skills.map(esc).join(', ')}</p>${(p.extras ?? []).map((x) => `<p>${esc(x)}</p>`).join('')}`;
}

function htmlSidebar(p: Persona) {
  return `<style>${BASE_CSS}
    .wrap{display:grid;grid-template-columns:200px 1fr;min-height:100vh}
    .side{background:#eef0f4;padding:36px 20px;font-size:9.5pt}
    .main{padding:36px 36px}
  </style>
  <div class="wrap"><aside class="side">
    <h1 style="font-size:16pt">${esc(p.name)}</h1><p class="muted">${esc(p.headline)}</p>
    <h2>Contact</h2><p>${esc(p.email)}</p><p>${esc(p.phone)}</p><p>${esc(p.city)}</p><p>${esc(p.link)}</p>
    <h2>Skills</h2>${p.skills.map((s) => `<p>${esc(s)}</p>`).join('')}
    ${(p.extras ?? []).map((x) => `<h2>Other</h2><p>${esc(x)}</p>`).join('')}
    <h2>Education</h2>${p.education.map((e) => `<p><b>${esc(e.degree)}</b></p><p>${esc(e.institution)}</p><p class="muted">${esc(e.years)}</p>`).join('')}
  </aside><main class="main">
    <h2>Profile</h2><p>${esc(p.summary)}</p><h2>Experience</h2>${experience(p)}${projects(p)}
  </main></div>`;
}

function htmlEuropass(p: Persona) {
  return `<style>${BASE_CSS} body{padding:40px 48px} .grid{display:grid;grid-template-columns:140px 1fr;gap:6px 16px;margin-bottom:10px} .lbl{color:#2a4b8d;font-size:9pt;text-align:right}</style>
  <h1>${esc(p.name)}</h1>
  <div class="grid"><span class="lbl">Email</span><span>${esc(p.email)}</span><span class="lbl">Phone</span><span>${esc(p.phone)}</span>
  <span class="lbl">Address</span><span>${esc(p.city)}</span><span class="lbl">LinkedIn</span><span>${esc(p.link)}</span></div>
  <h2>Work experience</h2>
  ${p.roles
    .map(
      (
        r,
      ) => `<div class="grid"><span class="lbl">${esc(range(r, p.dateStyle))}</span><div><h3>${esc(r.title)}</h3><div>${esc(r.company)}, ${esc(r.location)}</div>
      <ul>${r.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div></div>`,
    )
    .join('')}
  <h2>Education and training</h2>${p.education.map((e) => `<div class="grid"><span class="lbl">${esc(e.years)}</span><span>${esc(e.degree)}, ${esc(e.institution)}</span></div>`).join('')}
  <h2>Skills</h2><p>${p.skills.map(esc).join(' · ')}</p>${(p.extras ?? []).map((x) => `<p>${esc(x)}</p>`).join('')}`;
}

function docx(p: Persona, table: boolean): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(p.name)] }),
    new Paragraph(p.headline),
    new Paragraph(`${p.email} | ${p.phone} | ${p.city} | ${p.link}`),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Summary')] }),
    new Paragraph(p.summary),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Experience')] }),
  ];
  for (const r of p.roles) {
    if (table) {
      const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: none,
            bottom: none,
            left: none,
            right: none,
            insideHorizontal: none,
            insideVertical: none,
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: `${r.title} | ${r.company}`, bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: [new TextRun(range(r, p.dateStyle))],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      );
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${r.title} - ${r.company}`, bold: true })],
        }),
      );
      children.push(new Paragraph(`${range(r, p.dateStyle)} | ${r.location}`));
    }
    for (const b of r.bullets) children.push(new Paragraph({ text: b, bullet: { level: 0 } }));
  }
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Education')] }),
  );
  for (const e of p.education)
    children.push(new Paragraph(`${e.degree}, ${e.institution} (${e.years})`));
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Skills')] }),
  );
  children.push(new Paragraph(p.skills.join(', ')));
  return new Document({ sections: [{ children }] });
}

function txt(p: Persona) {
  return [
    p.name.toUpperCase(),
    p.headline,
    `${p.email} | ${p.phone} | ${p.city}`,
    p.link,
    '',
    'SUMMARY',
    p.summary,
    '',
    'EXPERIENCE',
    ...p.roles.flatMap((r) => [
      `${r.company} -- ${r.title} (${range(r, p.dateStyle)})`,
      ...r.bullets.map((b) => `* ${b}`),
      '',
    ]),
    'EDUCATION',
    ...p.education.map((e) => `${e.degree}, ${e.institution}, ${e.years}`),
    '',
    'SKILLS',
    p.skills.join(', '),
    '',
  ].join('\n');
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const p of PERSONAS) {
    if (p.layout.startsWith('pdf')) {
      const html =
        p.layout === 'pdf-sidebar'
          ? htmlSidebar(p)
          : p.layout === 'pdf-europass'
            ? htmlEuropass(p)
            : htmlSingle(p);
      await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
      await page.pdf({ path: resolve(OUT, `${p.id}.pdf`), format: 'A4', printBackground: true });
    } else if (p.layout.startsWith('docx')) {
      writeFileSync(
        resolve(OUT, `${p.id}.docx`),
        await Packer.toBuffer(docx(p, p.layout === 'docx-table')),
      );
    } else {
      writeFileSync(resolve(OUT, `${p.id}.txt`), txt(p));
    }
  }
  await browser.close();
  writeFileSync(
    resolve(import.meta.dirname, 'truth.json'),
    JSON.stringify(PERSONAS.map(truth), null, 2) + '\n',
  );
  console.log(`generated ${PERSONAS.length} resumes in ${OUT}`);
}

void main();
