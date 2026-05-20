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
};

// ── Access guards ─────────────────────────────────────────────────────────────

// Returns the course or throws 404.
async function findCourse(courseId: string): Promise<Course> {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new ApiError(404, 'Course not found');
  return course;
}

// Throws 403 unless requester can edit this course.
async function assertEditAccess(course: Course, userId: string, userRole: Role) {
  if (userRole === Role.super_admin) return;

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
async function assertApproveAccess(course: Course, userId: string, userRole: Role) {
  if (userRole === Role.super_admin) return;

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

export async function getCourse(courseId: string, requesterId?: string) {
  const course = await prisma.course.findUnique({
    where:   { id: courseId },
    include: {
      organization: { select: { id: true, name: true, logo_url: true } },
      instructor:   { select: { id: true, full_name: true, username: true, avatar_url: true } },
      lessons: {
        orderBy: { order_index: 'asc' },
        select: {
          id:            true,
          title:         true,
          type:          true,
          order_index:   true,
          duration_secs: true,
          thumbnail_url: true,
          has_quiz:      true,
          likes_count:   true,
          saves_count:   true,
          comments_count: true,
          shares_count:  true,
        },
      },
      _count: { select: { enrollments: true } },
    },
  });

  if (!course) throw new ApiError(404, 'Course not found');

  // Non-public courses are invisible to everyone except the instructor
  if (course.status !== CourseStatus.approved || course.visibility !== CourseVisibility.public) {
    if (!requesterId || (requesterId !== course.instructor_id)) {
      throw new ApiError(404, 'Course not found');
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

  const { _count, ...rest } = course;
  return { ...rest, enrolled_count: _count.enrollments, is_enrolled };
}

// ── Course CRUD ───────────────────────────────────────────────────────────────

export async function createCourse(
  userId:     string,
  userRole:   Role,
  data: {
    org_id:        string;
    title:         string;
    category:      string;
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

  // Verify caller is a member of the org (super_admin is exempt)
  if (userRole !== Role.super_admin) {
    const callerMembership = await prisma.orgMember.findUnique({
      where: { user_id_org_id: { user_id: userId, org_id: data.org_id } },
    });
    if (!callerMembership) throw new ApiError(403, 'You are not a member of this organization');
  }

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
      category:      data.category,
      description:   data.description,
      thumbnail_url: data.thumbnail_url,
      tags:          data.tags ?? [],
      difficulty:    data.difficulty ?? Difficulty.Beginner,
      visibility:    data.visibility ?? CourseVisibility.public,
      status:        CourseStatus.pending,
    },
    include: {
      organization: { select: { id: true, name: true } },
      instructor:   { select: { id: true, full_name: true, username: true } },
    },
  });
}

export async function updateCourse(
  courseId:   string,
  userId:     string,
  userRole:   Role,
  data: {
    title?:         string;
    category?:      string;
    description?:   string;
    thumbnail_url?: string;
    tags?:          string[];
    difficulty?:    Difficulty;
    visibility?:    CourseVisibility;
  },
) {
  const course = await findCourse(courseId);
  await assertEditAccess(course, userId, userRole);

  return prisma.course.update({ where: { id: courseId }, data });
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

  if (course.status === CourseStatus.pending) {
    throw new ApiError(409, 'Course is already submitted and awaiting review');
  }

  return prisma.course.update({
    where: { id: courseId },
    data:  { status: CourseStatus.pending },
  });
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
  if (course.status !== CourseStatus.approved || course.visibility !== CourseVisibility.public) {
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
