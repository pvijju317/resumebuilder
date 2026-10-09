/** Mailpit REST API (v1.27 swagger): /api/v1/search, /api/v1/message/{ID}. */
const MAILPIT = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';

export async function latestOtp(to: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=1`,
    );
    const body = (await res.json()) as { messages: { ID: string }[] };
    const id = body.messages[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
      };
      const code = /\b(\d{6})\b/.exec(msg.Text)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No OTP email for ${to} within ${timeoutMs}ms`);
}

export const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
