import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validateQuery } from '../../utils/validate';
import * as schema from './progress.schema';
import * as ctrl from './progress.controller';

const router = Router();

// ── Streak ────────────────────────────────────────────────────────────────────

router.get('/me/streak',        authenticate, ctrl.getStreak);

// ── Badges ────────────────────────────────────────────────────────────────────

router.get('/me/badges',        authenticate, ctrl.getBadges);

// ── Certificates ──────────────────────────────────────────────────────────────

router.get('/me/certificates',     authenticate, ctrl.listCertificates);
router.get('/me/certificates/:id', authenticate, ctrl.getCertificate);

// ── Public certificate verification (no auth) ─────────────────────────────────

router.get('/verify/:certNumber',  ctrl.verifyCertificate);

// ── Learning history ──────────────────────────────────────────────────────────

router.get('/me/completions',
  authenticate,
  validateQuery(schema.listQuerySchema),
  ctrl.getCompletions,
);

router.get('/me/quiz-history',
  authenticate,
  validateQuery(schema.listQuerySchema),
  ctrl.getQuizHistory,
);

router.get('/me/saves',
  authenticate,
  validateQuery(schema.listQuerySchema),
  ctrl.getSaves,
);

// ── Analytics ─────────────────────────────────────────────────────────────────

router.get('/me/analytics',     authenticate, ctrl.getAnalytics);

export default router;
