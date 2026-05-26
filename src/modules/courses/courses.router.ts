import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate, validateQuery } from '../../utils/validate';
import { Role } from '@prisma/client';
import * as schema from './courses.schema';
import * as ctrl from './courses.controller';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────

router.get('/',
  validateQuery(schema.listCoursesQuerySchema),
  ctrl.listCourses,
);

// ── Staff: own-course management view (all statuses + visibilities) ───────────
// Must be declared before /:id so "mine" doesn't match as a course ID param

router.get('/mine',
  authenticate,
  authorize(Role.super_admin, Role.org_admin, Role.instructor),
  validateQuery(schema.listMyCoursesQuerySchema),
  ctrl.listMyCourses,
);

// GET /:id is public but uses optional auth to attach is_enrolled + instructor visibility
router.get('/:id',
  ctrl.getCourse,
);

// ── Course CRUD ───────────────────────────────────────────────────────────────

router.post('/',
  authenticate,
  authorize(Role.org_admin, Role.instructor),
  validate(schema.createCourseSchema),
  ctrl.createCourse,
);

router.patch('/:id',
  authenticate,
  authorize(Role.org_admin, Role.instructor),
  validate(schema.updateCourseSchema),
  ctrl.updateCourse,
);

router.delete('/:id',
  authenticate,
  authorize(Role.org_admin),
  ctrl.deleteCourse,
);

// ── Approval workflow ─────────────────────────────────────────────────────────

router.post('/:id/submit',
  authenticate,
  authorize(Role.org_admin, Role.instructor),
  ctrl.submitCourse,
);

router.patch('/:id/approve',
  authenticate,
  authorize(Role.org_admin),
  validate(schema.approveSchema),
  ctrl.approveCourse,
);

// ── Enrollment ────────────────────────────────────────────────────────────────

router.post('/:id/enroll',
  authenticate,
  ctrl.enrollCourse,
);

router.delete('/:id/enroll',
  authenticate,
  ctrl.unenrollCourse,
);

// ── Instructor / admin views ──────────────────────────────────────────────────

router.get('/:id/students',
  authenticate,
  authorize(Role.super_admin, Role.org_admin, Role.instructor),
  validateQuery(schema.listStudentsQuerySchema),
  ctrl.listStudents,
);

export default router;
