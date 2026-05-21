import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate, validateQuery } from '../../utils/validate';
import { Role } from '@prisma/client';
import * as schema from './users.schema';
import * as ctrl from './users.controller';

const router = Router();

// ── Own profile ───────────────────────────────────────────────────────────────
// Note: /me routes must be declared BEFORE /:id to avoid "me" matching as an id param

router.get('/me',               authenticate, ctrl.getMe);
router.patch('/me',             authenticate, validate(schema.updateMeSchema),          ctrl.updateMe);
router.patch('/me/password',    authenticate, validate(schema.changePasswordSchema),    ctrl.changePassword);
router.get('/me/settings',      authenticate, ctrl.getSettings);
router.patch('/me/settings',    authenticate, validate(schema.updateSettingsSchema),    ctrl.updateSettings);
router.get('/me/preferences',   authenticate, ctrl.getPreferences);
router.patch('/me/preferences', authenticate, validate(schema.updatePreferencesSchema), ctrl.updatePreferences);
router.patch('/me/2fa',         authenticate, validate(schema.update2faSchema),         ctrl.update2fa);

// ── Admin ─────────────────────────────────────────────────────────────────────

// Create managed accounts (org_admin → instructor; super_admin → org_admin/instructor)
router.post('/managed',
  authenticate,
  authorize(Role.super_admin, Role.org_admin),
  validate(schema.createManagedUserSchema),
  ctrl.createManagedUser,
);

router.get('/',
  authenticate,
  authorize(Role.super_admin),
  validateQuery(schema.listUsersQuerySchema),
  ctrl.listUsers,
);

router.patch('/:id/role',
  authenticate,
  authorize(Role.super_admin),
  validate(schema.changeRoleSchema),
  ctrl.changeRole,
);

// Activate / deactivate a user (org_admin for instructors; super_admin for anyone)
router.patch('/:id/active',
  authenticate,
  authorize(Role.super_admin, Role.org_admin),
  validate(schema.setActiveSchema),
  ctrl.setActiveStatus,
);

router.delete('/:id',
  authenticate,
  authorize(Role.super_admin),
  ctrl.deleteUser,
);

// ── Public profiles & follows ─────────────────────────────────────────────────
// Declared last so /me and admin routes take precedence

router.get('/:id',              authenticate, ctrl.getPublicProfile);
router.post('/:id/follow',      authenticate, ctrl.followInstructor);
router.delete('/:id/follow',    authenticate, ctrl.unfollowInstructor);
router.get('/:id/follow',       authenticate, ctrl.checkFollow);

export default router;
