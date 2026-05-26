import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../utils/validate';
import { Role } from '@prisma/client';
import * as schema from './quizzes.schema';
import * as ctrl from './quizzes.controller';

const router = Router();

// ── Quiz CRUD (instructors and up) ────────────────────────────────────────────

router.post('/',
  authenticate,
  authorize(Role.org_admin, Role.instructor),
  validate(schema.createQuizSchema),
  ctrl.createQuiz,
);

// ── Learner: fetch by lesson ──────────────────────────────────────────────────

// IMPORTANT: /lesson/:lessonId before /:id to avoid "lesson" being matched as an id
router.get('/lesson/:lessonId',
  authenticate,
  ctrl.getQuizByLesson,
);

// ── Learner: submit answers ───────────────────────────────────────────────────

router.post('/:id/submit',
  authenticate,
  validate(schema.submitQuizSchema),
  ctrl.submitQuiz,
);

// ── Quiz CRUD continued ───────────────────────────────────────────────────────

router.patch('/:id',
  authenticate,
  authorize(Role.org_admin, Role.instructor),
  validate(schema.updateQuizSchema),
  ctrl.updateQuiz,
);

router.delete('/:id',
  authenticate,
  authorize(Role.org_admin, Role.instructor),
  ctrl.deleteQuiz,
);

export default router;
