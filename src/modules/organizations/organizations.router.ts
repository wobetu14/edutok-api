import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate, validateQuery } from '../../utils/validate';
import { Role } from '@prisma/client';
import * as schema from './organizations.schema';
import * as ctrl from './organizations.controller';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────

router.get('/',
  validateQuery(schema.listOrgsQuerySchema),
  ctrl.listOrgs,
);

router.get('/:id',
  ctrl.getOrg,
);

router.get('/:id/courses',
  validateQuery(schema.listCoursesQuerySchema),
  ctrl.getOrgCourses,
);

// ── Org management ────────────────────────────────────────────────────────────

router.post('/',
  authenticate,
  authorize(Role.super_admin),
  validate(schema.createOrgSchema),
  ctrl.createOrg,
);

router.patch('/:id',
  authenticate,
  authorize(Role.super_admin, Role.org_admin),
  validate(schema.updateOrgSchema),
  ctrl.updateOrg,
);

router.delete('/:id',
  authenticate,
  authorize(Role.super_admin),
  ctrl.deleteOrg,
);

// ── Member management ─────────────────────────────────────────────────────────

router.get('/:id/members',
  authenticate,
  authorize(Role.super_admin, Role.org_admin),
  ctrl.listMembers,
);

router.post('/:id/members',
  authenticate,
  authorize(Role.super_admin, Role.org_admin),
  validate(schema.addMemberSchema),
  ctrl.addMember,
);

router.patch('/:id/members/:userId',
  authenticate,
  authorize(Role.super_admin, Role.org_admin),
  validate(schema.updateMemberSchema),
  ctrl.updateMember,
);

router.delete('/:id/members/:userId',
  authenticate,
  authorize(Role.super_admin, Role.org_admin),
  ctrl.removeMember,
);

export default router;
