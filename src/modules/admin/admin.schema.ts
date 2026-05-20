import { z } from 'zod';
import { CourseStatus, ReportStatus } from '@prisma/client';

export const listUsersQuerySchema = z.object({
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  role:   z.enum(['super_admin', 'org_admin', 'instructor', 'learner']).optional(),
});

export const listPendingCoursesQuerySchema = z.object({
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const reviewCourseBodySchema = z.object({
  status: z.enum([CourseStatus.approved, CourseStatus.rejected]),
  notes:  z.string().max(2000).optional(),
});

export const listReportsQuerySchema = z.object({
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(100).default(20),
  status: z.nativeEnum(ReportStatus).optional(),
});

export const resolveReportBodySchema = z.object({
  status: z.enum([ReportStatus.reviewed, ReportStatus.dismissed]),
});

export const listAuditLogsQuerySchema = z.object({
  page:        z.coerce.number().min(1).default(1),
  limit:       z.coerce.number().min(1).max(100).default(50),
  actor_id:    z.string().cuid().optional(),
  target_type: z.string().max(50).optional(),
});

export const createAnnouncementBodySchema = z.object({
  title:      z.string().min(1).max(200).trim(),
  body:       z.string().min(1).max(5000).trim(),
  expires_at: z.coerce.date().optional(),
});
