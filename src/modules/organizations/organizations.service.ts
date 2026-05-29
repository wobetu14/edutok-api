import { Role, OrgRole, CourseStatus, CourseVisibility, ApplicationStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertOrgExists(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new ApiError(404, 'Organization not found');
  return org;
}

// Throws 403 unless the requester is super_admin or an org_admin member of this org.
async function assertOrgAdmin(orgId: string, userId: string, userRole: Role) {
  if (userRole === Role.super_admin) return;

  const membership = await prisma.orgMember.findUnique({
    where: { user_id_org_id: { user_id: userId, org_id: orgId } },
  });

  if (!membership || membership.role !== OrgRole.org_admin) {
    throw new ApiError(403, 'You must be an admin of this organization');
  }
}

// ── Public endpoints ──────────────────────────────────────────────────────────

export async function listOrgs(query: {
  page:    number;
  limit:   number;
  search?: string;
}) {
  const { page, limit, search } = query;
  const skip  = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { name:        { contains: search } },
          { description: { contains: search } },
        ],
      }
    : {};

  const [orgs, total] = await prisma.$transaction([
    prisma.organization.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
      select: {
        id:               true,
        name:             true,
        logo_url:         true,
        description:      true,
        website:          true,
        is_active:        true,
        suspended_reason: true,
        created_at:       true,
        _count:           { select: { courses: true, members: true } },
      },
    }),
    prisma.organization.count({ where }),
  ]);

  return {
    orgs: orgs.map(({ _count, ...o }) => ({
      ...o,
      course_count: _count.courses,
      member_count: _count.members,
    })),
    total,
  };
}

export async function getOrg(orgId: string) {
  const org = await prisma.organization.findUnique({
    where:  { id: orgId },
    include: {
      owner: {
        select: { id: true, full_name: true, username: true, avatar_url: true },
      },
      _count: { select: { courses: true, members: true } },
    },
  });

  if (!org) throw new ApiError(404, 'Organization not found');

  const { _count, ...rest } = org;
  return {
    ...rest,
    course_count: _count.courses,
    member_count: _count.members,
  };
}

export async function getOrgCourses(orgId: string, query: { page: number; limit: number }) {
  await assertOrgExists(orgId);

  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const where = {
    org_id:     orgId,
    status:     CourseStatus.approved,
    visibility: CourseVisibility.public,
  };

  const [courses, total] = await prisma.$transaction([
    prisma.course.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { published_at: 'desc' },
      select: {
        id:                  true,
        title:               true,
        description:         true,
        thumbnail_url:       true,
        category:            true,
        tags:                true,
        difficulty:          true,
        enrolled_count:      true,
        total_duration_secs: true,
        published_at:        true,
        instructor: {
          select: { id: true, full_name: true, username: true, avatar_url: true },
        },
        _count: { select: { lessons: true } },
      },
    }),
    prisma.course.count({ where }),
  ]);

  return {
    courses: courses.map(({ _count, ...c }) => ({ ...c, lesson_count: _count.lessons })),
    total,
  };
}

// ── Org management ────────────────────────────────────────────────────────────

export async function createOrg(
  userId: string,
  data: {
    name: string; description?: string; logo_url?: string; website?: string;
    mobile?: string; telephone?: string; email?: string;
  },
) {
  // Run org creation and creator membership in a transaction
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name:          data.name,
        description:   data.description,
        logo_url:      data.logo_url,
        website:       data.website,
        mobile:        data.mobile,
        telephone:     data.telephone,
        email:         data.email,
        owner_user_id: userId,
      },
    });

    await tx.orgMember.create({
      data: { user_id: userId, org_id: org.id, role: OrgRole.org_admin },
    });

    return org;
  });
}

export async function updateOrg(
  orgId:       string,
  requesterId: string,
  requesterRole: Role,
  data: {
    name?: string; description?: string; logo_url?: string | null; website?: string | null;
    mobile?: string | null; telephone?: string | null; email?: string | null;
  },
) {
  await assertOrgExists(orgId);
  await assertOrgAdmin(orgId, requesterId, requesterRole);

  return prisma.organization.update({
    where: { id: orgId },
    data,
  });
}

export async function deleteOrg(orgId: string) {
  await assertOrgExists(orgId);
  // Cascade deletes members and courses (via Prisma schema onDelete)
  await prisma.organization.delete({ where: { id: orgId } });
}

export async function setOrgActiveStatus(
  orgId:           string,
  isActive:        boolean,
  suspendedReason: string | undefined,
) {
  await assertOrgExists(orgId);
  return prisma.organization.update({
    where: { id: orgId },
    data: {
      is_active:        isActive,
      suspended_reason: isActive ? null : (suspendedReason ?? null),
    },
    select: { id: true, name: true, is_active: true, suspended_reason: true },
  });
}

// ── Self-registration (portal) ────────────────────────────────────────────────

export async function applyOrg(data: {
  org_name:      string;
  contact_name:  string;
  contact_email: string;
  contact_phone?: string;
  website?:       string;
  description?:   string;
}) {
  return prisma.orgApplication.create({ data });
}

export async function listApplications(query: {
  page:    number;
  limit:   number;
  status?: ApplicationStatus;
}) {
  const { page, limit, status } = query;
  const skip  = (page - 1) * limit;
  const where = status ? { status } : {};

  const [applications, total] = await prisma.$transaction([
    prisma.orgApplication.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
      include: {
        reviewer: { select: { id: true, full_name: true, username: true } },
      },
    }),
    prisma.orgApplication.count({ where }),
  ]);

  return { applications, total };
}

export async function reviewApplication(
  applicationId: string,
  action:        'approved' | 'rejected',
  rejectReason:  string | undefined,
  reviewerId:    string,
) {
  const app = await prisma.orgApplication.findUnique({ where: { id: applicationId } });
  if (!app) throw new ApiError(404, 'Application not found');
  if (app.status !== ApplicationStatus.pending) {
    throw new ApiError(409, 'Application has already been reviewed');
  }

  return prisma.orgApplication.update({
    where: { id: applicationId },
    data: {
      status:       action as ApplicationStatus,
      reviewer_id:  reviewerId,
      reviewed_at:  new Date(),
      reject_reason: action === 'rejected' ? rejectReason : null,
    },
    include: {
      reviewer: { select: { id: true, full_name: true, username: true } },
    },
  });
}

// ── Member management ─────────────────────────────────────────────────────────

export async function listMembers(orgId: string, requesterId: string, requesterRole: Role) {
  await assertOrgExists(orgId);

  // org_admin can only list members of orgs they belong to
  if (requesterRole !== Role.super_admin) {
    const membership = await prisma.orgMember.findUnique({
      where: { user_id_org_id: { user_id: requesterId, org_id: orgId } },
    });
    if (!membership) throw new ApiError(403, 'You are not a member of this organization');
  }

  return prisma.orgMember.findMany({
    where:   { org_id: orgId },
    orderBy: { joined_at: 'asc' },
    include: {
      user: {
        select: {
          id:         true,
          full_name:  true,
          username:   true,
          avatar_url: true,
          email:      true,
          phone:      true,
          role:       true,
        },
      },
    },
  });
}

export async function addMember(
  orgId:         string,
  requesterId:   string,
  requesterRole: Role,
  data: { user_id: string; role: OrgRole },
) {
  await assertOrgExists(orgId);
  await assertOrgAdmin(orgId, requesterId, requesterRole);

  const target = await prisma.user.findUnique({ where: { id: data.user_id } });
  if (!target) throw new ApiError(404, 'User not found');
  if (target.role === Role.learner) {
    throw new ApiError(400, 'Learners cannot be added as organization members');
  }

  const existing = await prisma.orgMember.findUnique({
    where: { user_id_org_id: { user_id: data.user_id, org_id: orgId } },
  });
  if (existing) throw new ApiError(409, 'User is already a member of this organization');

  return prisma.orgMember.create({
    data: { user_id: data.user_id, org_id: orgId, role: data.role },
    include: {
      user: {
        select: { id: true, full_name: true, username: true, avatar_url: true, role: true },
      },
    },
  });
}

export async function updateMember(
  orgId:         string,
  requesterId:   string,
  requesterRole: Role,
  targetUserId:  string,
  newRole:       OrgRole,
) {
  await assertOrgExists(orgId);
  await assertOrgAdmin(orgId, requesterId, requesterRole);

  const membership = await prisma.orgMember.findUnique({
    where: { user_id_org_id: { user_id: targetUserId, org_id: orgId } },
  });
  if (!membership) throw new ApiError(404, 'Member not found in this organization');

  // Guard: ensure at least one org_admin remains after the role change
  if (membership.role === OrgRole.org_admin && newRole !== OrgRole.org_admin) {
    const adminCount = await prisma.orgMember.count({
      where: { org_id: orgId, role: OrgRole.org_admin },
    });
    if (adminCount <= 1) {
      throw new ApiError(400, 'Cannot demote the last org admin — promote another member first');
    }
  }

  return prisma.orgMember.update({
    where: { user_id_org_id: { user_id: targetUserId, org_id: orgId } },
    data:  { role: newRole },
    include: {
      user: {
        select: { id: true, full_name: true, username: true, avatar_url: true, role: true },
      },
    },
  });
}

export async function removeMember(
  orgId:         string,
  requesterId:   string,
  requesterRole: Role,
  targetUserId:  string,
) {
  const org = await assertOrgExists(orgId);
  await assertOrgAdmin(orgId, requesterId, requesterRole);

  if (org.owner_user_id === targetUserId) {
    throw new ApiError(400, 'Cannot remove the organization owner');
  }

  const membership = await prisma.orgMember.findUnique({
    where: { user_id_org_id: { user_id: targetUserId, org_id: orgId } },
  });
  if (!membership) throw new ApiError(404, 'Member not found in this organization');

  // Guard: ensure at least one org_admin remains
  if (membership.role === OrgRole.org_admin) {
    const adminCount = await prisma.orgMember.count({
      where: { org_id: orgId, role: OrgRole.org_admin },
    });
    if (adminCount <= 1) {
      throw new ApiError(400, 'Cannot remove the last org admin — promote another member first');
    }
  }

  await prisma.orgMember.delete({
    where: { user_id_org_id: { user_id: targetUserId, org_id: orgId } },
  });
}

// ── Engagement aggregation ─────────────────────────────────────────────────────

export async function getOrgEngagement(orgId: string, userId: string, userRole: Role) {
  await assertOrgAdmin(orgId, userId, userRole);

  const courses = await prisma.course.findMany({
    where:  { org_id: orgId },
    select: { id: true, title: true, status: true, thumbnail_url: true },
    orderBy: { created_at: 'asc' },
  });

  const courseIds = courses.map(c => c.id);

  if (courseIds.length === 0) {
    return {
      totals:  { likes: 0, saves: 0, comments: 0, replies: 0, shares: 0 },
      courses: [],
      lessons: [],
    };
  }

  // Fetch all lessons across org courses with reply count via _count filter
  const rawLessons = await prisma.lesson.findMany({
    where:  { course_id: { in: courseIds } },
    select: {
      id:             true,
      course_id:      true,
      title:          true,
      type:           true,
      order_index:    true,
      likes_count:    true,
      saves_count:    true,
      comments_count: true,
      shares_count:   true,
      _count: { select: { comments: { where: { depth: 1 } } } },
    },
    orderBy: [{ course_id: 'asc' }, { order_index: 'asc' }],
  });

  // Map lessons to structured engagement objects
  const lessons = rawLessons.map((l: any) => {
    const replies = l._count?.comments ?? 0;
    return {
      id:            l.id,
      course_id:     l.course_id,
      title:         l.title,
      type:          l.type,
      order_index:   l.order_index,
      likes_count:   l.likes_count,
      saves_count:   l.saves_count,
      comments:      Math.max(0, l.comments_count - replies),
      replies_count: replies,
      shares_count:  l.shares_count,
    };
  });

  // Aggregate engagement per course
  const courseEngMap: Record<string, { likes: number; saves: number; comments: number; replies: number; shares: number }> = {};
  for (const l of lessons) {
    if (!courseEngMap[l.course_id]) {
      courseEngMap[l.course_id] = { likes: 0, saves: 0, comments: 0, replies: 0, shares: 0 };
    }
    courseEngMap[l.course_id].likes    += l.likes_count;
    courseEngMap[l.course_id].saves    += l.saves_count;
    courseEngMap[l.course_id].comments += l.comments;
    courseEngMap[l.course_id].replies  += l.replies_count;
    courseEngMap[l.course_id].shares   += l.shares_count;
  }

  const ZERO = { likes: 0, saves: 0, comments: 0, replies: 0, shares: 0 };

  const coursesWithEng = courses.map(c => ({
    id:           c.id,
    title:        c.title,
    status:       c.status,
    thumbnail_url: c.thumbnail_url,
    lesson_count: lessons.filter(l => l.course_id === c.id).length,
    engagement:   courseEngMap[c.id] ?? ZERO,
  }));

  const totals = Object.values(courseEngMap).reduce(
    (acc, e) => ({
      likes:    acc.likes    + e.likes,
      saves:    acc.saves    + e.saves,
      comments: acc.comments + e.comments,
      replies:  acc.replies  + e.replies,
      shares:   acc.shares   + e.shares,
    }),
    ZERO,
  );

  return { totals, courses: coursesWithEng, lessons };
}
