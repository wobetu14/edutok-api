import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../utils/validate';
import { Role } from '@prisma/client';
import * as schema from './lessons.schema';
import * as ctrl from './lessons.controller';

const router = Router();

// ── Lesson CRUD ───────────────────────────────────────────────────────────────

router.post('/',
  authenticate,
  authorize(Role.org_admin, Role.instructor),
  validate(schema.createLessonSchema),
  ctrl.createLesson,
);

// IMPORTANT: /reorder must be declared before /:id to avoid "reorder" matching as a param
router.patch('/reorder',
  authenticate,
  authorize(Role.org_admin, Role.instructor),
  validate(schema.reorderSchema),
  ctrl.reorderLessons,
);

router.patch('/:id',
  authenticate,
  authorize(Role.org_admin, Role.instructor),
  validate(schema.updateLessonSchema),
  ctrl.updateLesson,
);

router.delete('/:id',
  authenticate,
  authorize(Role.org_admin, Role.instructor),
  ctrl.deleteLesson,
);

// ── Learner endpoints ─────────────────────────────────────────────────────────

router.get('/:id',
  authenticate,
  ctrl.getLesson,
);

router.post('/:id/complete',
  authenticate,
  ctrl.completeLesson,
);

// ── Video watch progress ──────────────────────────────────────────────────────

router.get('/:id/progress',
  authenticate,
  ctrl.getVideoProgress,
);

router.patch('/:id/progress',
  authenticate,
  validate(schema.updateProgressSchema),
  ctrl.updateVideoProgress,
);

export default router;
