import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate, validateQuery } from '../../utils/validate';
import { Role } from '@prisma/client';
import * as schema from './admin.schema';
import * as ctrl from './admin.controller';

const router = Router();

const sa   = authorize(Role.super_admin);
const saOa = authorize(Role.super_admin, Role.org_admin);

// ── Platform stats ────────────────────────────────────────────────────────────

router.get('/stats',
  authenticate,
  sa,
  ctrl.getStats,
);

// ── Org admin dashboard ───────────────────────────────────────────────────────

router.get('/org-dashboard',
  authenticate,
  authorize(Role.org_admin),
  ctrl.getOrgDashboard,
);

// ── Org-scoped stats (org_admin + super_admin) ────────────────────────────────

router.get('/org-stats',
  authenticate,
  saOa,
  validateQuery(schema.orgStatsQuerySchema),
  ctrl.getOrgStats,
);

// ── User management ───────────────────────────────────────────────────────────

router.get('/users',
  authenticate,
  sa,
  validateQuery(schema.listUsersQuerySchema),
  ctrl.listUsers,
);

// ── Course approval workflow ──────────────────────────────────────────────────
// /courses/pending must be before /courses/:id/review (no ambiguity here but keep explicit)

router.get('/courses/pending',
  authenticate,
  saOa,
  validateQuery(schema.listPendingCoursesQuerySchema),
  ctrl.listPendingCourses,
);

router.patch('/courses/:id/review',
  authenticate,
  saOa,
  validate(schema.reviewCourseBodySchema),
  ctrl.reviewCourse,
);

// ── Content moderation ────────────────────────────────────────────────────────

router.get('/reports',
  authenticate,
  sa,
  validateQuery(schema.listReportsQuerySchema),
  ctrl.listReports,
);

router.patch('/reports/:id',
  authenticate,
  sa,
  validate(schema.resolveReportBodySchema),
  ctrl.resolveReport,
);

// ── Audit log ─────────────────────────────────────────────────────────────────

router.get('/audit-logs',
  authenticate,
  sa,
  validateQuery(schema.listAuditLogsQuerySchema),
  ctrl.listAuditLogs,
);

// ── Announcements ─────────────────────────────────────────────────────────────

router.get('/announcements',
  authenticate,
  sa,
  ctrl.listAnnouncements,
);

router.post('/announcements',
  authenticate,
  sa,
  validate(schema.createAnnouncementBodySchema),
  ctrl.createAnnouncement,
);

router.delete('/announcements/:id',
  authenticate,
  sa,
  ctrl.deleteAnnouncement,
);

export default router;
