import { z } from 'zod';

export const registerSchema = z.object({
  full_name: z.string().min(2).max(100).trim(),
  username:  z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Alphanumeric and underscore only'),
  phone:     z.string().min(7).max(20),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
  email:     z.string().email().optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(), // if omitted, revokes all tokens for user
});

// Phone OTP
export const sendPhoneOtpSchema = z.object({
  phone: z.string().min(7).max(20),
  type:  z.enum(['phone_verify', 'two_fa', 'password_reset']),
});

export const verifyPhoneOtpSchema = z.object({
  phone: z.string().min(7).max(20),
  code:  z.string().length(6).regex(/^\d+$/, 'OTP must be 6 digits'),
  type:  z.enum(['phone_verify', 'two_fa', 'password_reset']),
});

// Email OTP (non-learners only)
export const sendEmailOtpSchema = z.object({
  email: z.string().email(),
  type:  z.enum(['email_verify', 'two_fa', 'password_reset']),
});

export const verifyEmailOtpSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  type:  z.enum(['email_verify', 'two_fa', 'password_reset']),
});

// 2FA challenge (after first factor login)
export const twoFaSendSchema = z.object({
  challengeToken: z.string().min(1),
});

export const twoFaVerifySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().length(6).regex(/^\d+$/, 'Code must be 6 digits'),
});

// Password reset
export const forgotPasswordSchema = z.object({
  identifier: z.string().min(1), // phone number or email address
});

export const resetPasswordSchema = z.object({
  token:       z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});
