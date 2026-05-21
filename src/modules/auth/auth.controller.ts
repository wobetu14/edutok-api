import { Request, Response, NextFunction } from 'express';
import * as service from './auth.service';
import { ok, created } from '../../utils/response';

// POST /api/auth/register
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.register(req.body);
    created(res, result, 'Account created successfully');
  } catch (e) { next(e); }
}

// POST /api/auth/login
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.login(req.body.username, req.body.password);
    ok(res, result, result.requires2fa ? '2FA required' : 'Login successful');
  } catch (e) { next(e); }
}

// POST /api/auth/refresh
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const tokens = await service.refreshTokens(req.body.refreshToken);
    ok(res, tokens, 'Tokens refreshed');
  } catch (e) { next(e); }
}

// POST /api/auth/logout
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await service.logout(req.user!.id, req.body.refreshToken);
    ok(res, null, 'Logged out successfully');
  } catch (e) { next(e); }
}

// POST /api/auth/send-phone-otp
export async function sendPhoneOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.sendPhoneOtp(req.body.phone, req.body.type);
    ok(res, result);
  } catch (e) { next(e); }
}

// POST /api/auth/verify-phone-otp
export async function verifyPhoneOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.verifyPhoneOtp(req.body.phone, req.body.code, req.body.type);
    ok(res, result);
  } catch (e) { next(e); }
}

// POST /api/auth/send-email-otp  (non-learners only — enforced in service)
export async function sendEmailOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.sendEmailOtp(req.user!.id, req.body.email, req.body.type);
    ok(res, result);
  } catch (e) { next(e); }
}

// POST /api/auth/verify-email-otp
export async function verifyEmailOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.verifyEmailOtp(req.body.email, req.body.token, req.body.type);
    ok(res, result);
  } catch (e) { next(e); }
}

// POST /api/auth/2fa/send
export async function twoFaSend(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.send2faCode(req.body.challengeToken);
    ok(res, result);
  } catch (e) { next(e); }
}

// POST /api/auth/2fa/verify
export async function twoFaVerify(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.verify2faCode(req.body.challengeToken, req.body.code);
    ok(res, result, 'Login successful');
  } catch (e) { next(e); }
}

// POST /api/auth/forgot-password
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.forgotPassword(req.body.identifier);
    ok(res, result);
  } catch (e) { next(e); }
}

// POST /api/auth/reset-password
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.resetPassword(req.body.token, req.body.newPassword);
    ok(res, result);
  } catch (e) { next(e); }
}

// POST /api/auth/change-password-first-login  (authenticated — must_change_password users)
export async function changePasswordFirstLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const tokens = await service.changePasswordFirstLogin(req.user!.id, req.body.newPassword);
    ok(res, tokens, 'Password changed. You are now logged in with your new credentials.');
  } catch (e) { next(e); }
}
