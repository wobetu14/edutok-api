import { CourseStatus, CourseVisibility } from '@prisma/client';
import { prisma } from '../../config/database';

// ── Sub-searches ──────────────────────────────────────────────────────────────

async function searchCourses(
  q:         string,
  category?: string,
  skip:      number = 0,
  limit:     number = 20,
) {
  const where: any = {
    status:     CourseStatus.approved,
    visibility: CourseVisibility.public,
    OR: [
      { title:       { contains: q } },
      { description: { contains: q } },
      { category:    { contains: q } },
    ],
  };
  if (category) where.category = category;

  const [courses, total] = await prisma.$transaction([
    prisma.course.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { enrolled_count: 'desc' },
      include: {
        organization: { select: { id: true, name: true, logo_url: true } },
        instructor:   { select: { id: true, full_name: true, username: true, avatar_url: true } },
        _count:       { select: { lessons: true } },
      },
    }),
    prisma.course.count({ where }),
  ]);

  return {
    data:  courses.map(({ _count, ...c }) => ({ ...c, lesson_count: _count.lessons })),
    total,
  };
}

async function searchOrgs(q: string, skip: number = 0, limit: number = 20) {
  const where = {
    OR: [
      { name:        { contains: q } },
      { description: { contains: q } },
    ],
  };

  const [orgs, total] = await prisma.$transaction([
    prisma.organization.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { name: 'asc' },
      select: {
        id:          true,
        name:        true,
        logo_url:    true,
        description: true,
        website:     true,
        created_at:  true,
        _count:      { select: { courses: true, members: true } },
      },
    }),
    prisma.organization.count({ where }),
  ]);

  return {
    data: orgs.map(({ _count, ...o }) => ({
      ...o,
      course_count: _count.courses,
      member_count: _count.members,
    })),
    total,
  };
}

async function searchLessons(
  q:         string,
  category?: string,
  skip:      number = 0,
  limit:     number = 20,
) {
  const where: any = {
    title: { contains: q },
    course: {
      status:     CourseStatus.approved,
      visibility: CourseVisibility.public,
      ...(category ? { category } : {}),
    },
  };

  const [lessons, total] = await prisma.$transaction([
    prisma.lesson.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { likes_count: 'desc' },
      select: {
        id:            true,
        title:         true,
        type:          true,
        thumbnail_url: true,
        duration_secs: true,
        has_quiz:      true,
        likes_count:   true,
        saves_count:   true,
        course: {
          select: {
            id:       true,
            title:    true,
            category: true,
            organization: { select: { id: true, name: true, logo_url: true } },
          },
        },
      },
    }),
    prisma.lesson.count({ where }),
  ]);

  return { data: lessons, total };
}

// ── History helpers ───────────────────────────────────────────────────────────

async function recordSearch(userId: string, q: string, resultCount: number): Promise<void> {
  if (q.trim().length < 2) return;
  await prisma.searchHistory.create({
    data: { user_id: userId, query: q.trim(), result_count: resultCount },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function search(
  userId: string,
  query: {
    q:        string;
    type:     'all' | 'courses' | 'orgs' | 'lessons';
    category?: string;
    page:     number;
    limit:    number;
  },
) {
  const { q, type, category, page, limit } = query;
  const skip = (page - 1) * limit;

  const [courses, orgs, lessons] = await Promise.all([
    type === 'all' || type === 'courses' ? searchCourses(q, category, skip, limit) : null,
    type === 'all' || type === 'orgs'    ? searchOrgs(q, skip, limit)               : null,
    type === 'all' || type === 'lessons' ? searchLessons(q, category, skip, limit)  : null,
  ]);

  const totalResults =
    (courses?.total ?? 0) + (orgs?.total ?? 0) + (lessons?.total ?? 0);

  // Record history fire-and-forget
  recordSearch(userId, q, totalResults).catch(() => {});

  return {
    q,
    courses: courses ?? undefined,
    orgs:    orgs    ?? undefined,
    lessons: lessons ?? undefined,
    total_results: totalResults,
  };
}

export async function getHistory(userId: string, limit: number) {
  return prisma.searchHistory.findMany({
    where:    { user_id: userId },
    orderBy:  { created_at: 'desc' },
    distinct: ['query'],
    take:     limit,
    select:   { id: true, query: true, result_count: true, created_at: true },
  });
}

export async function clearHistory(userId: string) {
  const result = await prisma.searchHistory.deleteMany({ where: { user_id: userId } });
  return { deleted: result.count };
}

export async function getCategories() {
  return prisma.category.findMany({ orderBy: { label: 'asc' } });
}
