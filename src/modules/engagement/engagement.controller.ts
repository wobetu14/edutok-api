import { Request, Response, NextFunction } from 'express';
import * as service from './engagement.service';
import { ok, noContent, paginated } from '../../utils/response';

// ── Likes ─────────────────────────────────────────────────────────────────────

// POST /api/engagement/lessons/:lessonId/like
export async function likeLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.likeLesson(req.params.lessonId, req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// DELETE /api/engagement/lessons/:lessonId/like
export async function unlikeLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.unlikeLesson(req.params.lessonId, req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// ── Saves ─────────────────────────────────────────────────────────────────────

// POST /api/engagement/lessons/:lessonId/save
export async function saveLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.saveLesson(req.params.lessonId, req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// DELETE /api/engagement/lessons/:lessonId/save
export async function unsaveLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.unsaveLesson(req.params.lessonId, req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// ── Shares ────────────────────────────────────────────────────────────────────

// POST /api/engagement/lessons/:lessonId/share
export async function shareLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.shareLesson(req.params.lessonId, req.user!.id, req.body.platform);
    ok(res, data);
  } catch (e) { next(e); }
}

// ── Comments ──────────────────────────────────────────────────────────────────

// GET /api/engagement/lessons/:lessonId/comments
export async function listComments(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as any;
    const { comments, total } = await service.listComments(
      req.params.lessonId,
      req.user!.id,
      { page, limit },
    );
    paginated(res, comments, total, page, limit);
  } catch (e) { next(e); }
}

// POST /api/engagement/lessons/:lessonId/comments
export async function postComment(req: Request, res: Response, next: NextFunction) {
  try {
    const { body, parent_id } = req.body;
    const data = await service.postComment(req.params.lessonId, req.user!.id, body, parent_id);
    ok(res, data, 'Comment posted');
  } catch (e) { next(e); }
}

// PATCH /api/engagement/comments/:id
export async function editComment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.editComment(req.params.id, req.user!.id, req.body.body);
    ok(res, data, 'Comment updated');
  } catch (e) { next(e); }
}

// DELETE /api/engagement/comments/:id
export async function deleteComment(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteComment(req.params.id, req.user!.id, req.user!.role as any);
    noContent(res);
  } catch (e) { next(e); }
}

// ── Comment likes ─────────────────────────────────────────────────────────────

// POST /api/engagement/comments/:id/like
export async function likeComment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.likeComment(req.params.id, req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// DELETE /api/engagement/comments/:id/like
export async function unlikeComment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.unlikeComment(req.params.id, req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}
