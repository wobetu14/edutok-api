import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validateQuery } from '../../utils/validate';
import * as schema from './search.schema';
import * as ctrl from './search.controller';

const router = Router();

// ── Categories (public, no auth) ──────────────────────────────────────────────
// Declared before / and /history so the literal path takes priority

router.get('/categories', ctrl.getCategories);

// ── Search ────────────────────────────────────────────────────────────────────

router.get('/',
  authenticate,
  validateQuery(schema.searchQuerySchema),
  ctrl.search,
);

// ── History ───────────────────────────────────────────────────────────────────

router.get('/history',
  authenticate,
  validateQuery(schema.historyQuerySchema),
  ctrl.getHistory,
);

router.delete('/history',
  authenticate,
  ctrl.clearHistory,
);

export default router;
