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
    if (orgIds.length === 0) return { data: [], total: 0, page, limit };
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
    data: courses.map(({ _count, ...c }) => ({ ...c, lesson_count: _count.lessons })),
    total,
    page,
    limit,
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

  return { data: logs, total, page, limit };
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

export async function listAnnouncements(requesterRole?: string) {
  const now = new Date();
  const where: any = {
    OR: [{ expires_at: null }, { expires_at: { gte: now } }],
  };
  // Filter to announcements targeting this role or all roles
  if (requesterRole) {
    where.AND = [{ OR: [{ target_role: null }, { target_role: requesterRole }] }];
  }
  return prisma.announcement.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: { author: { select: { id: true, full_name: true } } },
  });
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
