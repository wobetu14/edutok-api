import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';

// ── Badge catalogue (source of truth for labels / descriptions) ───────────────

export const BADGE_DEFS = [
  { key: 'first_lesson',    label: 'First Lesson',    description: 'Complete your first lesson' },
  { key: 'week_warrior',    label: 'Week Warrior',     description: 'Maintain a 7-day learning streak' },
  { key: 'quiz_master',     label: 'Quiz Master',      description: 'Pass 10 quizzes' },
  { key: 'century_club',    label: 'Century Club',     description: 'Complete 100 lessons' },
  { key: 'explorer',        label: 'Explorer',         description: 'Learn in 5 different categories' },
  { key: 'course_graduate', label: 'Course Graduate',  description: 'Complete all lessons in a course' },
] as const;

// ── Weekly activity helpers ───────────────────────────────────────────────────

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;        // Mon = 1 … Sun = 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // shift to nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function buildWeeklyActivity(completions: { completed_at: Date }[]) {
  const countMap = new Map<string, number>();
  for (const c of completions) {
    const key = isoWeekKey(c.completed_at);
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  const seen  = new Set<string>();
  const weeks: { week: string; count: number }[] = [];
  const now   = new Date();

  // Last 26 weeks oldest-first
  for (let i = 25; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = isoWeekKey(d);
    if (!seen.has(key)) {
      seen.add(key);
      weeks.push({ week: key, count: countMap.get(key) ?? 0 });
    }
  }
  return weeks;
}

// ── Streak ────────────────────────────────────────────────────────────────────

export async function getStreak(userId: string) {
  const streak = await prisma.streak.findUnique({ where: { user_id: userId } });
  return streak ?? {
    user_id:               userId,
    current_streak:        0,
    longest_streak:        0,
    last_active_date:      null,
    total_seconds_learned: 0,
  };
}

// ── Badges ────────────────────────────────────────────────────────────────────

export async function getBadges(userId: string) {
  const earned = await prisma.badge.findMany({
    where:   { user_id: userId },
    select:  { badge_key: true, earned_at: true },
  });
  const earnedMap = new Map(earned.map(b => [b.badge_key, b.earned_at]));

  return BADGE_DEFS.map(def => ({
    ...def,
    earned:    earnedMap.has(def.key),
    earned_at: earnedMap.get(def.key) ?? null,
  }));
}

// ── Certificates ──────────────────────────────────────────────────────────────

export async function listCertificates(userId: string) {
  return prisma.certificate.findMany({
    where:   { user_id: userId },
    orderBy: { issued_at: 'desc' },
  });
}

export async function getCertificate(certId: string, userId: string) {
  const cert = await prisma.certificate.findUnique({ where: { id: certId } });
  if (!cert)                throw new ApiError(404, 'Certificate not found');
  if (cert.user_id !== userId) throw new ApiError(403, 'Access denied');
  return cert;
}

export async function verifyCertificate(certNumber: string) {
  const cert = await prisma.certificate.findUnique({
    where: { certificate_number: certNumber },
  });
  if (!cert) throw new ApiError(404, 'Certificate not found or invalid');
  return cert;
}

// ── Learning history ──────────────────────────────────────────────────────────

export async function getCompletions(userId: string, query: { page: number; limit: number }) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [completions, total] = await prisma.$transaction([
    prisma.lessonCompletion.findMany({
      where:   { user_id: userId },
      skip,
      take:    limit,
      orderBy: { completed_at: 'desc' },
      include: {
        lesson: {
          select: {
            id:            true,
            title:         true,
            type:          true,
            thumbnail_url: true,
            duration_secs: true,
            course: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.lessonCompletion.count({ where: { user_id: userId } }),
  ]);

  return { completions, total };
}

export async function getQuizHistory(userId: string, query: { page: number; limit: number }) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [passes, total] = await prisma.$transaction([
    prisma.quizPass.findMany({
      where:   { user_id: userId },
      skip,
      take:    limit,
      orderBy: { passed_at: 'desc' },
      include: {
        quiz:   { select: { type: true } },
        lesson: {
          select: {
            id:    true,
            title: true,
            course: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.quizPass.count({ where: { user_id: userId } }),
  ]);

  return { passes, total };
}

export async function getSaves(userId: string, query: { page: number; limit: number }) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [saves, total] = await prisma.$transaction([
    prisma.lessonSave.findMany({
      where:   { user_id: userId },
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
      include: {
        lesson: {
          select: {
            id:            true,
            title:         true,
            type:          true,
            thumbnail_url: true,
            duration_secs: true,
            likes_count:   true,
            saves_count:   true,
            course: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.lessonSave.count({ where: { user_id: userId } }),
  ]);

  return { saves, total };
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function getAnalytics(userId: string) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [recentCompletions, streak, enrollments] = await Promise.all([
    prisma.lessonCompletion.findMany({
      where:   { user_id: userId, completed_at: { gte: sixMonthsAgo } },
      select:  { completed_at: true },
      orderBy: { completed_at: 'asc' },
    }),
    prisma.streak.findUnique({ where: { user_id: userId } }),
    prisma.enrollment.findMany({
      where:   { user_id: userId },
      include: {
        course: {
          select: {
            id:            true,
            title:         true,
            thumbnail_url: true,
            category:      true,
            _count:        { select: { lessons: true } },
          },
        },
      },
    }),
  ]);

  // Batch fetch completed lesson counts per enrolled course — avoids N+1
  const courseIds = enrollments.map(e => e.course_id);
  const completionGroups = courseIds.length
    ? await prisma.lessonCompletion.groupBy({
        by:    ['course_id'],
        where: { user_id: userId, course_id: { in: courseIds } },
        _count: { id: true },
      })
    : [];
  const completionMap = new Map(completionGroups.map(g => [g.course_id, g._count.id]));

  const courseBreakdown = enrollments.map(e => ({
    course_id:         e.course_id,
    title:             e.course.title,
    thumbnail_url:     e.course.thumbnail_url,
    category:          e.course.category,
    total_lessons:     e.course._count.lessons,
    completed_lessons: completionMap.get(e.course_id) ?? 0,
  }));

  const totalSecs = streak?.total_seconds_learned ?? 0;

  return {
    weekly_activity:       buildWeeklyActivity(recentCompletions),
    course_breakdown:      courseBreakdown,
    total_seconds_learned: totalSecs,
    total_hours_learned:   Math.floor(totalSecs / 3600),
  };
}
