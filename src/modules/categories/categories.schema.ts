import { z } from 'zod';

export const createCategorySchema = z.object({
  id:    z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'ID must be lowercase, alphanumeric, hyphens or underscores'),
  label: z.string().min(1).max(50).trim(),
  icon:  z.string().min(1).max(50).trim(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g. #FF6B35)'),
});

export const updateCategorySchema = z.object({
  label: z.string().min(1).max(50).trim().optional(),
  icon:  z.string().min(1).max(50).trim().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g. #FF6B35)').optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });
