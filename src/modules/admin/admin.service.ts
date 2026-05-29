import { CourseStatus, OrgRole, Prisma, ReportStatus, Role } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';

// ── Audit helper (exported so other modules can call it) ──────────────────────

export async function logAudit(
  actorId:     string,
  action:      string,
  targetId?:   string,
  targetType?: string,
  meta?:       Record<string, unknown>,
  ctx?:        { ip_address?: string; user_agent?: string },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor_id:    actorId,
      action,
      target_id:   targetId,
      target_type: targetType,
      meta_json:   meta ? (meta as Prisma.InputJsonValue) : undefined,
      ip_address:  ctx?.ip_address,
      user_agent:  ctx?.user_agent,
    },
  });
}

// ── Shared helper ─────────────────────────────────────────────────────────────

function buildEnrollmentTrend(dates: Date[]): { date: string; count: number }[] {
  const abbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    day.setHours(0, 0, 0, 0);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const count = dates.filter((d) => d >= day && d < next).length;
    result.push({ date: i === 0 ? 'Today' : abbr[day.getDay()], count });
  }
  return result;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getPlatformStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    total_students,
    total_staff,
    total_orgs,
    total_courses,
    total_lessons,
    total_enrollments,
    total_completions,
    active_today,
    pending_courses,
    open_reports,
    recentEnrollments,
    trendRaw,
    coursesByCategory,
    coursesByStatus,
  ] = await Promise.all([
    prisma.user.count({ where: { role: Role.learner } }),
    prisma.user.count({ where: { role: { not: Role.learner } } }),
    prisma.organization.count(),
    prisma.course.count(),
    prisma.lesson.count(),
    prisma.enrollment.count(),
    prisma.lessonCompletion.count(),
    prisma.streak.count({ where: { last_active_date: { gte: today } } }),
    prisma.course.count({ where: { status: CourseStatus.pending } }),
    prisma.contentReport.count({ where: { status: ReportStatus.open } }),
    prisma.enrollment.findMany({
      orderBy: { enrolled_at: 'desc' },
      take: 10,
      include: {
        user:   { select: { id: true, full_name: true, username: true, avatar_url: true } },
        course: { select: { id: true, title: true } },
      },
    }),
    prisma.enrollment.findMany({
      where:  { enrolled_at: { gte: sevenDaysAgo } },
      select: { enrolled_at: true },
    }),
    prisma.course.groupBy({
      by:      ['category'],
      _count:  { id: true },
      where:   { status: CourseStatus.approved },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.course.groupBy({
      by:    ['status'],
      _count: { id: true },
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const row of coursesByStatus) statusMap[row.status] = row._count.id;

  return {
    total_students,
    total_staff,
    total_users:       total_students + total_staff,
    total_orgs,
    total_courses,
    total_lessons,
    total_enrollments,
    total_completions,
    active_today,
    pending_courses,
    open_reports,
    recent_enrollments: recentEnrollments,
    enrollment_trend:   buildEnrollmentTrend(trendRaw.map((e) => e.enrolled_at)),
    courses_by_category: coursesByCategory.map((c) => ({ category: c.category || 'Uncategorized', count: c._count.id })),
    courses_by_status: {
      draft:    statusMap['draft']    ?? 0,
      pending:  statusMap['pending']  ?? 0,
      approved: statusMap['approved'] ?? 0,
      rejected: statusMap['rejected'] ?? 0,
    },
  };
}

// ── Org Admin dashboard ───────────────────────────────────────────────────────

export async function getOrgDashboard(userId: string) {
  const memberships = await prisma.orgMember.findUnique
    ? await prisma.orgMember.findMany({
        where:  { user_id: userId, role: OrgRole.org_admin },
        select: { org_id: true },
      })
    : [];

  const orgIds = (memberships as any[]).map((m: any) => m.org_id);

  if (orgIds.length === 0) {
    return {
      members: 0, students: 0,
      courses_total: 0,
      courses_by_status: { draft: 0, pending: 0, approved: 0, rejected: 0 },
      enrollments: 0, completions: 0,
      recent_enrollments: [], enrollment_trend: [],
    };
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const courses = await prisma.course.findMany({
    where:  { org_id: { in: orgIds } },
    select: { id: true, status: true },
  });
  const courseIds = courses.map((c) => c.id);

  const [
    members,
    totalEnrollments,
    totalCompletions,
    studentGroups,
    recentEnrollments,
    trendRaw,
  ] = await Promise.all([
    prisma.orgMember.count({ where: { org_id: { in: orgIds } } }),
    courseIds.length ? prisma.enrollment.count({ where: { course_id: { in: courseIds } } }) : Promise.resolve(0),
    courseIds.length ? prisma.lessonCompletion.count({ where: { course_id: { in: courseIds } } }) : Promise.resolve(0),
    courseIds.length
      ? prisma.enrollment.groupBy({ by: ['user_id'], where: { course_id: { in: courseIds } } })
      : Promise.resolve([]),
    courseIds.length
      ? prisma.enrollment.findMany({
          where:   { course_id: { in: courseIds } },
          orderBy: { enrolled_at: 'desc' },
          take:    10,
          include: {
            user:   { select: { id: true, full_name: true, username: true, avatar_url: true } },
            course: { select: { id: true, title: true, thumbnail_url: true } },
          },
        })
      : Promise.resolve([]),
    courseIds.length
      ? prisma.enrollment.findMany({
          where:  { course_id: { in: courseIds }, enrolled_at: { gte: sevenDaysAgo } },
          select: { enrolled_at: true },
        })
      : Promise.resolve([]),
  ]);

  const cs = courses;
  return {
    members,
    students:      (studentGroups as any[]).length,
    courses_total: cs.length,
    courses_by_status: {
      draft:    cs.filter((c) => c.status === 'draft').length,
      pending:  cs.filter((c) => c.status === 'pending').length,
      approved: cs.filter((c) => c.status === 'approved').length,
      rejected: cs.filter((c) => c.status === 'rejected').length,
    },
    enrollments:        totalEnrollments,
    completions:        totalCompletions,
    recent_enrollments: recentEnrollments,
    enrollment_trend:   buildEnrollmentTrend((trendRaw as any[]).map((e: any) => e.enrolled_at)),
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

export async function listPendingCourses(
  page:          number,
  limit:         number,
  requesterId:   string,
  requesterRole: Role,
) {
  const skip = (page - 1) * limit;

  const where: any = { status: CourseStatus.pending };

  // org_admin only sees pending courses from their organizations
  if (requesterRole === Role.org_admin) {
    const adminMemberships = await prisma.orgMember.findMany({
      where: { user_id: requesterId, role: OrgRole.org_admin },
      select: { org_id: true },
    });
    const orgIds = adminMemberships.map(m => m.org_id);
    if (orgIds.length === 0) return { courses: [], total: 0 };
    where.org_id = { in: orgIds };
  }

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
    courses: courses.map(({ _count, ...c }) => ({ ...c, lesson_count: _count.lessons })),
    total,
  };
}

export async function reviewCourse(
  courseId:      string,
  reviewerId:    string,
  reviewerRole:  Role,
  status:        'approved' | 'rejected',
  notes?:        string,
  ctx?:          { ip_address?: string; user_agent?: string },
) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new ApiError(404, 'Course not found');
  if (course.status !== CourseStatus.pending) {
    throw new ApiError(409, `Course is already ${course.status}`);
  }

  // org_admin can only review courses belonging to their organization
  if (reviewerRole === Role.org_admin) {
    const membership = await prisma.orgMember.findUnique({
      where: { user_id_org_id: { user_id: reviewerId, org_id: course.org_id } },
    });
    if (!membership || membership.role !== OrgRole.org_admin) {
      throw new ApiError(403, 'You can only review courses from your own organization');
    }
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.course.update({
      where: { id: courseId },
      data: {
        status:       status,
        published_at: status === CourseStatus.approved ? now : undefined,
      },
    }),
    prisma.courseApproval.updateMany({
      where: { course_id: courseId, reviewer_id: null },
      data:  {
        reviewer_id: reviewerId,
        status,
        notes,
        reviewed_at: now,
      },
    }),
  ]);

  logAudit(reviewerId, `course.${status}`, courseId, 'Course', { notes }, ctx).catch(() => {});

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

  return { logs, total };
}

// ── Org-scoped stats (for org_admin) ─────────────────────────────────────────

export async function getOrgStats(orgId: string, requesterId: string, requesterRole: Role) {
  // super_admin can query any org; org_admin can only query their own orgs
  if (requesterRole === Role.org_admin) {
    const membership = await prisma.orgMember.findUnique({
      where: { user_id_org_id: { user_id: requesterId, org_id: orgId } },
    });
    if (!membership) throw new ApiError(403, 'You are not a member of this organization');
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new ApiError(404, 'Organization not found');

  const courseIds = await prisma.course.findMany({
    where:  { org_id: orgId },
    select: { id: true },
  }).then(cs => cs.map(c => c.id));

  const [
    total_courses,
    approved_courses,
    pending_courses,
    total_instructors,
    total_enrollments,
    total_completions,
    total_certificates,
  ] = await Promise.all([
    prisma.course.count({ where: { org_id: orgId } }),
    prisma.course.count({ where: { org_id: orgId, status: CourseStatus.approved } }),
    prisma.course.count({ where: { org_id: orgId, status: CourseStatus.pending } }),
    prisma.orgMember.count({ where: { org_id: orgId, role: OrgRole.instructor } }),
    courseIds.length
      ? prisma.enrollment.count({ where: { course_id: { in: courseIds } } })
      : Promise.resolve(0),
    courseIds.length
      ? prisma.lessonCompletion.count({ where: { course_id: { in: courseIds } } })
      : Promise.resolve(0),
    courseIds.length
      ? prisma.certificate.count({ where: { course_id: { in: courseIds } } })
      : Promise.resolve(0),
  ]);

  return {
    org_id:            orgId,
    org_name:          org.name,
    total_courses,
    approved_courses,
    pending_courses,
    total_instructors,
    total_enrollments,
    total_completions,
    total_certificates,
  };
}

// ── Announcements ─────────────────────────────────────────────────────────────

export async function listAnnouncements(requesterRole?: string, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  const now  = new Date();
  const where: any = {
    OR: [{ expires_at: null }, { expires_at: { gte: now } }],
  };
  if (requesterRole) {
    where.AND = [{ OR: [{ target_role: null }, { target_role: requesterRole }] }];
  }

  const [announcements, total] = await prisma.$transaction([
    prisma.announcement.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
      include: { author: { select: { id: true, full_name: true } } },
    }),
    prisma.announcement.count({ where }),
  ]);

  return { announcements, total };
}

export async function createAnnouncement(
  authorId:    string,
  title:       string,
  body:        string,
  targetRole?: string,
  expiresAt?:  Date,
) {
  return prisma.announcement.create({
    data: { author_id: authorId, title, body, target_role: targetRole ?? null, expires_at: expiresAt },
    include: { author: { select: { id: true, full_name: true } } },
  });
}

export async function deleteAnnouncement(announcementId: string, actorId: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!announcement) throw new ApiError(404, 'Announcement not found');

  await prisma.announcement.delete({ where: { id: announcementId } });
  logAudit(actorId, 'announcement.deleted', announcementId, 'Announcement').catch(() => {});
}
