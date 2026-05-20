import { prisma } from '../config/database';

// ── Certificate auto-issue ────────────────────────────────────────────────────

function randomAlphanumeric(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function issueCertificate(userId: string, courseId: string): Promise<void> {
  const existing = await prisma.certificate.findUnique({
    where: { user_id_course_id: { user_id: userId, course_id: courseId } },
  });
  if (existing) return;

  const [user, course] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { full_name: true } }),
    prisma.course.findUnique({
      where:  { id: courseId },
      select: {
        title:        true,
        category:     true,
        difficulty:   true,
        organization: { select: { name: true } },
        instructor:   { select: { full_name: true } },
      },
    }),
  ]);
  if (!user || !course) return;

  const certNumber = `EDUTOK-${randomAlphanumeric(10)}`;

  await prisma.certificate.create({
    data: {
      user_id:           userId,
      course_id:         courseId,
      certificate_number: certNumber,
      student_name:      user.full_name,
      course_name:       course.title,
      organization_name: course.organization.name,
      instructor_name:   course.instructor.full_name,
      category:          course.category,
      difficulty:        course.difficulty,
    },
  });
}

// ── Streak ────────────────────────────────────────────────────────────────────

const STREAK_MILESTONES = [3, 7, 14, 30];

function streakMilestoneHit(prev: number, next: number): number | null {
  for (const m of STREAK_MILESTONES) {
    if (prev < m && next >= m) return m;
  }
  return null;
}

export async function updateStreak(
  userId:      string,
  durationSecs: number,
): Promise<{ currentStreak: number; milestone: number | null }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.streak.findUnique({ where: { user_id: userId } });

  if (!existing) {
    await prisma.streak.create({
      data: {
        user_id:               userId,
        current_streak:        1,
        longest_streak:        1,
        last_active_date:      today,
        total_seconds_learned: durationSecs,
      },
    });
    return { currentStreak: 1, milestone: milestoneHit(0, 1) };
  }

  const last = existing.last_active_date ? new Date(existing.last_active_date) : null;
  if (last) last.setHours(0, 0, 0, 0);

  const diffDays = last
    ? Math.round((today.getTime() - last.getTime()) / 86_400_000)
    : Infinity;

  const prev       = existing.current_streak;
  let   newStreak  = prev;

  if (diffDays === 0) {
    // Already active today — don't change streak count, still add duration
  } else if (diffDays === 1) {
    newStreak = prev + 1;
  } else {
    newStreak = 1;
  }

  await prisma.streak.update({
    where: { user_id: userId },
    data: {
      current_streak:        newStreak,
      longest_streak:        Math.max(newStreak, existing.longest_streak),
      last_active_date:      today,
      total_seconds_learned: { increment: durationSecs },
    },
  });

  return { currentStreak: newStreak, milestone: milestoneHit(prev, newStreak) };
}

function milestoneHit(prev: number, next: number) {
  return streakMilestoneHit(prev, next);
}

// ── Badges ────────────────────────────────────────────────────────────────────

async function getEarnedKeys(userId: string): Promise<Set<string>> {
  const rows = await prisma.badge.findMany({
    where:  { user_id: userId },
    select: { badge_key: true },
  });
  return new Set(rows.map(r => r.badge_key));
}

async function award(userId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await prisma.badge.createMany({
    data:           keys.map(badge_key => ({ user_id: userId, badge_key })),
    skipDuplicates: true,
  });
}

// Called after marking a lesson complete.
export async function checkLessonBadges(
  userId:          string,
  courseId:        string,
  newStreakValue:   number,
): Promise<string[]> {
  const have    = await getEarnedKeys(userId);
  const toAward: string[] = [];

  // first_lesson — awarded on very first completion
  if (!have.has('first_lesson')) {
    toAward.push('first_lesson');
  }

  // week_warrior — 7-day streak
  if (!have.has('week_warrior') && newStreakValue >= 7) {
    toAward.push('week_warrior');
  }

  // century_club — 100 lesson completions
  if (!have.has('century_club')) {
    const count = await prisma.lessonCompletion.count({ where: { user_id: userId } });
    if (count >= 100) toAward.push('century_club');
  }

  // explorer — 5 distinct categories completed
  if (!have.has('explorer')) {
    const courseIds = await prisma.lessonCompletion.findMany({
      where:    { user_id: userId },
      select:   { course_id: true },
      distinct: ['course_id'],
    });
    if (courseIds.length > 0) {
      const cats = await prisma.course.findMany({
        where:    { id: { in: courseIds.map(c => c.course_id) } },
        select:   { category: true },
        distinct: ['category'],
      });
      if (cats.length >= 5) toAward.push('explorer');
    }
  }

  // course_graduate — all lessons in the just-completed course are done
  const [total, completedInCourse] = await Promise.all([
    prisma.lesson.count({ where: { course_id: courseId } }),
    prisma.lessonCompletion.count({ where: { user_id: userId, course_id: courseId } }),
  ]);
  if (total > 0 && completedInCourse >= total) {
    // Badge: only the first course graduation earns it
    if (!have.has('course_graduate')) toAward.push('course_graduate');
    // Certificate: issued for every course completion (idempotent per course)
    await issueCertificate(userId, courseId);
  }

  await award(userId, toAward);
  return toAward;
}

// Called after recording a quiz pass.
export async function checkQuizBadges(userId: string): Promise<string[]> {
  const have    = await getEarnedKeys(userId);
  const toAward: string[] = [];

  // quiz_master — 10 quiz passes
  if (!have.has('quiz_master')) {
    const count = await prisma.quizPass.count({ where: { user_id: userId } });
    if (count >= 10) toAward.push('quiz_master');
  }

  await award(userId, toAward);
  return toAward;
}
