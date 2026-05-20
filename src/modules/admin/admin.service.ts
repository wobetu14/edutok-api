import { CourseStatus, Prisma, ReportStatus, Role } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';

// ── Audit helper (exported so other modules can call it) ──────────────────────

export async function logAudit(
  actorId:    string,
  action:     string,
  targetId?:  string,
  targetType?: string,
  meta?:      Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor_id:    actorId,
      action,
      target_id:   targetId,
      target_type: targetType,
      meta_json:   meta ? (meta as Prisma.InputJsonValue) : undefined,
    },
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getPlatformStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    total_users,
    total_orgs,
    total_courses,
    total_lessons,
    active_today,
    pending_courses,
    open_reports,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.course.count(),
    prisma.lesson.count(),
    prisma.streak.count({ where: { last_active_date: { gte: today } } }),
    prisma.course.count({ where: { status: CourseStatus.pending } }),
    prisma.contentReport.count({ where: { status: ReportStatus.open } }),
  ]);

  return {
    total_users,
    total_orgs,
    total_courses,
    total_lessons,
    active_today,
    pending_courses,
    open_reports,
  };
}

// ── User management ───────────────────────────────────────────────────────────

export async function listUsers(query: {
  page:   number;
  limit:  number;
  search?: string;
  role?:  Role;
}) {
  const { page, limit, search, role } = query;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (role)   where.role = role;
  if (search) {
    where.OR = [
      { full_name: { contains: search } },
      { username:  { contains: search } },
      { phone:     { contains: search } },
    ];
  }

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      select: {
        id:               true,
        full_name:        true,
        username:         true,
        phone:            true,
        email:            true,
        role:             true,
        avatar_url:       true,
        is_phone_verified: true,
        is_email_verified: true,
        created_at:       true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { data: users, total, page, limit };
}

// ── Course approval ───────────────────────────────────────────────────────────

export async function listPendingCourses(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const where = { status: CourseStatus.pending };

  const [courses, total] = await prisma.$transaction([
    prisma.course.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'asc' },
      include: {
        organization: { select: { id: true, name: true, logo_url: true } },
        instructor:   { select: { id: true, full_name: true, username: true } },
        _count:       { select: { lessons: true } },
      },
    }),
    prisma.course.count({ where }),
  ]);

  return {
    data: courses.map(({ _count, ...c }) => ({ ...c, lesson_count: _count.lessons })),
    total,
    page,
    limit,
  };
}

export async function reviewCourse(
  courseId:   string,
  reviewerId: string,
  status:     'approved' | 'rejected',
  notes?:     string,
) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new ApiError(404, 'Course not found');
  if (course.status !== CourseStatus.pending) {
    throw new ApiError(409, `Course is already ${course.status}`);
  }

  const [updated] = await prisma.$transaction([
    prisma.course.update({
      where: { id: courseId },
      data: {
        status:       status,
        published_at: status === CourseStatus.approved ? new Date() : undefined,
      },
    }),
    prisma.courseApproval.create({
      data: {
        course_id:   courseId,
        reviewer_id: reviewerId,
        status,
        notes,
      },
    }),
  ]);

  // Fire-and-forget audit log
  logAudit(reviewerId, `course.${status}`, courseId, 'Course', { notes }).catch(() => {});

  return updated;
}

// ── Content reports ───────────────────────────────────────────────────────────

export async function listReports(query: {
  page:   number;
  limit:  number;
  status?: ReportStatus;
}) {
  const { page, limit, status } = query;
  const skip  = (page - 1) * limit;
  const where = status ? { status } : {};

  const [reports, total] = await prisma.$transaction([
    prisma.contentReport.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        reporter: { select: { id: true, full_name: true, username: true } },
        resolver: { select: { id: true, full_name: true, username: true } },
        lesson:   { select: { id: true, title: true } },
        comment:  { select: { id: true, body: true } },
      },
    }),
    prisma.contentReport.count({ where }),
  ]);

  return { data: reports, total, page, limit };
}

export async function resolveReport(
  reportId:   string,
  resolverId: string,
  status:     'reviewed' | 'dismissed',
) {
  const report = await prisma.contentReport.findUnique({ where: { id: reportId } });
  if (!report) throw new ApiError(404, 'Report not found');
  if (report.status !== ReportStatus.open) {
    throw new ApiError(409, `Report is already ${report.status}`);
  }

  const updated = await prisma.contentReport.update({
    where: { id: reportId },
    data:  { status, resolved_by: resolverId, resolved_at: new Date() },
  });

  logAudit(resolverId, `report.${status}`, reportId, 'ContentReport').catch(() => {});

  return updated;
}

// ── Audit logs ────────────────────────────────────────────────────────────────

export async function listAuditLogs(query: {
  page:         number;
  limit:        number;
  actor_id?:    string;
  target_type?: string;
}) {
  const { page, limit, actor_id, target_type } = query;
  const skip  = (page - 1) * limit;
  const where: any = {};
  if (actor_id)    where.actor_id    = actor_id;
  if (target_type) where.target_type = target_type;

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { actor: { select: { id: true, full_name: true, username: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { data: logs, total, page, limit };
}

// ── Announcements ─────────────────────────────────────────────────────────────

export async function listAnnouncements() {
  const now = new Date();
  return prisma.announcement.findMany({
    where: {
      OR: [
        { expires_at: null },
        { expires_at: { gte: now } },
      ],
    },
    orderBy: { created_at: 'desc' },
    include: { author: { select: { id: true, full_name: true } } },
  });
}

export async function createAnnouncement(
  authorId:  string,
  title:     string,
  body:      string,
  expiresAt?: Date,
) {
  return prisma.announcement.create({
    data: { author_id: authorId, title, body, expires_at: expiresAt },
    include: { author: { select: { id: true, full_name: true } } },
  });
}

export async function deleteAnnouncement(announcementId: string, actorId: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!announcement) throw new ApiError(404, 'Announcement not found');

  await prisma.announcement.delete({ where: { id: announcementId } });
  logAudit(actorId, 'announcement.deleted', announcementId, 'Announcement').catch(() => {});
}
