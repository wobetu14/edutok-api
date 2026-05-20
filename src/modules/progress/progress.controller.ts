import { Request, Response, NextFunction } from 'express';
import * as service from './progress.service';
import { ok, paginated } from '../../utils/response';

// GET /api/progress/me/streak
export async function getStreak(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getStreak(req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/progress/me/badges
export async function getBadges(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getBadges(req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/progress/me/certificates
export async function listCertificates(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listCertificates(req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/progress/me/certificates/:id
export async function getCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getCertificate(req.params.id, req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/progress/verify/:certNumber  (public)
export async function verifyCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.verifyCertificate(req.params.certNumber);
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/progress/me/completions
export async function getCompletions(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as any;
    const { completions, total } = await service.getCompletions(req.user!.id, { page, limit });
    paginated(res, completions, total, page, limit);
  } catch (e) { next(e); }
}

// GET /api/progress/me/quiz-history
export async function getQuizHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as any;
    const { passes, total } = await service.getQuizHistory(req.user!.id, { page, limit });
    paginated(res, passes, total, page, limit);
  } catch (e) { next(e); }
}

// GET /api/progress/me/saves
export async function getSaves(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as any;
    const { saves, total } = await service.getSaves(req.user!.id, { page, limit });
    paginated(res, saves, total, page, limit);
  } catch (e) { next(e); }
}

// GET /api/progress/me/analytics
export async function getAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getAnalytics(req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}
