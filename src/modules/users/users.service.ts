import { Role, TwoFaMethod, FontScale } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(user: Record<string, any>) {
  const { password_hash, ...safe } = user;
  return safe;
}

// Fields safe to return on any public profile request
const PUBLIC_SELECT = {
  id:         true,
  full_name:  true,
  username:   true,
  avatar_url: true,
  bio:        true,
  expertise:  true,
  role:       true,
  created_at: true,
} as const;

// ── Own profile ───────────────────────────────────────────────────────────────

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      settings:    true,
      preferences: true,
      streak:      true,
      badges:      { select: { badge_key: true, earned_at: true } },
      _count:      { select: { followers: true, instructed_courses: true } },
    },
  });

  const { password_hash, ...safe } = user;
  return {
    ...safe,
    followers_count: user._count.followers,
    course_count:    user._count.instructed_courses,
    _count:          undefined,
  };
}

export async function updateMe(
  userId: string,
  data: {
    full_name?:  string;
    bio?:        string;
    avatar_url?: string;
    lang_pref?:  string;
    expertise?:  string[];
    email?:      string;
    phone?:      string;
  },
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  // Email changes are for non-learners only
  if (data.email !== undefined && user.role === Role.learner) {
    throw new ApiError(403, 'Learners cannot set an auth email');
  }

  // Uniqueness checks
  if (data.email && data.email !== user.email) {
    const taken = await prisma.user.findUnique({ where: { email: data.email } });
    if (taken) throw new ApiError(409, 'Email already in use');
  }
  if (data.phone && data.phone !== user.phone) {
    const taken = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (taken) throw new ApiError(409, 'Phone number already in use');
  }

  const patch: Record<string, any> = {};
  if (data.full_name  !== undefined) patch.full_name  = data.full_name;
  if (data.bio        !== undefined) patch.bio        = data.bio;
  if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
  if (data.lang_pref  !== undefined) patch.lang_pref  = data.lang_pref;
  if (data.expertise  !== undefined) patch.expertise  = data.expertise;
  if (data.email !== undefined && data.email !== user.email) {
    patch.email            = data.email;
    patch.is_email_verified = false; // requires re-verification
  }
  if (data.phone !== undefined && data.phone !== user.phone) {
    patch.phone            = data.phone;
    patch.is_phone_verified = false; // requires re-verification
  }

  const updated = await prisma.user.update({ where: { id: userId }, data: patch });
  return sanitize(updated);
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(userId: string) {
  return prisma.userSetting.upsert({
    where:  { user_id: userId },
    update: {},
    create: { user_id: userId },
  });
}

export async function updateSettings(
  userId: string,
  data: {
    font_scale?:            FontScale;
    high_contrast?:         boolean;
    notifications_enabled?: boolean;
    daily_reminder_time?:   string;
  },
) {
  return prisma.userSetting.upsert({
    where:  { user_id: userId },
    update: data,
    create: { user_id: userId, ...data },
  });
}

// ── Preferences ───────────────────────────────────────────────────────────────

export async function getPreferences(userId: string) {
  return prisma.userPreference.upsert({
    where:  { user_id: userId },
    update: {},
    create: { user_id: userId },
  });
}

export async function updatePreferences(
  userId: string,
  data: { preferred_categories?: string[]; onboarding_completed?: boolean },
) {
  return prisma.userPreference.upsert({
    where:  { user_id: userId },
    update: data,
    create: { user_id: userId, ...data },
  });
}

// ── 2FA management ────────────────────────────────────────────────────────────

export async function update2fa(
  userId: string,
  data: { enabled: boolean; method?: 'phone' | 'email' },
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  // Learners are phone-only — enforce server-side regardless of payload
  if (user.role === Role.learner && data.method === 'email') {
    throw new ApiError(403, 'Learners can only use phone for 2FA');
  }

  let method: TwoFaMethod = TwoFaMethod.none;

  if (data.enabled) {
    method = (data.method as TwoFaMethod) ?? TwoFaMethod.phone;

    if (method === TwoFaMethod.email) {
      if (!user.email)              throw new ApiError(400, 'Add an email address before enabling email 2FA');
      if (!user.is_email_verified)  throw new ApiError(400, 'Verify your email before enabling email 2FA');
    }
    if (method === TwoFaMethod.phone && !user.is_phone_verified) {
      throw new ApiError(400, 'Verify your phone number before enabling phone 2FA');
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data:  { two_fa_enabled: data.enabled, two_fa_method: method },
  });
  return sanitize(updated);
}

// ── Public profile ────────────────────────────────────────────────────────────

export async function getPublicProfile(targetId: string, requesterId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: targetId },
    select: {
      ...PUBLIC_SELECT,
      _count: { select: { followers: true, instructed_courses: true } },
    },
  });

  if (!user) throw new ApiError(404, 'User not found');

  const is_following =
    requesterId !== targetId
      ? !!(await prisma.instructorFollow.findUnique({
          where: {
            follower_id_instructor_id: {
              follower_id:   requesterId,
              instructor_id: targetId,
            },
          },
        }))
      : false;

  const { _count, ...rest } = user;
  return {
    ...rest,
    followers_count: _count.followers,
    course_count:    _count.instructed_courses,
    is_following,
  };
}

// ── Follows ───────────────────────────────────────────────────────────────────

export async function followInstructor(followerId: string, instructorId: string) {
  if (followerId === instructorId) throw new ApiError(400, 'Cannot follow yourself');

  const target = await prisma.user.findUnique({ where: { id: instructorId } });
  if (!target) throw new ApiError(404, 'User not found');
  if (target.role === Role.learner) throw new ApiError(400, 'You can only follow instructors or admins');

  const existing = await prisma.instructorFollow.findUnique({
    where: {
      follower_id_instructor_id: {
        follower_id:   followerId,
        instructor_id: instructorId,
      },
    },
  });
  if (existing) throw new ApiError(409, 'Already following this user');

  await prisma.instructorFollow.create({
    data: { follower_id: followerId, instructor_id: instructorId },
  });

  return { is_following: true };
}

export async function unfollowInstructor(followerId: string, instructorId: string) {
  const existing = await prisma.instructorFollow.findUnique({
    where: {
      follower_id_instructor_id: {
        follower_id:   followerId,
        instructor_id: instructorId,
      },
    },
  });
  if (!existing) throw new ApiError(404, 'Not following this user');

  await prisma.instructorFollow.delete({
    where: {
      follower_id_instructor_id: {
        follower_id:   followerId,
        instructor_id: instructorId,
      },
    },
  });

  return { is_following: false };
}

export async function checkFollow(followerId: string, instructorId: string) {
  const record = await prisma.instructorFollow.findUnique({
    where: {
      follower_id_instructor_id: {
        follower_id:   followerId,
        instructor_id: instructorId,
      },
    },
  });
  return { is_following: !!record };
}

// ── Admin — list users ────────────────────────────────────────────────────────

export async function listUsers(query: {
  page:    number;
  limit:   number;
  role?:   Role;
  search?: string;
}) {
  const { page, limit, role, search } = query;
  const skip  = (page - 1) * limit;

  const where: Record<string, any> = {};
  if (role)   where.role = role;
  if (search) {
    where.OR = [
      { username:  { contains: search } },
      { full_name: { contains: search } },
      { email:     { contains: search } },
      { phone:     { contains: search } },
    ];
  }

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
      select:  {
        id:                true,
        full_name:         true,
        username:          true,
        email:             true,
        phone:             true,
        role:              true,
        avatar_url:        true,
        is_phone_verified: true,
        is_email_verified: true,
        two_fa_enabled:    true,
        two_fa_method:     true,
        created_at:        true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total };
}

// ── Admin — change role ───────────────────────────────────────────────────────

export async function changeRole(targetId: string, newRole: Role, requesterId: string) {
  if (targetId === requesterId) throw new ApiError(400, 'Cannot change your own role');

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new ApiError(404, 'User not found');

  const patch: Record<string, any> = { role: newRole };

  // If demoting to learner, reset any email-based 2FA (learners are phone-only)
  if (newRole === Role.learner && target.two_fa_method === TwoFaMethod.email) {
    patch.two_fa_method  = TwoFaMethod.none;
    patch.two_fa_enabled = false;
  }

  const updated = await prisma.user.update({ where: { id: targetId }, data: patch });
  return sanitize(updated);
}

// ── Admin — delete user ───────────────────────────────────────────────────────

export async function deleteUser(targetId: string, requesterId: string) {
  if (targetId === requesterId) throw new ApiError(400, 'Cannot delete your own account');

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new ApiError(404, 'User not found');
  if (target.role === Role.super_admin) throw new ApiError(403, 'Cannot delete a super admin account');

  await prisma.user.delete({ where: { id: targetId } });
}
