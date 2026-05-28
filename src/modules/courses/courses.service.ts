import {
  Role, OrgRole, Difficulty, CourseStatus, CourseVisibility, NotificationType,
} from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';
import { sendPush } from '../notifications/notifications.service';

// ── Types ─────────────────────────────────────────────────────────────────────

type Course = {
  id: string;
  org_id: string;
  instructor_id: string;
  status: CourseStatus;
  title: string;
};

// ── Access guards ─────────────────────────────────────────────────────────────

// Returns the course or throws 404.
async function findCourse(courseId: string): Promise<Course> {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new ApiError(404, 'Course not found');
  return course;
}

// Throws 403 unless requester can edit this course.
// Super admins are intentionally excluded — course management belongs to org admins and instructors.
async function assertEditAccess(course: Course, userId: string, userRole: Role) {
  if (userRole === Role.org_admin) {
    const m = await prisma.orgMember.findUnique({
      where: { user_id_org_id: { user_id: userId, org_id: course.org_id } },
    });
    if (m) return;
  }

  if (course.instructor_id === userId) return;

  throw new ApiError(403, 'You do not have permission to modify this course');
}

// Throws 403 unless requester can approve/reject this course.
// Only org admins of the course's organization can approve or reject.
async function assertApproveAccess(course: Course, userId: string, userRole: Role) {
  const m = await prisma.orgMember.findUnique({
    where: { user_id_org_id: { user_id: userId, org_id: course.org_id } },
  });
  if (m?.role === OrgRole.org_admin) return;

  throw new ApiError(403, 'You do not have permission to approve or reject this course');
}

// ── Public ────────────────────────────────────────────────────────────────────

export async function listCourses(query: {
  page:        number;
  limit:       number;
  q?:          string;
  category?:   string;
  difficulty?: Difficulty;
}) {
  const { page, limit, q, category, difficulty } = query;
  const skip = (page - 1) * limit;

  const where: Record<string, any> = {
    status:     CourseStatus.approved,
    visibility: CourseVisibility.public,
  };
  if (category)   where.category   = category;
  if (difficulty) where.difficulty = difficulty;
  if (q) {
    where.OR = [
      { title:       { contains: q } },
      { description: { contains: q } },
      { category:    { contains: q } },
    ];
  }

  const [courses, total] = await prisma.$transaction([
    prisma.course.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { published_at: 'desc' },
      include: {
        organization: { select: { id: true, name: true, logo_url: true } },
        instructor:   { select: { id: true, full_name: true, username: true, avatar_url: true } },
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

export async function getCourse(courseId: string, requesterId?: string, requesterRole?: string) {
  const course = await prisma.course.findUnique({
    where:   { id: courseId },
    include: {
      organization:      { select: { id: true, name: true, logo_url: true } },
      instructor:        { select: { id: true, full_name: true, username: true, avatar_url: true } },
      course_categories: {
        include: { category: { select: { id: true, label: true, color: true, icon: true } } },
      },
      lessons: {
        orderBy: { order_index: 'asc' },
        select: {
          id:             true,
          title:          true,
          type:           true,
          order_index:    true,
          duration_secs:  true,
          thumbnail_url:  true,
          has_quiz:       true,
          likes_count:    true,
          saves_count:    true,
          comments_count: true,
          shares_count:   true,
        },
      },
      _count: { select: { enrollments: true } },
    },
  });

  if (!course) throw new ApiError(404, 'Course not found');

  const isApproved      = course.status === CourseStatus.approved;
  const isPublic        = course.visibility === CourseVisibility.public;
  const isUnlisted      = course.visibility === CourseVisibility.unlisted;
  const isPrivate       = course.visibility === CourseVisibility.private;

  // Determine access:
  // - public + approved   → anyone (auth or not)
  // - unlisted + approved → any authenticated user (not discoverable, but link-accessible)
  // - private or not approved → staff only (instructor, org_admin of this org, super_admin)

  if (isApproved && isPublic) {
    // open access — no checks needed
  } else if (isApproved && isUnlisted) {
    // Requires auth; any authenticated user with the link can view
    if (!requesterId) throw new ApiError(404, 'Course not found');
  } else {
    // private course OR any non-approved status — staff only
    if (!requesterId) throw new ApiError(404, 'Course not found');

    const isInstructor = requesterId === course.instructor_id;
    const isSuperAdmin = requesterRole === Role.super_admin;
    let   isOrgAdmin   = false;

    if (!isInstructor && !isSuperAdmin) {
      if (requesterRole === Role.org_admin) {
        const membership = await prisma.orgMember.findUnique({
          where: { user_id_org_id: { user_id: requesterId, org_id: course.org_id } },
        });
        isOrgAdmin = !!membership;
      }
      if (!isOrgAdmin) throw new ApiError(404, 'Course not found');
    }
  }

  // Attach enrollment status if caller is known
  let is_enrolled = false;
  if (requesterId) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { user_id_course_id: { user_id: requesterId, course_id: courseId } },
    });
    is_enrolled = !!enrollment;
  }

  const { _count, course_categories, ...rest } = course;
  return {
    ...rest,
    enrolled_count: _count.enrollments,
    is_enrolled,
    categories: course_categories.map((cc) => cc.category),
  };
}

// ── Instructor's own courses (all statuses + visibilities) ───────────────────

export async function listMyCourses(
  userId:   string,
  userRole: Role,
  query: {
    page:      number;
    limit:     number;
    status?:   CourseStatus;
    org_id?:   string;
  },
) {
  const { page, limit, status, org_id } = query;
  const skip = (page - 1) * limit;

  const where: Record<string, any> = {};

  if (userRole === Role.super_admin) {
    // super_admin can see everything; filters are optional
    if (status)  where.status  = status;
    if (org_id)  where.org_id  = org_id;
  } else if (userRole === Role.org_admin) {
    // org_admin sees all courses across their orgs
    const memberships = await prisma.orgMember.findMany({
      where:  { user_id: userId, role: OrgRole.org_admin },
      select: { org_id: true },
    });
    const orgIds = memberships.map(m => m.org_id);
    if (orgIds.length === 0) return { courses: [], total: 0 };
    where.org_id = org_id ? { in: orgIds.filter(id => id === org_id) } : { in: orgIds };
    if (status) where.status = status;
  } else {
    // instructor only sees their own courses
    where.instructor_id = userId;
    if (status) where.status = status;
    if (org_id) where.org_id = org_id;
  }

  const [courses, total] = await prisma.$transaction([
    prisma.course.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { updated_at: 'desc' },
      include: {
        organization:      { select: { id: true, name: true, logo_url: true } },
        instructor:        { select: { id: true, full_name: true, username: true, avatar_url: true } },
        course_categories: {
          include: { category: { select: { id: true, label: true, color: true, icon: true } } },
        },
        _count: { select: { lessons: true, enrollments: true } },
      },
    }),
    prisma.course.count({ where }),
  ]);

  return {
    courses: courses.map(({ _count, course_categories, ...c }) => ({
      ...c,
      lesson_count:    _count.lessons,
      enrolled_count:  _count.enrollments,
      categories:      course_categories.map((cc) => cc.category),
    })),
    total,
  };
}

// ── Course CRUD ───────────────────────────────────────────────────────────────

export async function createCourse(
  userId:     string,
  userRole:   Role,
  data: {
    org_id:        string;
    title:         string;
    category_ids:  string[];
    description?:  string;
    thumbnail_url?: string;
    tags?:         string[];
    difficulty?:   Difficulty;
    visibility?:   CourseVisibility;
    instructor_id?: string;
  },
) {
  const org = await prisma.organization.findUnique({ where: { id: data.org_id } });
  if (!org) throw new ApiError(404, 'Organization not found');

  // All callers must be a member of the org
  const callerMembership = await prisma.orgMember.findUnique({
    where: { user_id_org_id: { user_id: userId, org_id: data.org_id } },
  });
  if (!callerMembership) throw new ApiError(403, 'You are not a member of this organization');

  // Resolve the primary category label (for the legacy `category` string field)
  const firstCat = await prisma.category.findUnique({ where: { id: data.category_ids[0] } });
  if (!firstCat) throw new ApiError(400, 'Invalid category');

  const instructorId = data.instructor_id ?? userId;

  // If assigning to someone else, verify that person is an org member
  if (instructorId !== userId) {
    if (userRole === Role.instructor) {
      throw new ApiError(403, 'Instructors cannot assign courses to other users');
    }
    const instructorMembership = await prisma.orgMember.findUnique({
      where: { user_id_org_id: { user_id: instructorId, org_id: data.org_id } },
    });
    if (!instructorMembership) {
      throw new ApiError(400, 'Assigned instructor must be a member of the organization');
    }
  }

  return prisma.course.create({
    data: {
      org_id:        data.org_id,
      instructor_id: instructorId,
      title:         data.title,
      category:      firstCat.label,
      description:   data.description,
      thumbnail_url: data.thumbnail_url,
      tags:          data.tags ?? [],
      difficulty:    data.difficulty ?? Difficulty.Beginner,
      visibility:    data.visibility ?? CourseVisibility.public,
      status:        CourseStatus.draft,
      course_categories: {
        create: data.category_ids.map((cid) => ({ category_id: cid })),
      },
    },
    include: {
      organization:      { select: { id: true, name: true } },
      instructor:        { select: { id: true, full_name: true, username: true } },
      course_categories: {
        include: { category: { select: { id: true, label: true, color: true, icon: true } } },
      },
    },
  });
}

export async function updateCourse(
  courseId:   string,
  userId:     string,
  userRole:   Role,
  data: {
    title?:         string;
    category_ids?:  string[];
    description?:   string;
    thumbnail_url?: string;
    tags?:          string[];
    difficulty?:    Difficulty;
    visibility?:    CourseVisibility;
  },
) {
  const course = await findCourse(courseId);
  await assertEditAccess(course, userId, userRole);

  const wasApproved = course.status === CourseStatus.approved;
  const { category_ids, ...rest } = data;
  const patch: Record<string, any> = { ...rest };
  if (wasApproved) patch.status = CourseStatus.pending;

  // Resolve category label before transaction
  if (category_ids && category_ids.length > 0) {
    const firstCat = await prisma.category.findUnique({ where: { id: category_ids[0] } });
    if (firstCat) patch.category = firstCat.label;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (category_ids && category_ids.length > 0) {
      await tx.courseCategory.deleteMany({ where: { course_id: courseId } });
      await tx.courseCategory.createMany({
        data: category_ids.map((cid) => ({ course_id: courseId, category_id: cid })),
      });
    }
    if (wasApproved) {
      await tx.courseApproval.create({
        data: {
          course_id:    courseId,
          submitted_by: userId,
          submitted_at: new Date(),
          status:       CourseStatus.pending,
        },
      });
    }
    return tx.course.update({ where: { id: courseId }, data: patch });
  });

  // Fire-and-forget: notify org admins that a published course was re-submitted
  if (wasApproved) {
    prisma.orgMember.findMany({
      where:  { org_id: course.org_id, role: OrgRole.org_admin },
      select: { user_id: true },
    }).then((admins) => {
      for (const { user_id } of admins) {
        sendPush(
          user_id,
          NotificationType.course_updated,
          'Course Updated',
          `"${course.title}" was edited after approval and needs re-review.`,
          { courseId },
        ).catch(() => {});
      }
    }).catch(() => {});
  }

  return updated;
}

export async function deleteCourse(courseId: string, userId: string, userRole: Role) {
  const course = await findCourse(courseId);
  await assertEditAccess(course, userId, userRole);

  await prisma.course.delete({ where: { id: courseId } });
}

// ── Approval workflow ─────────────────────────────────────────────────────────

export async function submitCourse(courseId: string, userId: string, userRole: Role) {
  const course = await findCourse(courseId);

  // Only the course instructor or an org_admin of this org can submit
  if (userRole !== Role.super_admin) {
    const isInstructor = course.instructor_id === userId;
    let isOrgAdmin = false;
    if (userRole === Role.org_admin) {
      const m = await prisma.orgMember.findUnique({
        where: { user_id_org_id: { user_id: userId, org_id: course.org_id } },
      });
      isOrgAdmin = m?.role === OrgRole.org_admin;
    }
    if (!isInstructor && !isOrgAdmin) {
      throw new ApiError(403, 'Only the course instructor or an org admin can submit for review');
    }
  }

  if (course.status !== CourseStatus.draft && course.status !== CourseStatus.rejected) {
    throw new ApiError(409, 'Course is already submitted and awaiting review');
  }

  const [updated] = await prisma.$transaction([
    prisma.course.update({ where: { id: courseId }, data: { status: CourseStatus.pending } }),
    prisma.courseApproval.create({
      data: {
        course_id:    courseId,
        submitted_by: userId,
        submitted_at: new Date(),
        status:       CourseStatus.pending,
      },
    }),
  ]);

  return updated;
}

export async function approveCourse(
  courseId: string,
  userId:   string,
  userRole: Role,
  data:     { action: 'approve' | 'reject'; rejection_reason?: string },
) {
  const course = await findCourse(courseId);
  await assertApproveAccess(course, userId, userRole);

  if (course.status !== CourseStatus.pending) {
    throw new ApiError(409, 'Only pending courses can be approved or rejected');
  }

  const patch: Record<string, any> =
    data.action === 'approve'
      ? { status: CourseStatus.approved, published_at: new Date() }
      : { status: CourseStatus.rejected };

  return prisma.course.update({ where: { id: courseId }, data: patch });
}

// ── Enrollment ────────────────────────────────────────────────────────────────

export async function enrollCourse(courseId: string, userId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new ApiError(404, 'Course not found');

  // Enrollment allowed for approved public or approved unlisted courses.
  // Private courses and non-approved courses are never enrollable.
  const enrollable =
    course.status === CourseStatus.approved &&
    (course.visibility === CourseVisibility.public || course.visibility === CourseVisibility.unlisted);

  if (!enrollable) {
    throw new ApiError(400, 'Course is not available for enrollment');
  }

  const existing = await prisma.enrollment.findUnique({
    where: { user_id_course_id: { user_id: userId, course_id: courseId } },
  });
  if (existing) throw new ApiError(409, 'Already enrolled in this course');

  await prisma.$transaction([
    prisma.enrollment.create({ data: { user_id: userId, course_id: courseId } }),
    prisma.course.update({
      where: { id: courseId },
      data:  { enrolled_count: { increment: 1 } },
    }),
  ]);

  // Fire-and-forget push notification
  sendPush(userId, NotificationType.enrollment, 'Enrolled!', `You joined "${course.title}"`, { courseId }).catch(() => {});

  return { enrolled: true };
}

export async function unenrollCourse(courseId: string, userId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new ApiError(404, 'Course not found');

  const enrollment = await prisma.enrollment.findUnique({
    where: { user_id_course_id: { user_id: userId, course_id: courseId } },
  });
  if (!enrollment) throw new ApiError(404, 'Not enrolled in this course');

  await prisma.$transaction([
    prisma.enrollment.delete({
      where: { user_id_course_id: { user_id: userId, course_id: courseId } },
    }),
    prisma.course.update({
      where: { id: courseId },
      data:  { enrolled_count: { decrement: 1 } },
    }),
  ]);

  return { enrolled: false };
}

// ── Students ──────────────────────────────────────────────────────────────────

export async function listStudents(
  courseId:   string,
  userId:     string,
  userRole:   Role,
  query:      { page: number; limit: number },
) {
  const course = await findCourse(courseId);
  await assertEditAccess(course, userId, userRole);

  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const where = { course_id: courseId };
  const [enrollments, total] = await prisma.$transaction([
    prisma.enrollment.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { enrolled_at: 'desc' },
      include: {
        user: {
          select: { id: true, full_name: true, username: true, avatar_url: true },
        },
      },
    }),
    prisma.enrollment.count({ where }),
  ]);

  return { enrollments, total };
}
