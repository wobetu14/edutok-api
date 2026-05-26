import { Request, Response, NextFunction } from 'express';
import * as service from './users.service';
import { ok, noContent, paginated } from '../../utils/response';

// GET /api/users/me
export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getMe(req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// PATCH /api/users/me
export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateMe(req.user!.id, req.body);
    ok(res, data, 'Profile updated');
  } catch (e) { next(e); }
}

// GET /api/users/me/settings
export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getSettings(req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// PATCH /api/users/me/settings
export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateSettings(req.user!.id, req.body);
    ok(res, data, 'Settings updated');
  } catch (e) { next(e); }
}

// GET /api/users/me/preferences
export async function getPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getPreferences(req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// PATCH /api/users/me/preferences
export async function updatePreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updatePreferences(req.user!.id, req.body);
    ok(res, data, 'Preferences updated');
  } catch (e) { next(e); }
}

// PATCH /api/users/me/2fa
export async function update2fa(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.update2fa(req.user!.id, req.body);
    ok(res, data, `2FA ${req.body.enabled ? 'enabled' : 'disabled'}`);
  } catch (e) { next(e); }
}

// GET /api/users/:id  (public profile)
export async function getPublicProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getPublicProfile(req.params.id, req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// POST /api/users/:id/follow
export async function followInstructor(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.followInstructor(req.user!.id, req.params.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// DELETE /api/users/:id/follow
export async function unfollowInstructor(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.unfollowInstructor(req.user!.id, req.params.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/users/:id/follow
export async function checkFollow(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.checkFollow(req.user!.id, req.params.id);
    ok(res, data);
  } catch (e) { next(e); }
}

// POST /api/users/managed  (org_admin creates instructor; super_admin creates org_admin)
export async function createManagedUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createManagedUser(req.user!.id, req.user!.role as any, req.body);
    ok(res, data, 'Account created. Share the temporary password with the user — it will not be shown again.');
  } catch (e) { next(e); }
}

// PATCH /api/users/:id/active  (org_admin deactivates instructor; super_admin any user)
export async function setActiveStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.setActiveStatus(
      req.params.id,
      req.body.is_active,
      req.user!.id,
      req.user!.role as any,
    );
    ok(res, data, req.body.is_active ? 'Account activated' : 'Account deactivated');
  } catch (e) { next(e); }
}

// PATCH /api/users/me/password  (change own password)
export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.changePassword(
      req.user!.id,
      req.body.currentPassword,
      req.body.newPassword,
    );
    ok(res, data);
  } catch (e) { next(e); }
}

// GET /api/users  (super_admin or org_admin)
export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 10;
    const { role, search } = req.query as any;
    const { users, total } = await service.listUsers({
      page,
      limit,
      role,
      search,
      requesterId:   req.user!.id,
      requesterRole: req.user!.role as any,
    });
    paginated(res, users, total, page, limit);
  } catch (e) { next(e); }
}

// PATCH /api/users/:id  (edit managed user — super_admin edits org_admin; org_admin edits instructor)
export async function updateManagedUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateManagedUser(
      req.params.id,
      req.body,
      req.user!.id,
      req.user!.role as any,
    );
    ok(res, data, 'User updated');
  } catch (e) { next(e); }
}

// POST /api/users/:id/reset-password  (admin resets managed user's password)
export async function adminResetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.adminResetPassword(
      req.params.id,
      req.user!.id,
      req.user!.role as any,
    );
    ok(res, data, 'Password reset. Share the temporary password securely — it will not be shown again.');
  } catch (e) { next(e); }
}

// PATCH /api/users/:id/reassign-org  (super_admin only)
export async function reassignOrg(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.reassignOrg(req.params.id, req.body.org_id, req.user!.id);
    ok(res, data, 'Organization reassigned');
  } catch (e) { next(e); }
}

// PATCH /api/users/:id/role  (admin)
export async function changeRole(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.changeRole(req.params.id, req.body.role, req.user!.id);
    ok(res, data, 'Role updated');
  } catch (e) { next(e); }
}

// DELETE /api/users/:id  (admin)
export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteUser(req.params.id, req.user!.id);
    noContent(res);
  } catch (e) { next(e); }
}
