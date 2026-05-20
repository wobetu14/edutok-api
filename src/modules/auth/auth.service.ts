import jwt from 'jsonwebtoken';
import { Role, TwoFaMethod, VerificationType } from '@prisma/client';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateOtp,
  generateSecureToken,
} from '../../utils/hash';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { ApiError } from '../../middleware/errorHandler';
import { sendSms } from '../../services/sms.service';
import {
  sendEmail,
  verificationEmail,
  twoFaEmail,
  passwordResetEmail,
} from '../../services/email.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const OTP_TTL_MS           = 10 * 60 * 1000;   // 10 min
const OTP_MAX_ATTEMPTS     = 3;
const RESET_TOKEN_TTL_MS   = 30 * 60 * 1000;   // 30 min
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Internal helpers ──────────────────────────────────────────────────────────

async function issueTokens(userId: string, role: string, username: string) {
  const accessToken  = signAccessToken({ sub: userId, role, username });
  const rawRefresh   = generateSecureToken(32);
  const tokenHash    = hashToken(rawRefresh);

  await prisma.refreshToken.create({
    data: {
      user_id:    userId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  return { accessToken, refreshToken: rawRefresh };
}

// Short-lived JWT issued after first factor; required to call /2fa/send and /2fa/verify
function signChallengeToken(userId: string): string {
  return jwt.sign(
    { sub: userId, scope: '2fa_challenge' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '10m' },
  );
}

function verifyChallengeToken(token: string): { sub: string } | null {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET) as any;
    return p?.scope === '2fa_challenge' ? { sub: p.sub } : null;
  } catch {
    return null;
  }
}

function sanitize(user: Record<string, any>) {
  const { password_hash, ...safe } = user;
  return safe;
}

function maskPhone(phone: string) {
  return phone.slice(0, 3) + '***' + phone.slice(-2);
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  return (local[0] ?? '') + '***@' + domain;
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function register(data: {
  full_name: string;
  username:  string;
  phone:     string;
  password:  string;
  email?:    string;
}) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: data.username }, { phone: data.phone }] },
  });
  if (existing?.username === data.username) throw new ApiError(409, 'Username already taken');
  if (existing?.phone    === data.phone)    throw new ApiError(409, 'Phone number already registered');

  if (data.email) {
    const taken = await prisma.user.findUnique({ where: { email: data.email } });
    if (taken) throw new ApiError(409, 'Email already registered');
  }

  const password_hash = await hashPassword(data.password);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        full_name:    data.full_name,
        username:     data.username,
        phone:        data.phone,
        email:        data.email ?? null,
        password_hash,
        role:         Role.learner,
        two_fa_method: TwoFaMethod.none,
      },
    });
    // Bootstrap related records
    await tx.streak.create({ data: { user_id: u.id } });
    await tx.userPreference.create({ data: { user_id: u.id } });
    await tx.userSetting.create({ data: { user_id: u.id } });
    return u;
  });

  const tokens = await issueTokens(user.id, user.role, user.username);
  return { user: sanitize(user), ...tokens };
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  // Same error for both "not found" and "wrong password" to prevent user enumeration
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new ApiError(401, 'Invalid username or password');
  }

  if (user.two_fa_enabled) {
    const challengeToken = signChallengeToken(user.id);
    return {
      requires2fa:    true,
      challengeToken,
      two_fa_method:  user.two_fa_method,
    };
  }

  const tokens = await issueTokens(user.id, user.role, user.username);
  return { requires2fa: false, user: sanitize(user), ...tokens };
}

// ── Refresh tokens ────────────────────────────────────────────────────────────

export async function refreshTokens(rawToken: string) {
  const payload = verifyRefreshToken(rawToken);
  if (!payload) throw new ApiError(401, 'Invalid refresh token');

  const tokenHash = hashToken(rawToken);
  const stored    = await prisma.refreshToken.findUnique({ where: { token_hash: tokenHash } });

  if (!stored || stored.revoked_at || stored.expires_at < new Date()) {
    throw new ApiError(401, 'Refresh token expired or revoked');
  }

  // Rotate: revoke old, issue new
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data:  { revoked_at: new Date() },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: stored.user_id } });
  return issueTokens(user.id, user.role, user.username);
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(userId: string, rawToken?: string) {
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await prisma.refreshToken.updateMany({
      where: { user_id: userId, token_hash: tokenHash },
      data:  { revoked_at: new Date() },
    });
  } else {
    // Revoke all sessions (e.g. "log out everywhere")
    await prisma.refreshToken.updateMany({
      where: { user_id: userId, revoked_at: null },
      data:  { revoked_at: new Date() },
    });
  }
}

// ── Phone OTP ─────────────────────────────────────────────────────────────────

export async function sendPhoneOtp(phone: string, type: VerificationType) {
  const user = await prisma.user.findUnique({ where: { phone } });

  // Don't reveal whether the account exists for password_reset
  if (!user) {
    return { message: `OTP sent to ${maskPhone(phone)}` };
  }

  // Invalidate any pending OTPs of the same type for this user
  await prisma.phoneVerification.updateMany({
    where: { user_id: user.id, type, verified_at: null },
    data:  { expires_at: new Date() },
  });

  const code       = generateOtp(6);
  const expires_at = new Date(Date.now() + OTP_TTL_MS);

  await prisma.phoneVerification.create({
    data: { user_id: user.id, phone, code, type, expires_at },
  });

  await sendSms(phone, `Your EduTok code is ${code}. Valid for 10 minutes. Do not share this.`);

  return { message: `OTP sent to ${maskPhone(phone)}` };
}

export async function verifyPhoneOtp(phone: string, code: string, type: VerificationType) {
  const record = await prisma.phoneVerification.findFirst({
    where: {
      phone,
      type,
      verified_at: null,
      expires_at:  { gt: new Date() },
    },
    orderBy: { created_at: 'desc' },
  });

  if (!record)                              throw new ApiError(400, 'OTP not found or expired. Request a new one.');
  if (record.attempts >= OTP_MAX_ATTEMPTS)  throw new ApiError(429, 'Too many failed attempts. Request a new OTP.');
  if (record.code !== code) {
    await prisma.phoneVerification.update({
      where: { id: record.id },
      data:  { attempts: { increment: 1 } },
    });
    throw new ApiError(400, 'Incorrect OTP');
  }

  // Mark verified
  await prisma.phoneVerification.update({
    where: { id: record.id },
    data:  { verified_at: new Date() },
  });

  if (type === VerificationType.phone_verify) {
    await prisma.user.update({
      where: { id: record.user_id },
      data:  { is_phone_verified: true },
    });
    return { verified: true };
  }

  if (type === VerificationType.password_reset) {
    return _issueResetToken(record.user_id);
  }

  // two_fa type is handled by verify2faCode — should not reach here directly
  return { verified: true };
}

// ── Email OTP (non-learners only) ─────────────────────────────────────────────

export async function sendEmailOtp(userId: string, email: string, type: VerificationType) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.role === Role.learner) {
    throw new ApiError(403, 'Learners do not use email verification');
  }

  // Invalidate pending tokens of same type
  await prisma.emailVerification.updateMany({
    where: { user_id: userId, type, verified_at: null },
    data:  { expires_at: new Date() },
  });

  // For 2FA use a 6-digit OTP; for email_verify / password_reset use a long secure token
  const isShortCode  = type === VerificationType.two_fa;
  const rawToken     = isShortCode ? generateOtp(6) : generateSecureToken(32);
  const token_hash   = hashToken(rawToken);
  const expires_at   = new Date(Date.now() + OTP_TTL_MS);

  await prisma.emailVerification.create({
    data: { user_id: userId, email, token_hash, type, expires_at },
  });

  const html =
    type === VerificationType.two_fa       ? twoFaEmail(user.full_name, rawToken) :
    type === VerificationType.email_verify ? verificationEmail(user.full_name, rawToken) :
                                             passwordResetEmail(user.full_name, rawToken);

  const subject =
    type === VerificationType.two_fa       ? 'Your EduTok 2FA code' :
    type === VerificationType.email_verify ? 'Verify your EduTok email' :
                                             'Reset your EduTok password';

  await sendEmail(email, subject, html);
  return { message: `Verification sent to ${maskEmail(email)}` };
}

export async function verifyEmailOtp(email: string, token: string, type: VerificationType) {
  const token_hash = hashToken(token);

  const record = await prisma.emailVerification.findFirst({
    where: { email, token_hash, type, verified_at: null, expires_at: { gt: new Date() } },
    orderBy: { created_at: 'desc' },
  });

  if (!record)                              throw new ApiError(400, 'Invalid or expired token. Request a new one.');
  if (record.attempts >= OTP_MAX_ATTEMPTS)  throw new ApiError(429, 'Too many failed attempts. Request a new link.');

  await prisma.emailVerification.update({
    where: { id: record.id },
    data:  { verified_at: new Date() },
  });

  if (type === VerificationType.email_verify) {
    await prisma.user.update({
      where: { id: record.user_id },
      data:  { is_email_verified: true },
    });
    return { verified: true };
  }

  if (type === VerificationType.password_reset) {
    return _issueResetToken(record.user_id);
  }

  return { verified: true };
}

// ── 2FA ───────────────────────────────────────────────────────────────────────

export async function send2faCode(challengeToken: string) {
  const payload = verifyChallengeToken(challengeToken);
  if (!payload) throw new ApiError(401, 'Invalid or expired challenge token');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
  if (!user.two_fa_enabled) throw new ApiError(400, '2FA is not enabled for this account');

  if (user.two_fa_method === TwoFaMethod.email) {
    if (!user.email) throw new ApiError(400, 'No email on file for 2FA');
    return sendEmailOtp(user.id, user.email, VerificationType.two_fa);
  }

  return sendPhoneOtp(user.phone, VerificationType.two_fa);
}

export async function verify2faCode(challengeToken: string, code: string) {
  const payload = verifyChallengeToken(challengeToken);
  if (!payload) throw new ApiError(401, 'Invalid or expired challenge token');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
  if (!user.two_fa_enabled) throw new ApiError(400, '2FA is not enabled for this account');

  if (user.two_fa_method === TwoFaMethod.email) {
    // Email 2FA: token_hash stored = SHA-256 of the 6-digit OTP
    const token_hash = hashToken(code);
    const record = await prisma.emailVerification.findFirst({
      where: {
        user_id:     user.id,
        token_hash,
        type:        VerificationType.two_fa,
        verified_at: null,
        expires_at:  { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });
    if (!record) throw new ApiError(400, 'Invalid or expired 2FA code');
    await prisma.emailVerification.update({
      where: { id: record.id },
      data:  { verified_at: new Date() },
    });
  } else {
    // Phone 2FA: code stored as plain text
    const record = await prisma.phoneVerification.findFirst({
      where: {
        user_id:     user.id,
        type:        VerificationType.two_fa,
        verified_at: null,
        expires_at:  { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!record)                              throw new ApiError(400, 'OTP not found or expired');
    if (record.attempts >= OTP_MAX_ATTEMPTS)  throw new ApiError(429, 'Too many failed attempts');
    if (record.code !== code) {
      await prisma.phoneVerification.update({
        where: { id: record.id },
        data:  { attempts: { increment: 1 } },
      });
      throw new ApiError(400, 'Incorrect 2FA code');
    }
    await prisma.phoneVerification.update({
      where: { id: record.id },
      data:  { verified_at: new Date() },
    });
  }

  const tokens = await issueTokens(user.id, user.role, user.username);
  return { user: sanitize(user), ...tokens };
}

// ── Forgot password ───────────────────────────────────────────────────────────

export async function forgotPassword(identifier: string) {
  const isEmail = identifier.includes('@');
  const SILENT  = { message: 'If that account exists, reset instructions have been sent.' };

  if (isEmail) {
    const user = await prisma.user.findUnique({ where: { email: identifier } });
    if (!user)                       return SILENT;
    if (user.role === Role.learner)  throw new ApiError(400, 'Learners must reset password via phone');
    await sendEmailOtp(user.id, identifier, VerificationType.password_reset);
  } else {
    const user = await prisma.user.findUnique({ where: { phone: identifier } });
    if (!user) return SILENT;
    await sendPhoneOtp(identifier, VerificationType.password_reset);
  }

  return SILENT;
}

// ── Reset password ────────────────────────────────────────────────────────────

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashToken(token);

  const record = await prisma.passwordResetToken.findUnique({ where: { token_hash: tokenHash } });
  if (!record || record.used_at || record.expires_at < new Date()) {
    throw new ApiError(400, 'Reset token is invalid or expired');
  }

  const password_hash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.user_id }, data: { password_hash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { used_at: new Date() } }),
    // Invalidate all active sessions
    prisma.refreshToken.updateMany({
      where: { user_id: record.user_id, revoked_at: null },
      data:  { revoked_at: new Date() },
    }),
  ]);

  return { message: 'Password reset successfully. Please log in with your new password.' };
}

// ── Private: issue a password reset token after OTP verified ─────────────────

async function _issueResetToken(userId: string) {
  const rawToken  = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);

  await prisma.passwordResetToken.create({
    data: {
      user_id:    userId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  return { resetToken: rawToken };
}
