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

// List users — super_admin sees all; org_admin sees their org's instructors
router.get('/',
  authenticate,
  authorize(Role.super_admin, Role.org_admin),
  validateQuery(schema.listUsersQuerySchema),
  ctrl.listUsers,
);

// Edit a managed user's profile (super_admin edits org_admin/instructor; org_admin edits own instructors)
router.patch('/:id',
  authenticate,
  authorize(Role.super_admin, Role.org_admin),
  validate(schema.updateManagedUserSchema),
  ctrl.updateManagedUser,
);

// Reset a managed user's password (generates new temp password)
router.post('/:id/reset-password',
  authenticate,
  authorize(Role.super_admin, Role.org_admin),
  ctrl.adminResetPassword,
);

// Reassign user to a different organization (super_admin only)
router.patch('/:id/reassign-org',
  authenticate,
  authorize(Role.super_admin),
  validate(schema.reassignOrgSchema),
  ctrl.reassignOrg,
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
