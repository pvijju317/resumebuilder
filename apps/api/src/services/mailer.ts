import nodemailer from 'nodemailer';
import type { Logger } from 'pino';
import type { ServerEnv } from '@tailor/shared/env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** `smtp`: Mailpit locally, SES SMTP interface in production. `log`: dev console only. */
export function createMailer(env: ServerEnv, logger: Logger): Mailer {
  if (env.EMAIL_TRANSPORT === 'log') {
    if (env.NODE_ENV === 'production')
      throw new Error('EMAIL_TRANSPORT=log is not allowed in production');
    return {
      async send(mail) {
        // Dev-only convenience: the OTP is visible in the API console.
        logger.info({ subject: mail.subject }, `[dev mail] ${mail.text}`);
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } } : {}),
  });
  return {
    async send(mail) {
      await transport.sendMail({ from: env.SES_FROM, ...mail });
    },
  };
}

export function otpEmail(appName: string, code: string, ttlMinutes: number): Omit<Mail, 'to'> {
  const text = `Your ${appName} sign-in code is ${code}. It expires in ${ttlMinutes} minutes. If you didn't request it, you can ignore this email.`;
  const html = `<div style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.5;color:#18181b;max-width:480px">
<p>Your ${appName} sign-in code:</p>
<p style="font-size:32px;font-weight:600;letter-spacing:0.2em;font-variant-numeric:tabular-nums;margin:16px 0">${code}</p>
<p style="color:#52525b">It expires in ${ttlMinutes} minutes. If you didn't request it, you can ignore this email.</p></div>`;
  return { subject: `${code} is your ${appName} sign-in code`, text, html };
}
