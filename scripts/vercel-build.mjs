/**
 * Vercel build (Build Output API v3). Produces .vercel/output with:
 *   static/            the web app (SPA)
 *   functions/api.func the whole Express API as one Node function
 *   config.json        /api/* -> function, other paths -> index.html, daily housekeeping cron
 *
 * Our workspace code is bundled with esbuild; third-party packages stay external and are installed
 * into the function directory with npm (flat node_modules, no workspace symlinks).
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { builtinModules } from 'node:module';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, '.vercel/output');
const FUNC = join(OUT, 'functions/api.func');
const run = (cmd, opts = {}) => {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(FUNC, { recursive: true });

// 1. Database client, migrations and idempotent seed (DATABASE_URL comes from the Neon integration).
run('pnpm db:generate');
if (process.env.DATABASE_URL && process.env.SKIP_DB_MIGRATE !== '1') {
  // Prisma Migrate needs a direct connection; Neon exposes it as DATABASE_URL_UNPOOLED.
  const direct = {
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    },
  };
  run('pnpm db:deploy', direct);
  run('pnpm db:seed', direct);
} else {
  console.warn('DATABASE_URL not set (or SKIP_DB_MIGRATE=1): skipping migrations and seed');
}

// 2. Web app.
run('pnpm --filter @tailor/web build');
cpSync(join(ROOT, 'apps/web/dist'), join(OUT, 'static'), { recursive: true });

// 3. API bundle: bundle @tailor/* (TypeScript sources), keep npm packages external.
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const external = new Set();
const result = await build({
  entryPoints: [join(ROOT, 'apps/api/src/vercel.ts')],
  outfile: join(FUNC, 'app.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'linked',
  metafile: true,
  logLevel: 'warning',
  plugins: [
    {
      name: 'externalize-npm',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('@tailor/') || builtins.has(args.path)) return null;
          const name = args.path.startsWith('@')
            ? args.path.split('/').slice(0, 2).join('/')
            : args.path.split('/')[0];
          external.add(name);
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
if (result.errors.length) process.exit(1);

// Versions of the external packages, taken from the workspace manifests that declare them.
const manifests = [
  'apps/api',
  'packages/ai',
  'packages/core',
  'packages/db',
  'packages/jobs',
  'packages/shared',
].map((d) => JSON.parse(readFileSync(join(ROOT, d, 'package.json'), 'utf8')));
const versionOf = (name) => {
  for (const m of manifests) {
    const v = m.dependencies?.[name];
    if (v && !v.startsWith('workspace:')) return v;
  }
  // Transitive-only imports (e.g. @prisma/client/runtime): use the installed version.
  for (const dir of ['packages/db', 'apps/api']) {
    const p = join(ROOT, dir, 'node_modules', name, 'package.json');
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')).version;
  }
  throw new Error(`cannot determine a version for external package ${name}`);
};
// Loaded with createRequire at runtime, so esbuild cannot see it.
for (const name of ['wink-lemmatizer']) external.add(name);
const dependencies = Object.fromEntries([...external].sort().map((n) => [n, versionOf(n)]));
writeFileSync(
  join(FUNC, 'package.json'),
  JSON.stringify(
    { name: 'tailor-api-function', private: true, type: 'module', dependencies },
    null,
    2,
  ),
);
console.log(`installing ${Object.keys(dependencies).length} runtime packages into the function`);
// --omit=optional drops pdfjs's native canvas binary (not needed for text extraction).
run(
  'npm install --omit=dev --omit=optional --no-audit --no-fund --no-package-lock --loglevel=error',
  { cwd: FUNC },
);

// Prune files the function never loads (Vercel's limit is 250 MB uncompressed).
const NM = join(FUNC, 'node_modules');
const prune = (rel) => rmSync(join(NM, rel), { recursive: true, force: true });
const prismaRuntime = join(NM, '@prisma/client/runtime');
for (const f of readdirSync(prismaRuntime)) {
  // Only the fast PostgreSQL query compiler is used (see packages/db/generated/prisma/internal/class.ts).
  if (
    /^query_compiler_(fast|small)_bg\.(sqlserver|cockroachdb|mysql|sqlite)\./.test(f) ||
    /^query_compiler_small_bg\./.test(f)
  )
    prune(`@prisma/client/runtime/${f}`);
}
// pdfjs: we import pdfjs-dist/legacy/build only.
for (const d of [
  'pdfjs-dist/build',
  'pdfjs-dist/web',
  'pdfjs-dist/types',
  'pdfjs-dist/image_decoders',
])
  prune(d);
const sizeOf = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce((n, e) => {
    const p = join(dir, e.name);
    return n + (e.isDirectory() ? sizeOf(p) : e.isFile() ? statSync(p).size : 0);
  }, 0);
const mb = sizeOf(FUNC) / 1024 / 1024;
console.log(`function size: ${mb.toFixed(1)} MB`);
if (mb > 245) throw new Error(`function is ${mb.toFixed(1)} MB; Vercel's limit is 250 MB`);

// 4. Prompts ship beside the bundle (read at runtime via AI_PROMPTS_DIR).
cpSync(join(ROOT, 'packages/ai/prompts'), join(FUNC, 'prompts'), { recursive: true });

// Thin launcher: loads the bundle dynamically so a failed import (e.g. a missing package) is
// reported as a 503 with the reason instead of an opaque FUNCTION_INVOCATION_FAILED.
writeFileSync(
  join(FUNC, 'index.mjs'),
  `let mod;
let loadError;
try {
  mod = await import('./app.mjs');
} catch (e) {
  loadError = e;
  console.error('API bundle failed to load', e);
}
export default function handler(req, res) {
  if (mod) return mod.default(req, res);
  res.statusCode = 503;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: { code: 'BOOT_FAILED', message: String(loadError && loadError.message || loadError).slice(0, 300) } }));
}
`,
);

writeFileSync(
  join(FUNC, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      maxDuration: 300,
      environment: { AI_PROMPTS_DIR: 'prompts' },
    },
    null,
    2,
  ),
);

// 5. Routing and the daily housekeeping cron (Hobby plans allow once a day).
writeFileSync(
  join(OUT, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(?:/.*)?$', dest: '/api' },
        {
          src: '^/assets/(.*)$',
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
          continue: true,
        },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
      crons: [{ path: '/api/v1/internal/cron', schedule: '0 3 * * *' }],
    },
    null,
    2,
  ),
);
console.log(`vercel build output ready: ${OUT}`);
