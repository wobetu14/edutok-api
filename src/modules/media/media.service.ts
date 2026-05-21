import { MediaResourceType, Role } from '@prisma/client';
import { UploadApiResponse } from 'cloudinary';
import { cloudinary } from '../../config/cloudinary';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';
import { PRIVILEGED_TYPES, PRIVILEGED_ROLES } from './media.schema';

type CloudinaryResourceType = 'image' | 'video' | 'raw';

// ── Per-type configuration ────────────────────────────────────────────────────

const FOLDER: Record<MediaResourceType, string> = {
  avatar:           'edutok/avatars',
  course_thumbnail: 'edutok/course_thumbnails',
  lesson_image:     'edutok/lesson_images',
  org_logo:         'edutok/org_logos',
  lesson_video:     'edutok/lesson_videos',
  lesson_pdf:       'edutok/lesson_pdfs',
};

// Cloudinary resource_type for each of our types
const CLOUDINARY_TYPE: Record<MediaResourceType, CloudinaryResourceType> = {
  avatar:           'image',
  course_thumbnail: 'image',
  lesson_image:     'image',
  org_logo:         'image',
  lesson_video:     'video',
  lesson_pdf:       'raw',   // PDFs stored as-is; downloadable directly from Cloudinary URL
};

// Accepted MIME types per resource type
const ALLOWED_MIMETYPES: Record<MediaResourceType, string[]> = {
  avatar:           ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  course_thumbnail: ['image/jpeg', 'image/png', 'image/webp'],
  lesson_image:     ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  org_logo:         ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  lesson_video:     ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
  lesson_pdf:       ['application/pdf'],
};

// Per-type file size limits
const MAX_BYTES: Record<MediaResourceType, number> = {
  avatar:           5   * 1024 * 1024,  // 5 MB
  course_thumbnail: 10  * 1024 * 1024,  // 10 MB
  lesson_image:     10  * 1024 * 1024,  // 10 MB
  org_logo:         5   * 1024 * 1024,  // 5 MB
  lesson_video:     500 * 1024 * 1024,  // 500 MB
  lesson_pdf:       50  * 1024 * 1024,  // 50 MB
};

// ── Upload helper ─────────────────────────────────────────────────────────────

function streamUpload(
  buffer:       Buffer,
  folder:       string,
  resourceType: MediaResourceType,
  mimetype:     string,
): Promise<UploadApiResponse> {
  const cloudinaryType = CLOUDINARY_TYPE[resourceType];

  const options: Record<string, any> = { folder, resource_type: cloudinaryType };

  if (cloudinaryType === 'image') {
    options.transformation =
      resourceType === MediaResourceType.avatar
        ? [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }]
        : [{ quality: 'auto', fetch_format: 'auto' }];
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
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
  mimetype:     string,
) {
  // Learners may only upload avatars
  if (PRIVILEGED_TYPES.has(resourceType) && !PRIVILEGED_ROLES.has(uploaderRole)) {
    throw new ApiError(403, `Your account role cannot upload ${resourceType} files`);
  }

  // Validate MIME type matches the declared resource type
  if (!ALLOWED_MIMETYPES[resourceType].includes(mimetype)) {
    throw new ApiError(400, `Invalid file type "${mimetype}" for resource_type "${resourceType}"`);
  }

  // Enforce per-type size limit (multer ceiling is 500 MB; this applies tighter limits)
  if (buffer.length > MAX_BYTES[resourceType]) {
    const limitMB = MAX_BYTES[resourceType] / (1024 * 1024);
    throw new ApiError(413, `File exceeds the ${limitMB} MB limit for ${resourceType}`);
  }

  const folder = FOLDER[resourceType];
  const result = await streamUpload(buffer, folder, resourceType, mimetype);

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
    const cloudinaryType = CLOUDINARY_TYPE[record.resource_type] ?? 'image';
    await cloudinary.uploader.destroy(record.cloudinary_public_id, { resource_type: cloudinaryType });
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
