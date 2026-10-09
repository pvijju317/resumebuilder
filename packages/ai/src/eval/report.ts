import type { RewriteOutput } from '@tailor/shared';
import type { RewritePair } from './dataset.js';
import type { RewriteMetrics } from './metrics.js';

export interface BlindOutput {
  label: string; // A, B, …
  output: RewriteOutput | null;
  error: string | null;
  metrics: RewriteMetrics | null;
}

export interface BlindPair {
  pair: RewritePair;
  outputs: BlindOutput[];
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const withAsks = (s: string) =>
  esc(s).replace(/\[\[ASK:([^\]]*)\]\]/g, '<mark class="ask">ASK:$1</mark>');

const CRITERIA = [
  ['naturalness', 'Naturalness'],
  ['accuracy', 'Accuracy to source'],
  ['seniority', 'Seniority fit'],
  ['format', 'Format & length'],
] as const;

function outputCard(pairId: string, o: BlindOutput): string {
  const body = o.output
    ? `<p class="summary">${withAsks(o.output.summary)}</p>
       <ul class="bullets">${o.output.bullets.map((b) => `<li>${withAsks(b.text)}</li>`).join('')}</ul>
       <p class="skills"><span class="label">Skills order</span> ${esc(o.output.skillsOrder.join(' · '))}</p>`
    : `<p class="error">No valid output: ${esc(o.error ?? 'unknown error')}</p>`;
  const m = o.metrics;
  const checks = m
    ? `<details class="checks"><summary>Automated checks</summary><dl>
        <dt>Must-have coverage</dt><dd>${m.mustHaveAfter}/${m.mustHaveSupported} supported</dd>
        <dt>Fact Guard violations</dt><dd>${m.factGuardViolations}${m.violationSamples.length ? ` <span class="muted">(${esc(m.violationSamples.join('; '))})</span>` : ''}</dd>
        <dt>ASK placeholders</dt><dd>${m.asks}</dd>
        <dt>Bullets over length</dt><dd>${m.bulletsOverLength}/${m.bulletCount}</dd>
        <dt>Bullet count</dt><dd>${m.bulletCount} (expected ${m.expectedBullets})</dd>
      </dl></details>`
    : '';
  const grades = CRITERIA.map(
    ([key, label]) => `<label class="grade">${label}
      <select data-pair="${esc(pairId)}" data-label="${o.label}" data-key="${key}">
        <option value="">–</option>${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join('')}
      </select></label>`,
  ).join('');
  return `<article class="card output">
    <header><h3>Output ${o.label}</h3></header>
    ${body}${checks}
    <div class="grades">${grades}
      <label class="grade wide">Notes<textarea rows="2" data-pair="${esc(pairId)}" data-label="${o.label}" data-key="notes"></textarea></label>
    </div>
  </article>`;
}

export function renderBlindReport(opts: {
  task: string;
  createdAt: string;
  pairs: BlindPair[];
}): string {
  const sections = opts.pairs
    .map(({ pair, outputs }, i) => {
      const chips = (ks: { name: string }[], cls: string) =>
        ks.map((k) => `<span class="chip ${cls}">${esc(k.name)}</span>`).join('');
      return `<section class="pair" id="${esc(pair.id)}">
        <header class="pair-head">
          <p class="eyebrow">Pair ${i + 1} of ${opts.pairs.length} · ${esc(pair.region)} · ${esc(pair.tone)}</p>
          <h2>${esc(pair.jd.title)}${pair.jd.company ? ` <span class="muted">at ${esc(pair.jd.company)}</span>` : ''}</h2>
          <p class="muted">${esc(pair.persona)}</p>
        </header>
        <div class="card jd">
          <p class="label">Must-have</p><div class="chips">${chips(pair.jd.mustHave, 'must')}</div>
          ${pair.jd.niceToHave.length ? `<p class="label">Nice-to-have</p><div class="chips">${chips(pair.jd.niceToHave, '')}</div>` : ''}
          <details><summary>Source vault items (${pair.items.length})</summary>
            <ol class="sources">${pair.items.map((it) => `<li><span class="muted">${esc([it.context.title, it.context.company, it.context.name].filter(Boolean).join(' · '))}</span><br>${esc(it.text)}${it.metrics.length ? ` <span class="muted">[${esc(it.metrics.map((mt) => `${mt.value} ${mt.unit} ${mt.context}`).join('; '))}]</span>` : ''}</li>`).join('')}</ol>
          </details>
        </div>
        <div class="outputs">${outputs.map((o) => outputCard(pair.id, o)).join('')}</div>
      </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blind eval · ${esc(opts.task)}</title>
<style>
:root{--bg:#fafafa;--surface:#fff;--text:#18181b;--muted:#71717a;--border:#e4e4e7;--accent:#4338ca;--accent-soft:#eef2ff;--warn:#b45309;--warn-soft:#fef3c7;--danger:#b91c1c;--radius:12px;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.5;color:var(--text);background:var(--bg)}
@media (prefers-color-scheme:dark){:root{--bg:#09090b;--surface:#18181b;--text:#fafafa;--muted:#a1a1aa;--border:#27272a;--accent:#a5b4fc;--accent-soft:#1e1b4b;--warn:#fbbf24;--warn-soft:#422006;--danger:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg)}
main{max-width:1200px;margin:0 auto;padding:32px 16px 96px}
h1{font-size:24px;font-weight:600;letter-spacing:-.01em;margin:0 0 4px}h2{font-size:20px;font-weight:600;letter-spacing:-.01em;margin:0}h3{font-size:14px;font-weight:600;margin:0}
.muted{color:var(--muted);font-weight:400}.eyebrow,.label{font-size:12px;color:var(--muted);margin:0 0 4px;text-transform:uppercase;letter-spacing:.04em}
.top{display:flex;flex-wrap:wrap;gap:16px;align-items:end;justify-content:space-between;margin-bottom:32px}
button{font:inherit;font-weight:500;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer}
@media (prefers-color-scheme:dark){button{color:#09090b}}
button:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pair{margin-bottom:48px}.pair-head{margin-bottom:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.jd{margin-bottom:16px}.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.chip{border:1px solid var(--border);border-radius:999px;padding:2px 10px;font-size:12px}.chip.must{background:var(--accent-soft);border-color:transparent}
.sources li{margin-bottom:8px}details summary{cursor:pointer;color:var(--muted);font-size:13px;margin-top:8px}
.outputs{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.summary{margin:8px 0 12px}.bullets{padding-left:18px;margin:0 0 12px}.bullets li{margin-bottom:6px}
.skills{font-size:13px}mark.ask{background:var(--warn-soft);color:var(--warn);border-radius:4px;padding:0 4px}
.error{color:var(--danger)}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px;margin:8px 0 0}dt{color:var(--muted)}dd{margin:0;font-variant-numeric:tabular-nums}
.grades{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:16px;border-top:1px solid var(--border);padding-top:12px}
.grade{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}.grade.wide{grid-column:1/-1}
select,textarea{font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 8px}
</style></head><body><main>
<div class="top"><div><p class="eyebrow">Blind evaluation · ${esc(opts.task)}</p><h1>Grade each output 1–5</h1>
<p class="muted">Model names are hidden; the key is in key.json next to this file. Grades save in this browser as you go.</p></div>
<button type="button" id="download">Download grades</button></div>
${sections}
</main>
<script>
const STORE='tailor-eval-${esc(opts.createdAt)}';
const fields=[...document.querySelectorAll('[data-pair]')];
let saved={};try{saved=JSON.parse(localStorage.getItem(STORE)||'{}')}catch{}
const id=(el)=>el.dataset.pair+'|'+el.dataset.label+'|'+el.dataset.key;
fields.forEach((el)=>{if(saved[id(el)]!==undefined)el.value=saved[id(el)];el.addEventListener('change',()=>{saved[id(el)]=el.value;try{localStorage.setItem(STORE,JSON.stringify(saved))}catch{}})});
document.getElementById('download').addEventListener('click',()=>{
  const out={};fields.forEach((el)=>{const p=el.dataset.pair,l=el.dataset.label,k=el.dataset.key;out[p]??={};out[p][l]??={};out[p][l][k]=k==='notes'?el.value:(el.value?Number(el.value):null)});
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));a.download='grades.json';a.click();
});
</script></body></html>`;
}
