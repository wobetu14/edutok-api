import { Request, Response, NextFunction } from 'express';
import * as service from './quizzes.service';
import { ok, created, noContent } from '../../utils/response';

// GET /api/quizzes/lesson/:lessonId
export async function getQuizByLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getQuizByLesson(req.params.lessonId, req.user!.id, req.user!.role as any);
    ok(res, data);
  } catch (e) { next(e); }
}

// POST /api/quizzes/:id/submit
export async function submitQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.submitQuiz(req.params.id, req.user!.id, req.body.answers);
    ok(res, data, data.passed ? 'Quiz passed!' : 'Quiz failed — try again');
  } catch (e) { next(e); }
}

// POST /api/quizzes
export async function createQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createQuiz(req.user!.id, req.user!.role as any, req.body);
    created(res, data, 'Quiz created');
  } catch (e) { next(e); }
}

// PATCH /api/quizzes/:id
export async function updateQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateQuiz(req.params.id, req.user!.id, req.user!.role as any, req.body);
    ok(res, data, 'Quiz updated');
  } catch (e) { next(e); }
}

// DELETE /api/quizzes/:id
export async function deleteQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteQuiz(req.params.id, req.user!.id, req.user!.role as any);
    noContent(res);
  } catch (e) { next(e); }
}
