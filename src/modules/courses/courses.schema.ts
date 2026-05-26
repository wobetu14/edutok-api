import { z } from 'zod';
import { Difficulty, CourseVisibility, CourseStatus } from '@prisma/client';

export const createCourseSchema = z.object({
  org_id:        z.string().cuid(),
  title:         z.string().min(3).max(150).trim(),
  category_ids:  z.array(z.string()).min(1, 'At least one category is required').max(10),
  description:   z.string().max(2000).trim().optional(),
  thumbnail_url: z.string().url().optional(),
  tags:          z.array(z.string().max(50)).max(10).optional(),
  difficulty:    z.nativeEnum(Difficulty).optional(),
  visibility:    z.nativeEnum(CourseVisibility).optional(),
  // Org admins may assign a different instructor; defaults to caller
  instructor_id: z.string().cuid().optional(),
});

export const updateCourseSchema = z.object({
  title:         z.string().min(3).max(150).trim().optional(),
  category_ids:  z.array(z.string()).min(1).max(10).optional(),
  description:   z.string().max(2000).trim().optional(),
  thumbnail_url: z.string().url().optional(),
  tags:          z.array(z.string().max(50)).max(10).optional(),
  difficulty:    z.nativeEnum(Difficulty).optional(),
  visibility:    z.nativeEnum(CourseVisibility).optional(),
});

export const approveSchema = z.object({
  action:           z.enum(['approve', 'reject']),
  rejection_reason: z.string().max(1000).optional(),
}).refine(
  (d) => d.action !== 'reject' || !!d.rejection_reason,
  { message: 'rejection_reason is required when rejecting', path: ['rejection_reason'] },
);

export const listCoursesQuerySchema = z.object({
  page:       z.coerce.number().min(1).default(1),
  limit:      z.coerce.number().min(1).max(100).default(20),
  q:          z.string().max(100).optional(),
  category:   z.string().max(50).optional(),
  difficulty: z.nativeEnum(Difficulty).optional(),
});

export const listStudentsQuerySchema = z.object({
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const listMyCoursesQuerySchema = z.object({
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(100).default(20),
  status: z.nativeEnum(CourseStatus).optional(),
  org_id: z.string().cuid().optional(),
});
