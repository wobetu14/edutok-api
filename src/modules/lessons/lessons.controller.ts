import { Request, Response, NextFunction } from 'express';
import * as service from './lessons.service';
import { ok, created, noContent } from '../../utils/response';

// GET /api/lessons/:id
export async function getLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getLesson(req.params.id, req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// POST /api/lessons/:id/complete
export async function completeLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.completeLesson(req.params.id, req.user!.id);
    ok(res, data, 'Lesson completed');
  } catch (e) { next(e); }
}

// GET /api/lessons/:id/progress
export async function getVideoProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getVideoProgress(req.params.id, req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// PATCH /api/lessons/:id/progress
export async function updateVideoProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateVideoProgress(req.params.id, req.user!.id, req.body);
    ok(res, data);
  } catch (e) { next(e); }
}

// POST /api/lessons
export async function createLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createLesson(req.user!.id, req.user!.role as any, req.body);
    created(res, data, 'Lesson created');
  } catch (e) { next(e); }
}

// PATCH /api/lessons/:id
export async function updateLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateLesson(
      req.params.id, req.user!.id, req.user!.role as any, req.body,
    );
    ok(res, data, 'Lesson updated');
  } catch (e) { next(e); }
}

// DELETE /api/lessons/:id
export async function deleteLesson(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteLesson(req.params.id, req.user!.id, req.user!.role as any);
    noContent(res);
  } catch (e) { next(e); }
}

// PATCH /api/lessons/reorder
export async function reorderLessons(req: Request, res: Response, next: NextFunction) {
  try {
    const { course_id, items } = req.body;
    const data = await service.reorderLessons(req.user!.id, req.user!.role as any, course_id, items);
    ok(res, data, 'Lessons reordered');
  } catch (e) { next(e); }
}
