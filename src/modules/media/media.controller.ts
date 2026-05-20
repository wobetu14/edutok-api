import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../middleware/errorHandler';
import * as service from './media.service';
import { ok, created, noContent } from '../../utils/response';

// POST /api/media/upload
export async function uploadMedia(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new ApiError(400, 'No file provided — send as multipart/form-data field "file"');

    const { resource_type } = req.body;
    const data = await service.uploadMedia(
      req.user!.id,
      req.user!.role as any,
      resource_type,
      req.file.buffer,
    );
    created(res, data, 'File uploaded');
  } catch (e) { next(e); }
}

// DELETE /api/media/:id
export async function deleteMedia(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteMedia(req.params.id, req.user!.id, req.user!.role as any);
    noContent(res);
  } catch (e) { next(e); }
}

// GET /api/media/me
export async function listMyUploads(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listMyUploads(req.user!.id);
    ok(res, data);
  } catch (e) { next(e); }
}
