import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate, validateQuery } from '../../utils/validate';
import * as schema from './notifications.schema';
import * as ctrl from './notifications.controller';

const router = Router();

// ── In-app notification log ───────────────────────────────────────────────────

router.get('/me',
  authenticate,
  validateQuery(schema.listQuerySchema),
  ctrl.listNotifications,
);

// /me/read-all must be before /me/:id/read so "read-all" isn't captured as :id
router.patch('/me/read-all',
  authenticate,
  ctrl.markAllRead,
);

router.patch('/me/:id/read',
  authenticate,
  ctrl.markRead,
);

// ── Device token registration ─────────────────────────────────────────────────

router.post('/device-token',
  authenticate,
  validate(schema.registerTokenSchema),
  ctrl.registerDeviceToken,
);

router.delete('/device-token',
  authenticate,
  validateQuery(schema.deregisterTokenQuerySchema),
  ctrl.deregisterDeviceToken,
);

export default router;
