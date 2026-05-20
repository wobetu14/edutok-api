import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../utils/validate';
import { Role } from '@prisma/client';
import { upload } from '../../middleware/upload';
import * as schema from './media.schema';
import * as ctrl from './media.controller';

const router = Router();

// ── Upload ────────────────────────────────────────────────────────────────────
// multer runs before body validation so req.body is populated from the multipart form

router.post('/upload',
  authenticate,
  upload.single('file'),
  validate(schema.uploadBodySchema),
  ctrl.uploadMedia,
);

// ── Own uploads ───────────────────────────────────────────────────────────────
// /me must be declared before /:id to avoid "me" matching as an id param

router.get('/me',
  authenticate,
  ctrl.listMyUploads,
);

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete('/:id',
  authenticate,
  authorize(Role.super_admin, Role.org_admin, Role.instructor),
  ctrl.deleteMedia,
);

export default router;
