import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../utils/validate';
import * as schema from './auth.schema';
import * as ctrl from './auth.controller';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────

router.post('/register',        validate(schema.registerSchema),       ctrl.register);
router.post('/login',           validate(schema.loginSchema),          ctrl.login);
router.post('/refresh',         validate(schema.refreshSchema),        ctrl.refresh);
router.post('/forgot-password', validate(schema.forgotPasswordSchema), ctrl.forgotPassword);
router.post('/reset-password',  validate(schema.resetPasswordSchema),  ctrl.resetPassword);

// Phone OTP (public — used for phone_verify before token is issued, and password_reset)
router.post('/send-phone-otp',  validate(schema.sendPhoneOtpSchema),   ctrl.sendPhoneOtp);
router.post('/verify-phone-otp',validate(schema.verifyPhoneOtpSchema), ctrl.verifyPhoneOtp);

// Email OTP (authenticated — non-learner role enforced in service)
router.post('/send-email-otp',  authenticate, validate(schema.sendEmailOtpSchema),  ctrl.sendEmailOtp);
router.post('/verify-email-otp',              validate(schema.verifyEmailOtpSchema), ctrl.verifyEmailOtp);

// 2FA challenge (stateless — challengeToken from login carries identity)
router.post('/2fa/send',        validate(schema.twoFaSendSchema),      ctrl.twoFaSend);
router.post('/2fa/verify',      validate(schema.twoFaVerifySchema),    ctrl.twoFaVerify);

// ── Authenticated ─────────────────────────────────────────────────────────────

router.post('/logout',                       authenticate, validate(schema.logoutSchema),                    ctrl.logout);
router.post('/change-password-first-login',  authenticate, validate(schema.changePasswordFirstLoginSchema),  ctrl.changePasswordFirstLogin);

export default router;
