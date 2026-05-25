import { Request, Response, NextFunction } from 'express';
import * as service from './categories.service';
import { ok, created } from '../../utils/response';
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
