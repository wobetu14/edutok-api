import { Request, Response, NextFunction } from 'express';
import * as service from './categories.service';
import { ok, created, paginated } from '../../utils/response';
import { logAudit } from '../admin/admin.service';

export async function listCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listCategories();
    ok(res, data);
  } catch (e) { next(e); }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createCategory(req.body);
    logAudit(req.user!.id, 'category.created', data.id, 'Category', { label: data.label }).catch(() => {});
    created(res, data, 'Category created');
  } catch (e) { next(e); }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateCategory(req.params.id, req.body);
    logAudit(req.user!.id, 'category.updated', data.id, 'Category', req.body).catch(() => {});
    ok(res, data, 'Category updated');
  } catch (e) { next(e); }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.deleteCategory(req.params.id);
    logAudit(req.user!.id, 'category.deleted', req.params.id, 'Category').catch(() => {});
    ok(res, result, 'Category deleted');
  } catch (e) { next(e); }
}

export async function listCategoryCourses(req: Request, res: Response, next: NextFunction) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const data  = await service.listCategoryCourses(req.params.id, page, limit);
    paginated(res, data.courses, data.total, page, limit);
  } catch (e) { next(e); }
}
