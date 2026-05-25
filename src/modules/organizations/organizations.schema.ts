import { z } from 'zod';
import { OrgRole } from '@prisma/client';

export const createOrgSchema = z.object({
  name:        z.string().min(2).max(100).trim(),
  description: z.string().max(1000).trim().optional(),
  logo_url:    z.string().url().optional(),
  website:     z.string().url().optional(),
});

export const updateOrgSchema = z.object({
  name:        z.string().min(2).max(100).trim().optional(),
  description: z.string().max(1000).trim().optional(),
  logo_url:    z.string().url().optional().nullable(),
  website:     z.string().url().optional().nullable(),
});

export const setOrgActiveSchema = z.object({
  is_active:        z.boolean(),
  suspended_reason: z.string().max(500).optional(),
});

export const applyOrgSchema = z.object({
  org_name:      z.string().min(2).max(100).trim(),
  contact_name:  z.string().min(2).max(100).trim(),
  contact_email: z.string().email(),
  contact_phone: z.string().max(30).optional(),
  website:       z.string().url().optional(),
  description:   z.string().max(2000).trim().optional(),
});

export const reviewApplicationSchema = z.object({
  action:       z.enum(['approved', 'rejected']),
  reject_reason: z.string().min(5).max(500).optional(),
}).refine(
  (d) => d.action !== 'rejected' || (d.reject_reason && d.reject_reason.length >= 5),
  { message: 'Rejection reason is required', path: ['reject_reason'] },
);

export const addMemberSchema = z.object({
  user_id: z.string().cuid(),
  role:    z.nativeEnum(OrgRole),
});

export const updateMemberSchema = z.object({
  role: z.nativeEnum(OrgRole),
});

export const listOrgsQuerySchema = z.object({
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
});

export const listApplicationsQuerySchema = z.object({
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export const listCoursesQuerySchema = z.object({
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
