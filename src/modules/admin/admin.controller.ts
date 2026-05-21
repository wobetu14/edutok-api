import { Request, Response, NextFunction } from 'express';
import * as service from './admin.service';
import { ok, created, noContent } from '../../utils/response';

// GET /api/admin/stats
export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getPlatformStats();
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/admin/users
export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search, role } = req.query as any;
    const data = await service.listUsers({ page, limit, search, role });
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/admin/courses/pending
export async function listPendingCourses(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as any;
    const data = await service.listPendingCourses(page, limit, req.user!.id, req.user!.role as any);
    ok(res, data);
  } catch (e) { next(e); }
}

// PATCH /api/admin/courses/:id/review
export async function reviewCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, notes } = req.body;
    const ctx = {
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    };
    const data = await service.reviewCourse(
      req.params.id, req.user!.id, req.user!.role as any, status, notes, ctx,
    );
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/admin/org-stats
export async function getOrgStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { org_id } = req.query as any;
    const data = await service.getOrgStats(org_id, req.user!.id, req.user!.role as any);
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/admin/reports
export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status } = req.query as any;
    const data = await service.listReports({ page, limit, status });
    ok(res, data);
  } catch (e) { next(e); }
}

// PATCH /api/admin/reports/:id
export async function resolveReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.body;
    const data = await service.resolveReport(req.params.id, req.user!.id, status);
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/admin/audit-logs
export async function listAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, actor_id, target_type } = req.query as any;
    const data = await service.listAuditLogs({ page, limit, actor_id, target_type });
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/admin/announcements
export async function listAnnouncements(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listAnnouncements(req.user!.role);
    ok(res, data);
  } catch (e) { next(e); }
}

// POST /api/admin/announcements
export async function createAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, body, target_role, expires_at } = req.body;
    const data = await service.createAnnouncement(req.user!.id, title, body, target_role, expires_at);
    created(res, data);
  } catch (e) { next(e); }
}

// DELETE /api/admin/announcements/:id
export async function deleteAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteAnnouncement(req.params.id, req.user!.id);
    noContent(res);
  } catch (e) { next(e); }
}
