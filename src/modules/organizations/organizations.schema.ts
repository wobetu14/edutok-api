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
  logo_url:    z.string().url().optional(),
  website:     z.string().url().optional(),
});

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

export const listCoursesQuerySchema = z.object({
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
