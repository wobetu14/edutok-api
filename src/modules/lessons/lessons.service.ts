import { Role, OrgRole, LessonType, NotificationType } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';
import { updateStreak, checkLessonBadges } from '../../utils/gamification';
import { sendPush } from '../notifications/notifications.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

type LessonWithCourse = {
  id: string;
  course_id: string;
  course: { org_id: string; instructor_id: string };
};

async function findLessonWithCourse(lessonId: string): Promise<LessonWithCourse> {
  const lesson = await prisma.lesson.findUnique({
    where:   { id: lessonId },
    include: { course: { select: { org_id: true, instructor_id: true } } },
  });
  if (!lesson) throw new ApiError(404, 'Lesson not found');
  return lesson as any;
}

async function assertEditAccess(lesson: LessonWithCourse, userId: string, userRole: Role) {
  if (userRole === Role.super_admin) return;

  if (userRole === Role.org_admin) {
    const m = await prisma.orgMember.findUnique({
      where: { user_id_org_id: { user_id: userId, org_id: lesson.course.org_id } },
    });
    if (m) return;
  }

  if (lesson.course.instructor_id === userId) return;

  throw new ApiError(403, 'You do not have permission to modify this lesson');
}

// ── Learner endpoints ─────────────────────────────────────────────────────────

export async function getLesson(lessonId: string, userId: string) {
  const lesson = await prisma.lesson.findUnique({
    where:   { id: lessonId },
    include: { quiz: true },
  });
  if (!lesson) throw new ApiError(404, 'Lesson not found');

  // Track whether the user has completed this lesson
  const completion = await prisma.lessonCompletion.findUnique({
    where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
  });

  // Strip correct answers from quiz before returning
  let quiz = null;
  if (lesson.quiz) {
    quiz = sanitizeQuizForClient(lesson.quiz);
  }

  return { ...lesson, quiz, is_completed: !!completion };
}

export async function completeLesson(lessonId: string, userId: string) {
  const lesson = await prisma.lesson.findUnique({
    where:  { id: lessonId },
    select: { id: true, course_id: true, duration_secs: true },
  });
  if (!lesson) throw new ApiError(404, 'Lesson not found');

  // Upsert completion — idempotent
  const { was_new } = await prisma.$transaction(async (tx) => {
    const existing = await tx.lessonCompletion.findUnique({
      where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
    });
    if (!existing) {
      await tx.lessonCompletion.create({
        data: { user_id: userId, lesson_id: lessonId, course_id: lesson.course_id },
      });
    }
    return { was_new: !existing };
  });

  // Only update streak + badges on first completion
  if (!was_new) {
    return { completed: true, already_completed: true, newBadges: [], streak: null };
  }

  const { currentStreak, milestone } = await updateStreak(userId, lesson.duration_secs);
  const newBadges = await checkLessonBadges(userId, lesson.course_id, currentStreak);

  // Fire-and-forget push notifications — never block the completion response
  sendPush(userId, NotificationType.lesson_complete, 'Lesson Complete!', 'Keep up the great work!', { lessonId }).catch(() => {});
  if (newBadges.length > 0) {
    sendPush(userId, NotificationType.badge_earned, 'Badge Earned!', `You earned: ${newBadges.join(', ')}`, { badges: newBadges }).catch(() => {});
  }

  return {
    completed:        true,
    already_completed: false,
    streak:           { current: currentStreak, milestone },
    newBadges,
  };
}

// ── Video watch progress ──────────────────────────────────────────────────────

export async function getVideoProgress(lessonId: string, userId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new ApiError(404, 'Lesson not found');
  if (lesson.type !== LessonType.video) throw new ApiError(400, 'Lesson is not a video lesson');

  return prisma.videoWatchProgress.findUnique({
    where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
  });
}

export async function updateVideoProgress(
  lessonId: string,
  userId:   string,
  data:     { watched_seconds: number; total_seconds: number; last_position_secs: number },
) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new ApiError(404, 'Lesson not found');
  if (lesson.type !== LessonType.video) throw new ApiError(400, 'Lesson is not a video lesson');

  return prisma.videoWatchProgress.upsert({
    where:  { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
    update: data,
    create: { user_id: userId, lesson_id: lessonId, ...data },
  });
}

// ── Lesson CRUD ───────────────────────────────────────────────────────────────

export async function createLesson(
  userId:   string,
  userRole: Role,
  data: {
    course_id:     string;
    type:          LessonType;
    title:         string;
    content_json:  unknown;
    order_index?:  number;
    duration_secs?: number;
    thumbnail_url?: string;
  },
) {
  const course = await prisma.course.findUnique({
    where:  { id: data.course_id },
    select: { id: true, org_id: true, instructor_id: true },
  });
  if (!course) throw new ApiError(404, 'Course not found');

  // Reuse the same access guard by constructing a lesson-like object
  await assertEditAccess(
    { id: '', course_id: data.course_id, course: { org_id: course.org_id, instructor_id: course.instructor_id } },
    userId,
    userRole,
  );

  // Auto-assign order_index if not provided
  let orderIndex = data.order_index;
  if (orderIndex === undefined) {
    const last = await prisma.lesson.findFirst({
      where:   { course_id: data.course_id },
      orderBy: { order_index: 'desc' },
      select:  { order_index: true },
    });
    orderIndex = (last?.order_index ?? -1) + 1;
  }

  return prisma.lesson.create({
    data: {
      course_id:     data.course_id,
      type:          data.type,
      title:         data.title,
      content_json:  data.content_json as any,
      order_index:   orderIndex,
      duration_secs: data.duration_secs ?? 0,
      thumbnail_url: data.thumbnail_url,
    },
  });
}

export async function updateLesson(
  lessonId: string,
  userId:   string,
  userRole: Role,
  data: {
    title?:         string;
    content_json?:  unknown;
    duration_secs?: number;
    thumbnail_url?: string;
  },
) {
  const lesson = await findLessonWithCourse(lessonId);
  await assertEditAccess(lesson, userId, userRole);

  const patch: Record<string, any> = {};
  if (data.title         !== undefined) patch.title         = data.title;
  if (data.content_json  !== undefined) patch.content_json  = data.content_json;
  if (data.duration_secs !== undefined) patch.duration_secs = data.duration_secs;
  if (data.thumbnail_url !== undefined) patch.thumbnail_url = data.thumbnail_url;

  return prisma.lesson.update({ where: { id: lessonId }, data: patch });
}

export async function deleteLesson(lessonId: string, userId: string, userRole: Role) {
  const lesson = await findLessonWithCourse(lessonId);
  await assertEditAccess(lesson, userId, userRole);

  await prisma.lesson.delete({ where: { id: lessonId } });
}

// ── Reorder ───────────────────────────────────────────────────────────────────

export async function reorderLessons(
  userId:   string,
  userRole: Role,
  courseId: string,
  items:    { id: string; order_index: number }[],
) {
  // Verify all lessons belong to the stated course
  const ids = items.map(i => i.id);
  const lessons = await prisma.lesson.findMany({
    where:   { id: { in: ids } },
    select:  { id: true, course_id: true },
  });

  if (lessons.length !== ids.length) {
    throw new ApiError(400, 'One or more lesson IDs not found');
  }
  if (lessons.some(l => l.course_id !== courseId)) {
    throw new ApiError(400, 'All lessons must belong to the specified course');
  }

  // Access check on the course
  const course = await prisma.course.findUnique({
    where:  { id: courseId },
    select: { org_id: true, instructor_id: true },
  });
  if (!course) throw new ApiError(404, 'Course not found');

  await assertEditAccess(
    { id: '', course_id: courseId, course },
    userId,
    userRole,
  );

  await prisma.$transaction(
    items.map(({ id, order_index }) =>
      prisma.lesson.update({ where: { id }, data: { order_index } }),
    ),
  );

  return { reordered: items.length };
}

// ── Internal helper (used by quizzes module) ──────────────────────────────────

export async function findLessonCourseContext(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where:   { id: lessonId },
    include: { course: { select: { org_id: true, instructor_id: true } } },
  });
  if (!lesson) throw new ApiError(404, 'Lesson not found');
  return lesson as any as LessonWithCourse & { type: LessonType };
}

export { assertEditAccess as assertLessonEditAccess };

// ── Sanitize quiz for client (strip answers) ──────────────────────────────────

function sanitizeQuizForClient(quiz: { id: string; lesson_id: string; type: string; questions_json: any; created_at: Date }) {
  const questions = quiz.questions_json as any[];

  let clientQuestions: any[];
  switch (quiz.type) {
    case 'truefalse':
      clientQuestions = questions.map(q => ({ question: q.question }));
      break;
    case 'multipleChoice':
      clientQuestions = questions.map(q => ({ question: q.question, options: q.options }));
      break;
    case 'imageMatching':
      // Return images + labels separately so the client can shuffle labels
      clientQuestions = questions.map(q => ({
        images: (q.pairs as any[]).map((p: any) => p.image),
        labels: (q.pairs as any[]).map((p: any) => p.label),
      }));
      break;
    default:
      clientQuestions = questions;
  }

  return { id: quiz.id, lesson_id: quiz.lesson_id, type: quiz.type, questions: clientQuestions };
}
