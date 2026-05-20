import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate, validateQuery } from '../../utils/validate';
import * as schema from './engagement.schema';
import * as ctrl from './engagement.controller';

const router = Router();

// ── Likes ─────────────────────────────────────────────────────────────────────

router.post('/lessons/:lessonId/like',   authenticate, ctrl.likeLesson);
router.delete('/lessons/:lessonId/like', authenticate, ctrl.unlikeLesson);

// ── Saves ─────────────────────────────────────────────────────────────────────

router.post('/lessons/:lessonId/save',   authenticate, ctrl.saveLesson);
router.delete('/lessons/:lessonId/save', authenticate, ctrl.unsaveLesson);

// ── Shares ────────────────────────────────────────────────────────────────────

router.post('/lessons/:lessonId/share',
  authenticate,
  validate(schema.shareSchema),
  ctrl.shareLesson,
);

// ── Comments ──────────────────────────────────────────────────────────────────

router.get('/lessons/:lessonId/comments',
  authenticate,
  validateQuery(schema.listCommentsQuerySchema),
  ctrl.listComments,
);

router.post('/lessons/:lessonId/comments',
  authenticate,
  validate(schema.postCommentSchema),
  ctrl.postComment,
);

// /comments/:id routes must come after /lessons/:lessonId/* to avoid conflicts
router.patch('/comments/:id',
  authenticate,
  validate(schema.editCommentSchema),
  ctrl.editComment,
);

router.delete('/comments/:id',
  authenticate,
  ctrl.deleteComment,
);

// ── Comment likes ─────────────────────────────────────────────────────────────

router.post('/comments/:id/like',   authenticate, ctrl.likeComment);
router.delete('/comments/:id/like', authenticate, ctrl.unlikeComment);

export default router;
