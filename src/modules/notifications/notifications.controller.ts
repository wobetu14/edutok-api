import { Request, Response, NextFunction } from 'express';
import * as service from './notifications.service';
import { ok, noContent, paginated } from '../../utils/response';

// GET /api/notifications/me
export async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = req.query as any;
    const { notifications, total, unread_count } = await service.listNotifications(
      req.user!.id,
      { page, limit },
    );
    // Include unread_count in meta by building the response manually
    res.status(200).json({
      success: true,
      data:    notifications,
      meta:    {
        total,
        page,
        limit,
        totalPages:   Math.ceil(total / limit),
        unread_count,
      },
    });
  } catch (e) { next(e); }
}

// PATCH /api/notifications/me/:id/read
export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.markRead(req.params.id, req.user!.id);
    ok(res, data, 'Notification marked as read');
  } catch (e) { next(e); }
}

// PATCH /api/notifications/me/read-all
export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.markAllRead(req.user!.id);
    ok(res, data, 'All notifications marked as read');
  } catch (e) { next(e); }
}

// POST /api/notifications/device-token
export async function registerDeviceToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, platform } = req.body;
    const data = await service.registerDeviceToken(req.user!.id, token, platform);
    ok(res, data, 'Device token registered');
  } catch (e) { next(e); }
}

// DELETE /api/notifications/device-token?platform=ios|android
export async function deregisterDeviceToken(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deregisterDeviceToken(req.user!.id, (req.query as any).platform);
    noContent(res);
  } catch (e) { next(e); }
}
