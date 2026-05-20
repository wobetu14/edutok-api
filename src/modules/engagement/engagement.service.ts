import { Role, SharePlatform } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';

// ── Shared selects ────────────────────────────────────────────────────────────

const COMMENT_USER_SELECT = {
  id:         true,
  full_name:  true,
  username:   true,
  avatar_url: true,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertLessonExists(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where:  { id: lessonId },
    select: { id: true, course_id: true, likes_count: true, saves_count: true, shares_count: true },
  });
  if (!lesson) throw new ApiError(404, 'Lesson not found');
  return lesson;
}

// ── Likes ─────────────────────────────────────────────────────────────────────

export async function likeLesson(lessonId: string, userId: string) {
  const lesson = await assertLessonExists(lessonId);

  const existing = await prisma.lessonLike.findUnique({
    where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
  });
  if (existing) throw new ApiError(409, 'Already liked');

  const [, updated] = await prisma.$transaction([
    prisma.lessonLike.create({ data: { user_id: userId, lesson_id: lessonId } }),
    prisma.lesson.update({
      where: { id: lessonId },
      data:  { likes_count: { increment: 1 } },
      select: { likes_count: true },
    }),
  ]);

  return { liked: true, likes_count: updated.likes_count };
}

export async function unlikeLesson(lessonId: string, userId: string) {
  await assertLessonExists(lessonId);

  const existing = await prisma.lessonLike.findUnique({
    where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
  });
  if (!existing) throw new ApiError(404, 'Not liked');

  const [, updated] = await prisma.$transaction([
    prisma.lessonLike.delete({
      where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
    }),
    prisma.lesson.update({
      where: { id: lessonId },
      data:  { likes_count: { decrement: 1 } },
      select: { likes_count: true },
    }),
  ]);

  return { liked: false, likes_count: Math.max(0, updated.likes_count) };
}

// ── Saves / favorites ─────────────────────────────────────────────────────────

export async function saveLesson(lessonId: string, userId: string) {
  await assertLessonExists(lessonId);

  const existing = await prisma.lessonSave.findUnique({
    where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
  });
  if (existing) throw new ApiError(409, 'Already saved');

  const [, updated] = await prisma.$transaction([
    prisma.lessonSave.create({ data: { user_id: userId, lesson_id: lessonId } }),
    prisma.lesson.update({
      where: { id: lessonId },
      data:  { saves_count: { increment: 1 } },
      select: { saves_count: true },
    }),
  ]);

  return { saved: true, saves_count: updated.saves_count };
}

export async function unsaveLesson(lessonId: string, userId: string) {
  await assertLessonExists(lessonId);

  const existing = await prisma.lessonSave.findUnique({
    where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
  });
  if (!existing) throw new ApiError(404, 'Not saved');

  const [, updated] = await prisma.$transaction([
    prisma.lessonSave.delete({
      where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
    }),
    prisma.lesson.update({
      where: { id: lessonId },
      data:  { saves_count: { decrement: 1 } },
      select: { saves_count: true },
    }),
  ]);

  return { saved: false, saves_count: Math.max(0, updated.saves_count) };
}

// ── Shares ────────────────────────────────────────────────────────────────────

export async function shareLesson(lessonId: string, userId: string, platform: SharePlatform) {
  const lesson = await assertLessonExists(lessonId);

  const [, updated] = await prisma.$transaction([
    prisma.shareEvent.create({
      data: {
        user_id:   userId,
        lesson_id: lessonId,
        course_id: lesson.course_id,
        platform,
      },
    }),
    prisma.lesson.update({
      where: { id: lessonId },
      data:  { shares_count: { increment: 1 } },
      select: { shares_count: true },
    }),
  ]);

  return { shared: true, shares_count: updated.shares_count };
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function listComments(
  lessonId: string,
  userId:   string,
  query:    { page: number; limit: number },
) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new ApiError(404, 'Lesson not found');

  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [comments, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where:   { lesson_id: lessonId },
      skip,
      take:    limit,
      orderBy: { created_at: 'asc' },
      include: { user: { select: COMMENT_USER_SELECT } },
    }),
    prisma.comment.count({ where: { lesson_id: lessonId } }),
  ]);

  // Attach per-comment viewer state in one batch
  const commentIds = comments.map(c => c.id);
  const likedByUser = commentIds.length
    ? await prisma.commentLike.findMany({
        where:  { user_id: userId, comment_id: { in: commentIds } },
        select: { comment_id: true },
      })
    : [];
  const likedSet = new Set(likedByUser.map(l => l.comment_id));

  const enriched = comments.map(c => ({
    ...c,
    is_liked: likedSet.has(c.id),
    is_own:   c.user_id === userId,
  }));

  return { comments: enriched, total };
}

export async function postComment(
  lessonId:  string,
  userId:    string,
  body:      string,
  parent_id?: string,
) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new ApiError(404, 'Lesson not found');

  let depth = 0;

  if (parent_id) {
    const parent = await prisma.comment.findUnique({ where: { id: parent_id } });
    if (!parent) throw new ApiError(404, 'Parent comment not found');
    if (parent.lesson_id !== lessonId) throw new ApiError(400, 'Parent comment belongs to a different lesson');
    if (parent.depth >= 1) throw new ApiError(400, 'Replies can only be one level deep');
    depth = 1;
  }

  const [comment] = await prisma.$transaction([
    prisma.comment.create({
      data: { lesson_id: lessonId, user_id: userId, body, parent_id, depth },
      include: { user: { select: COMMENT_USER_SELECT } },
    }),
    prisma.lesson.update({
      where: { id: lessonId },
      data:  { comments_count: { increment: 1 } },
    }),
  ]);

  return { ...comment, is_liked: false, is_own: true };
}

export async function editComment(commentId: string, userId: string, body: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new ApiError(404, 'Comment not found');
  if (comment.user_id !== userId) throw new ApiError(403, 'You can only edit your own comments');

  return prisma.comment.update({
    where:   { id: commentId },
    data:    { body },
    include: { user: { select: COMMENT_USER_SELECT } },
  });
}

export async function deleteComment(commentId: string, userId: string, userRole: Role) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new ApiError(404, 'Comment not found');

  const isAdmin = userRole === Role.super_admin || userRole === Role.org_admin;
  if (!isAdmin && comment.user_id !== userId) {
    throw new ApiError(403, 'You can only delete your own comments');
  }

  await prisma.$transaction([
    prisma.comment.delete({ where: { id: commentId } }),
    // Decrement lesson counter; replies are kept (parent_id → null via onDelete: SetNull)
    prisma.lesson.update({
      where: { id: comment.lesson_id },
      data:  { comments_count: { decrement: 1 } },
    }),
  ]);
}

// ── Comment likes ─────────────────────────────────────────────────────────────

export async function likeComment(commentId: string, userId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new ApiError(404, 'Comment not found');

  const existing = await prisma.commentLike.findUnique({
    where: { user_id_comment_id: { user_id: userId, comment_id: commentId } },
  });
  if (existing) throw new ApiError(409, 'Already liked');

  const [, updated] = await prisma.$transaction([
    prisma.commentLike.create({ data: { user_id: userId, comment_id: commentId } }),
    prisma.comment.update({
      where: { id: commentId },
      data:  { likes_count: { increment: 1 } },
      select: { likes_count: true },
    }),
  ]);

  return { liked: true, likes_count: updated.likes_count };
}

export async function unlikeComment(commentId: string, userId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new ApiError(404, 'Comment not found');

  const existing = await prisma.commentLike.findUnique({
    where: { user_id_comment_id: { user_id: userId, comment_id: commentId } },
  });
  if (!existing) throw new ApiError(404, 'Not liked');

  const [, updated] = await prisma.$transaction([
    prisma.commentLike.delete({
      where: { user_id_comment_id: { user_id: userId, comment_id: commentId } },
    }),
    prisma.comment.update({
      where: { id: commentId },
      data:  { likes_count: { decrement: 1 } },
      select: { likes_count: true },
    }),
  ]);

  return { liked: false, likes_count: Math.max(0, updated.likes_count) };
}

// ── Viewer status batch query (used by ForYou feed) ───────────────────────────

export async function getLessonEngagementStatus(lessonIds: string[], userId: string) {
  if (lessonIds.length === 0) return {};

  const [likes, saves] = await prisma.$transaction([
    prisma.lessonLike.findMany({
      where:  { user_id: userId, lesson_id: { in: lessonIds } },
      select: { lesson_id: true },
    }),
    prisma.lessonSave.findMany({
      where:  { user_id: userId, lesson_id: { in: lessonIds } },
      select: { lesson_id: true },
    }),
  ]);

  const likedSet = new Set(likes.map(l => l.lesson_id));
  const savedSet = new Set(saves.map(s => s.lesson_id));

  return Object.fromEntries(
    lessonIds.map(id => [id, { liked: likedSet.has(id), saved: savedSet.has(id) }]),
  );
}
