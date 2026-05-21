import { z } from 'zod';
import { MediaResourceType, Role } from '@prisma/client';

export const uploadBodySchema = z.object({
  resource_type: z.nativeEnum(MediaResourceType),
});

// resource_types that require instructor-or-above (learners are limited to avatar)
export const PRIVILEGED_TYPES = new Set<MediaResourceType>([
  MediaResourceType.course_thumbnail,
  MediaResourceType.lesson_image,
  MediaResourceType.org_logo,
  MediaResourceType.lesson_video,
  MediaResourceType.lesson_pdf,
]);

export const PRIVILEGED_ROLES = new Set<string>([
  Role.super_admin,
  Role.org_admin,
  Role.instructor,
]);
