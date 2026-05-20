import nodemailer from 'nodemailer';
import { env } from '../config/env';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   env.SMTP_HOST,
      port:   env.SMTP_PORT ?? 587,
      secure: false,
      auth:   { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.SMTP_HOST || env.NODE_ENV !== 'production') {
    // Dev / test: log email to console so it works without SMTP configured
    console.log(`\n[EMAIL] ── To: ${to}\n[EMAIL]    Subject: ${subject}\n[EMAIL]    ${html.replace(/<[^>]+>/g, '')}\n`);
    return;
  }
  await getTransporter().sendMail({ from: env.SMTP_FROM, to, subject, html });
}

// ── Email templates ───────────────────────────────────────────────────────────

export function verificationEmail(name: string, code: string): string {
  return `
    <p>Hi ${name},</p>
    <p>Your EduTok email verification code is:</p>
    <h2 style="letter-spacing:4px">${code}</h2>
    <p>This code expires in <strong>15 minutes</strong>.</p>
    <p>If you didn't request this, ignore this email.</p>
  `;
}

export function twoFaEmail(name: string, code: string): string {
  return `
    <p>Hi ${name},</p>
    <p>Your EduTok two-factor authentication code is:</p>
    <h2 style="letter-spacing:4px">${code}</h2>
    <p>This code expires in <strong>10 minutes</strong>.</p>
    <p>Never share this code with anyone.</p>
  `;
}

export function passwordResetEmail(name: string, token: string): string {
  return `
    <p>Hi ${name},</p>
    <p>You requested a password reset. Use this token in the app:</p>
    <h3 style="font-family:monospace">${token}</h3>
    <p>This token expires in <strong>30 minutes</strong>.</p>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `;
}
