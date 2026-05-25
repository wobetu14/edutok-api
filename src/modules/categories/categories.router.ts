import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../utils/validate';
import { Role } from '@prisma/client';
import * as schema from './categories.schema';
import * as ctrl from './categories.controller';

const router = Router();

// Public — lists all categories with course counts
router.get('/', ctrl.listCategories);

// Super admin only — full CRUD
router.post('/',
  authenticate,
  authorize(Role.super_admin),
  validate(schema.createCategorySchema),
  ctrl.createCategory,
);

router.patch('/:id',
  authenticate,
  authorize(Role.super_admin),
  validate(schema.updateCategorySchema),
  ctrl.updateCategory,
);

router.delete('/:id',
  authenticate,
  authorize(Role.super_admin),
  ctrl.deleteCategory,
);

export default router;
