import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  fetchHtml,
  fetchJobText,
  isPublicAddress,
  readableText,
} from '../src/services/url-fetch.js';

describe('isPublicAddress (SSRF guard)', () => {
  it.each([
    ['8.8.8.8', true],
    ['104.16.0.1', true],
    ['2606:4700::1', true],
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['172.16.0.5', false],
    ['192.168.1.1', false],
    ['169.254.169.254', false], // cloud metadata
    ['100.64.0.1', false], // carrier-grade NAT
    ['0.0.0.0', false],
    ['::1', false],
    ['fd00::1', false],
    ['::ffff:127.0.0.1', false],
    ['not-an-ip', false],
  ])('%s → %s', (ip, ok) => {
    expect(isPublicAddress(ip)).toBe(ok);
  });
});

describe('fetchHtml refuses internal targets', () => {
  let server: Server;
  let port = 0;
  beforeAll(async () => {
    server = createServer((_req, res) => res.end('<html><body>internal secret</body></html>'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('blocks private IP literals and hostnames that resolve to loopback', async () => {
    await expect(fetchHtml(`http://127.0.0.1:${port}/`)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(fetchHtml(`http://localhost:${port}/`)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(fetchHtml('http://[::1]/')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(fetchHtml('http://169.254.169.254/latest/meta-data/')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('rejects non-http schemes', async () => {
    await expect(fetchHtml('file:///etc/passwd')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(fetchJobText('ftp://example.com/job')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
});

describe('readableText', () => {
  it('extracts the main content and drops navigation and scripts', () => {
    const html = `<html><head><title>Data Analyst - Fabrikam Careers</title><script>window.evil = 1</script></head><body>
      <nav>Home Jobs About Login</nav>
      <article><h1>Data Analyst</h1>
      <p>Fabrikam is hiring a Data Analyst in Austin to own weekly business reviews and design experiments across our stores.</p>
      <h2>Requirements</h2><ul><li>3+ years of SQL and Python</li><li>Tableau dashboards for senior stakeholders</li><li>Experience running A/B tests</li></ul>
      <p>You will partner with category managers and translate questions into analysis plans with clear recommendations.</p></article>
      <footer>© Fabrikam</footer></body></html>`;
    const text = readableText(html, 'https://jobs.example.com/1');
    expect(text).toContain('3+ years of SQL and Python');
    expect(text).toContain('Data Analyst');
    expect(text).not.toContain('window.evil');
  });
});
