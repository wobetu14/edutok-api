import { z } from 'zod';

export const searchQuerySchema = z.object({
  q:        z.string().min(1).max(200).trim(),
  type:     z.enum(['all', 'courses', 'orgs', 'lessons']).default('all'),
  category: z.string().max(50).optional(),
  page:     z.coerce.number().min(1).default(1),
  limit:    z.coerce.number().min(1).max(50).default(20),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(20),
});
