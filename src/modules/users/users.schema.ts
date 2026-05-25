import { z } from 'zod';
import { Role, FontScale } from '@prisma/client';

export const updateMeSchema = z.object({
  full_name:  z.string().min(2).max(100).trim().optional(),
  bio:        z.string().max(500).trim().optional(),
  avatar_url: z.string().url().optional(),
  lang_pref:  z.enum(['en', 'am']).optional(),
  expertise:  z.array(z.string().max(50)).max(10).optional(),
  // Email: only allowed for non-learners — enforced in service, not here
  email:      z.string().email().optional(),
  phone:      z.string().min(7).max(20).optional(),
});

export const updateSettingsSchema = z.object({
  font_scale:            z.nativeEnum(FontScale).optional(),
  high_contrast:         z.boolean().optional(),
  notifications_enabled: z.boolean().optional(),
  daily_reminder_time:   z.string().regex(/^\d{2}:\d{2}$/, 'Format must be HH:MM').optional(),
});

export const updatePreferencesSchema = z.object({
  preferred_categories: z.array(z.string()).optional(),
  onboarding_completed: z.boolean().optional(),
});

export const update2faSchema = z.object({
  enabled: z.boolean(),
  method:  z.enum(['phone', 'email']).optional(),
}).refine(
  (d) => !d.enabled || d.method !== undefined,
  { message: 'method (phone or email) is required when enabling 2FA', path: ['method'] },
);

export const changeRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

export const listUsersQuerySchema = z.object({
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(100).default(20),
  role:   z.nativeEnum(Role).optional(),
  search: z.string().max(100).optional(),
});

export const createManagedUserSchema = z.object({
  full_name: z.string().min(2).max(100).trim(),
  username:  z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Alphanumeric and underscore only'),
  phone:     z.string().min(7).max(20),
  email:     z.string().email(),
  role:      z.enum(['org_admin', 'instructor']),
  org_id:    z.string().cuid().optional(),
});

export const setActiveSchema = z.object({
  is_active: z.boolean(),
});

export const updateManagedUserSchema = z.object({
  full_name: z.string().min(2).max(100).trim().optional(),
  phone:     z.string().min(7).max(20).optional(),
  email:     z.string().email().optional(),
});

export const reassignOrgSchema = z.object({
  org_id: z.string().cuid('Invalid organization ID'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8, 'New password must be at least 8 characters'),
});
