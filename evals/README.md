# Evals

- `pairs.jsonl` — 5 synthetic resume–JD pairs (no real PII) for `resume.rewrite`. Each line holds
  pre-selected vault items (selection is deterministic and arrives in Phase 2) plus the extracted JD.
- `runs/` — generated output (gitignored). Each run writes `results.jsonl`, `summary.json`,
  `report.html` (blind side-by-side grading) and `key.json` (label → model; open only after grading).
- `private/` — gitignored; put any real-resume datasets here, never in `pairs.jsonl`.

```
pnpm eval --task resume.rewrite --models nvidia/nemotron-3-super-120b-a12b,nvidia/nemotron-3-ultra-550b-a55b --dataset evals/pairs.jsonl
```

The TRD target is 50 pairs before choosing production models (PRD §9).
