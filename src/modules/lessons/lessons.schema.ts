import { z } from 'zod';
import { LessonType } from '@prisma/client';

// ── Content shapes per type ───────────────────────────────────────────────────

const textContent    = z.object({ body: z.string().min(1) });
const imageContent   = z.array(
  z.object({ uri: z.string().url(), caption: z.string().max(300).optional() }),
).min(1).max(20);
// Supports YouTube embeds ({ youtubeId }) and direct Cloudinary uploads ({ url })
const videoContent   = z.union([
  z.object({ youtubeId: z.string().length(11) }),
  z.object({ url: z.string().url() }),
]);

// ── Lesson CRUD ───────────────────────────────────────────────────────────────

export const createLessonSchema = z.discriminatedUnion('type', [
  z.object({
    course_id:     z.string().cuid(),
    type:          z.literal(LessonType.text),
    title:         z.string().min(1).max(200).trim(),
    content_json:  textContent,
    order_index:   z.number().int().min(0).optional(),
    duration_secs: z.number().int().min(0).optional(),
    thumbnail_url: z.string().url().optional(),
  }),
  z.object({
    course_id:     z.string().cuid(),
    type:          z.literal(LessonType.image),
    title:         z.string().min(1).max(200).trim(),
    content_json:  imageContent,
    order_index:   z.number().int().min(0).optional(),
    duration_secs: z.number().int().min(0).optional(),
    thumbnail_url: z.string().url().optional(),
  }),
  z.object({
    course_id:     z.string().cuid(),
    type:          z.literal(LessonType.video),
    title:         z.string().min(1).max(200).trim(),
    content_json:  videoContent,
    order_index:   z.number().int().min(0).optional(),
    duration_secs: z.number().int().min(0).optional(),
    thumbnail_url: z.string().url().optional(),
  }),
]);

export const updateLessonSchema = z.object({
  title:         z.string().min(1).max(200).trim().optional(),
  content_json:  z.unknown().optional(),   // type cannot change; client ensures shape matches
  duration_secs: z.number().int().min(0).optional(),
  thumbnail_url: z.string().url().optional(),
});

export const reorderSchema = z.object({
  course_id: z.string().cuid(),
  items:     z.array(
    z.object({
      id:          z.string().cuid(),
      order_index: z.number().int().min(0),
    }),
  ).min(1),
});

// ── Video progress ────────────────────────────────────────────────────────────

export const updateProgressSchema = z.object({
  watched_seconds:    z.number().int().min(0),
  total_seconds:      z.number().int().min(1),
  last_position_secs: z.number().int().min(0),
});
