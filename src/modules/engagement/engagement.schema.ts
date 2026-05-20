import { z } from 'zod';
import { SharePlatform } from '@prisma/client';

export const postCommentSchema = z.object({
  body:      z.string().min(1).max(1000).trim(),
  parent_id: z.string().cuid().optional(),
});

export const editCommentSchema = z.object({
  body: z.string().min(1).max(1000).trim(),
});

export const shareSchema = z.object({
  platform: z.nativeEnum(SharePlatform),
});

export const listCommentsQuerySchema = z.object({
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(30),
});
