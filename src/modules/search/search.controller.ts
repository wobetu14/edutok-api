import { Request, Response, NextFunction } from 'express';
import * as service from './search.service';
import { ok, noContent } from '../../utils/response';

// GET /api/search
export async function search(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, type, category, page, limit } = req.query as any;
    const data = await service.search(req.user!.id, { q, type, category, page, limit });
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/search/categories  (public)
export async function getCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getCategories();
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/search/history
export async function getHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Number(req.query.limit) || 20;
    const data  = await service.getHistory(req.user!.id, limit);
    ok(res, data);
  } catch (e) { next(e); }
}

// DELETE /api/search/history
export async function clearHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.clearHistory(req.user!.id);
    ok(res, data, 'Search history cleared');
  } catch (e) { next(e); }
}
