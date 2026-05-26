import { Request, Response, NextFunction } from 'express';
import * as service from './organizations.service';
import { ok, created, noContent, paginated } from '../../utils/response';

// GET /api/organizations
export async function listOrgs(req: Request, res: Response, next: NextFunction) {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 10;
    const { search } = req.query as any;
    const { orgs, total } = await service.listOrgs({ page, limit, search });
    paginated(res, orgs, total, page, limit);
  } catch (e) { next(e); }
}

// GET /api/organizations/:id
export async function getOrg(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getOrg(req.params.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/organizations/:id/courses
export async function getOrgCourses(req: Request, res: Response, next: NextFunction) {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 10;
    const { courses, total } = await service.getOrgCourses(req.params.id, { page, limit });
    paginated(res, courses, total, page, limit);
  } catch (e) { next(e); }
}

// POST /api/organizations
export async function createOrg(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createOrg(req.user!.id, req.body);
    created(res, data, 'Organization created');
  } catch (e) { next(e); }
}

// PATCH /api/organizations/:id
export async function updateOrg(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateOrg(
      req.params.id,
      req.user!.id,
      req.user!.role as any,
      req.body,
    );
    ok(res, data, 'Organization updated');
  } catch (e) { next(e); }
}

// DELETE /api/organizations/:id
export async function deleteOrg(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteOrg(req.params.id);
    noContent(res);
  } catch (e) { next(e); }
}

// PATCH /api/organizations/:id/active
export async function setOrgActiveStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { is_active, suspended_reason } = req.body;
    const data = await service.setOrgActiveStatus(req.params.id, is_active, suspended_reason);
    ok(res, data, is_active ? 'Organization activated' : 'Organization suspended');
  } catch (e) { next(e); }
}

// POST /api/organizations/apply
export async function applyOrg(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.applyOrg(req.body);
    created(res, data, 'Application submitted');
  } catch (e) { next(e); }
}

// GET /api/organizations/applications
export async function listApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 10;
    const { status } = req.query as any;
    const { applications, total } = await service.listApplications({ page, limit, status });
    paginated(res, applications, total, page, limit);
  } catch (e) { next(e); }
}

// PATCH /api/organizations/applications/:appId/review
export async function reviewApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const { action, reject_reason } = req.body;
    const data = await service.reviewApplication(
      req.params.appId,
      action,
      reject_reason,
      req.user!.id,
    );
    ok(res, data, `Application ${action}`);
  } catch (e) { next(e); }
}

// GET /api/organizations/:id/members
export async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listMembers(req.params.id, req.user!.id, req.user!.role as any);
    ok(res, data);
  } catch (e) { next(e); }
}

// POST /api/organizations/:id/members
export async function addMember(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.addMember(
      req.params.id,
      req.user!.id,
      req.user!.role as any,
      req.body,
    );
    created(res, data, 'Member added');
  } catch (e) { next(e); }
}

// PATCH /api/organizations/:id/members/:userId
export async function updateMember(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateMember(
      req.params.id,
      req.user!.id,
      req.user!.role as any,
      req.params.userId,
      req.body.role,
    );
    ok(res, data, 'Member role updated');
  } catch (e) { next(e); }
}

// DELETE /api/organizations/:id/members/:userId
export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    await service.removeMember(
      req.params.id,
      req.user!.id,
      req.user!.role as any,
      req.params.userId,
    );
    noContent(res);
  } catch (e) { next(e); }
}
