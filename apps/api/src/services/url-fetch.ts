import { lookup } from 'node:dns/promises';
import { Readability } from '@mozilla/readability';
import ipaddr from 'ipaddr.js';
import { parseHTML } from 'linkedom';
import { Agent, request } from 'undici';
import { AppError } from '@tailor/shared';

export const FETCH_LIMITS = {
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
  minChars: 300,
} as const;
const UNREADABLE = "We couldn't read the job from that link. Paste the job description instead.";

/** Only public unicast addresses may be fetched (SSRF guard). */
export function isPublicAddress(ip: string): boolean {
  try {
    let addr = ipaddr.parse(ip);
    if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress())
      addr = (addr as ipaddr.IPv6).toIPv4Address();
    return addr.range() === 'unicast';
  } catch {
    return false;
  }
}

/** Connect-time DNS check, so a hostname cannot resolve to a private address after validation. */
const agent = new Agent({
  connect: {
    lookup: (hostname, options, cb) => {
      lookup(hostname, { all: true })
        .then((addrs) => {
          const ok = addrs.filter((a) => isPublicAddress(a.address));
          if (ok.length === 0) return cb(new AppError('VALIDATION', UNREADABLE, 400), '', 4);
          const first = ok[0]!;
          if ((options as { all?: boolean }).all)
            return (cb as unknown as (e: null, a: typeof ok) => void)(null, ok);
          cb(null, first.address, first.family);
        })
        .catch((e: unknown) => cb(e as Error, '', 4));
    },
  },
  headersTimeout: FETCH_LIMITS.timeoutMs,
  bodyTimeout: FETCH_LIMITS.timeoutMs,
});

export async function fetchHtml(rawUrl: string): Promise<{ url: string; html: string }> {
  let url = rawUrl;
  for (let hop = 0; hop <= FETCH_LIMITS.maxRedirects; hop++) {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:')
      throw new AppError('VALIDATION', UNREADABLE, 400);
    if (
      ipaddr.isValid(u.hostname.replace(/^\[|\]$/g, '')) &&
      !isPublicAddress(u.hostname.replace(/^\[|\]$/g, ''))
    ) {
      throw new AppError('VALIDATION', UNREADABLE, 400);
    }
    let res;
    try {
      res = await request(url, {
        dispatcher: agent,
        method: 'GET',
        headers: {
          'user-agent': 'TailorBot/1.0 (+job description reader)',
          accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(FETCH_LIMITS.timeoutMs),
      });
    } catch (e) {
      throw e instanceof AppError ? e : new AppError('VALIDATION', UNREADABLE, 400, { cause: e });
    }
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers['location']) {
      await res.body.dump();
      url = new URL(String(res.headers['location']), url).toString();
      continue;
    }
    const type = String(res.headers['content-type'] ?? '');
    if (res.statusCode !== 200 || !/text\/html|application\/xhtml|text\/plain/.test(type)) {
      await res.body.dump();
      throw new AppError('VALIDATION', UNREADABLE, 400);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += (chunk as Buffer).byteLength;
      if (size > FETCH_LIMITS.maxBytes) {
        res.body.destroy();
        throw new AppError('VALIDATION', UNREADABLE, 400);
      }
      chunks.push(chunk as Buffer);
    }
    return { url, html: Buffer.concat(chunks).toString('utf8') };
  }
  throw new AppError('VALIDATION', UNREADABLE, 400);
}

/**
 * Readable main text from HTML. linkedom only parses: scripts never run and nothing is loaded.
 * (Not jsdom: its dependencies need require() of ES modules, which the Vercel runtime refuses.)
 */
export function readableText(html: string): string {
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as ConstructorParameters<typeof Readability>[0]).parse();
  const text = (article?.textContent ?? document.body?.textContent ?? '')
    .replace(/\s+\n/g, '\n')
    .trim();
  const title = article?.title ? `${article.title}\n\n` : '';
  return `${title}${text}`;
}

export async function fetchJobText(url: string): Promise<string> {
  const { html } = await fetchHtml(url);
  const text = readableText(html);
  if (text.length < FETCH_LIMITS.minChars) throw new AppError('VALIDATION', UNREADABLE, 400);
  return text;
}
