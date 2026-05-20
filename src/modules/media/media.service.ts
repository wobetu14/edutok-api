import { MediaResourceType, Role } from '@prisma/client';
import { UploadApiResponse } from 'cloudinary';
import { cloudinary } from '../../config/cloudinary';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';
import { PRIVILEGED_TYPES, PRIVILEGED_ROLES } from './media.schema';

// ── Cloudinary folders ────────────────────────────────────────────────────────

const FOLDER: Record<MediaResourceType, string> = {
  avatar:           'edutok/avatars',
  course_thumbnail: 'edutok/course_thumbnails',
  lesson_image:     'edutok/lesson_images',
  org_logo:         'edutok/org_logos',
};

// ── Upload helper ─────────────────────────────────────────────────────────────

function streamUpload(
  buffer:       Buffer,
  folder:       string,
  resourceType: MediaResourceType,
): Promise<UploadApiResponse> {
  // Build per-type transformations
  const transformation: object[] =
    resourceType === MediaResourceType.avatar
      ? [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }]
      : [{ quality: 'auto', fetch_format: 'auto' }];

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', transformation },
      (err, result) => {
        if (err || !result) reject(err ?? new Error('Cloudinary upload failed'));
        else resolve(result);
      },
    );
    stream.end(buffer);
  });
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadMedia(
  uploaderId:   string,
  uploaderRole: Role,
  resourceType: MediaResourceType,
  buffer:       Buffer,
) {
  // Learners may only upload avatars
  if (PRIVILEGED_TYPES.has(resourceType) && !PRIVILEGED_ROLES.has(uploaderRole)) {
    throw new ApiError(403, `Your account role cannot upload ${resourceType} images`);
  }

  const folder = FOLDER[resourceType];
  const result = await streamUpload(buffer, folder, resourceType);

  const record = await prisma.mediaUpload.create({
    data: {
      uploader_id:          uploaderId,
      resource_type:        resourceType,
      cloudinary_public_id: result.public_id,
      url:                  result.secure_url,
      bytes:                result.bytes,
      format:               result.format,
    },
  });

  return {
    id:         record.id,
    url:        record.url,
    public_id:  result.public_id,
    format:     record.format,
    bytes:      record.bytes,
    resource_type: record.resource_type,
  };
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteMedia(mediaId: string, requesterId: string, requesterRole: Role) {
  const record = await prisma.mediaUpload.findUnique({ where: { id: mediaId } });
  if (!record) throw new ApiError(404, 'Media record not found');

  // Owners can always delete their own uploads; admins can delete any
  const isAdmin = requesterRole === Role.super_admin || requesterRole === Role.org_admin;
  if (!isAdmin && record.uploader_id !== requesterId) {
    throw new ApiError(403, 'You can only delete your own uploads');
  }

  // Remove from Cloudinary first (best-effort — don't fail the DB delete if Cloudinary errors)
  try {
    await cloudinary.uploader.destroy(record.cloudinary_public_id, { resource_type: 'image' });
  } catch (err) {
    console.error('[Cloudinary delete failed]', record.cloudinary_public_id, err);
  }

  await prisma.mediaUpload.delete({ where: { id: mediaId } });
}

// ── Own uploads list ──────────────────────────────────────────────────────────

export async function listMyUploads(uploaderId: string) {
  return prisma.mediaUpload.findMany({
    where:   { uploader_id: uploaderId },
    orderBy: { created_at: 'desc' },
    select: {
      id:                  true,
      resource_type:       true,
      cloudinary_public_id: true,
      url:                 true,
      bytes:               true,
      format:              true,
      created_at:          true,
    },
  });
}
