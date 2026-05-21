import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../../utils/jwt';
import * as service from './courses.service';
import { ok, created, noContent, paginated } from '../../utils/response';

// Attempts to extract the caller's identity from an optional Bearer token (no error on missing/invalid).
function optionalAuth(req: Request): { id?: string; role?: string } {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return {};
  const payload = verifyAccessToken(header.slice(7));
  if (!payload) return {};
  return { id: payload.sub, role: payload.role };
}

/** @deprecated use optionalAuth */
function optionalUserId(req: Request): string | undefined {
  return optionalAuth(req).id;
}

// GET /api/courses/mine  (instructor/org_admin/super_admin — all statuses & visibilities)
export async function listMyCourses(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status, org_id } = req.query as any;
    const { courses, total } = await service.listMyCourses(
      req.user!.id,
      req.user!.role as any,
      { page, limit, status, org_id },
    );
    paginated(res, courses, total, page, limit);
  } catch (e) { next(e); }
}

// GET /api/courses
export async function listCourses(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, q, category, difficulty } = req.query as any;
    const { courses, total } = await service.listCourses({ page, limit, q, category, difficulty });
    paginated(res, courses, total, page, limit);
  } catch (e) { next(e); }
}

// GET /api/courses/:id
export async function getCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: requesterId, role: requesterRole } = optionalAuth(req);
    const data = await service.getCourse(req.params.id, requesterId, requesterRole);
    ok(res, data);
  } catch (e) { next(e); }
}

// POST /api/courses
export async function createCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createCourse(req.user!.id, req.user!.role as any, req.body);
    created(res, data, 'Course created');
  } catch (e) { next(e); }
}

// PATCH /api/courses/:id
export async function updateCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateCourse(
      req.params.id,
      req.user!.id,
      req.user!.role as any,
      req.body,
    );
    ok(res, data, 'Course updated');
  } catch (e) { next(e); }
}

// DELETE /api/courses/:id
export async function deleteCourse(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteCourse(req.params.id, req.user!.id, req.user!.role as any);
    noContent(res);
  } catch (e) { next(e); }
}

// POST /api/courses/:id/submit
export async function submitCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.submitCourse(req.params.id, req.user!.id, req.user!.role as any);
    ok(res, data, 'Course submitted for review');
  } catch (e) { next(e); }
}

// PATCH /api/courses/:id/approve
export async function approveCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.approveCourse(
      req.params.id,
      req.user!.id,
      req.user!.role as any,
      req.body,
    );
    const msg = req.body.action === 'approve' ? 'Course approved' : 'Course rejected';
    ok(res, data, msg);
  } catch (e) { next(e); }
}

// POST /api/courses/:id/enroll
export async function enrollCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.enrollCourse(req.params.id, req.user!.id);
    ok(res, data, 'Enrolled successfully');
  } catch (e) { next(e); }
}

// DELETE /api/courses/:id/enroll
export async function unenrollCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.unenrollCourse(req.params.id, req.user!.id);
    ok(res, data, 'Unenrolled successfully');
  } catch (e) { next(e); }
}

// GET /api/courses/:id/students
export async function listStudents(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as any;
    const { enrollments, total } = await service.listStudents(
      req.params.id,
      req.user!.id,
      req.user!.role as any,
      { page, limit },
    );
    paginated(res, enrollments, total, page, limit);
  } catch (e) { next(e); }
}
