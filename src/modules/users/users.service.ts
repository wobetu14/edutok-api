import { Role, TwoFaMethod, FontScale, OrgRole } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';
import { hashPassword, verifyPassword, generateSecureToken } from '../../utils/hash';

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
      org_memberships: {
        include: {
          org: {
            select: { id: true, name: true, logo_url: true, is_active: true },
          },
        },
      },
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

// ── Managed account creation (org_admin creates instructor; super_admin creates org_admin) ──

export async function createManagedUser(
  creatorId:   string,
  creatorRole: Role,
  data: {
    full_name: string;
    username:  string;
    phone:     string;
    email:     string;
    role:      Role;
    org_id?:   string;   // required when creator is org_admin
  },
) {
  // super_admin can create org_admin or instructor; org_admin can only create instructor
  if (creatorRole === Role.org_admin) {
    if (data.role !== Role.instructor) {
      throw new ApiError(403, 'Organization admins can only create instructor accounts');
    }
    if (!data.org_id) throw new ApiError(400, 'org_id is required when creating an instructor');

    // Verify creator is an org_admin of that org
    const membership = await prisma.orgMember.findUnique({
      where: { user_id_org_id: { user_id: creatorId, org_id: data.org_id } },
    });
    if (!membership || membership.role !== OrgRole.org_admin) {
      throw new ApiError(403, 'You are not an admin of this organization');
    }
  } else if (creatorRole === Role.super_admin) {
    if (data.role === Role.learner) {
      throw new ApiError(400, 'Cannot create learner accounts via this endpoint');
    }
  } else {
    throw new ApiError(403, 'Insufficient permissions to create managed accounts');
  }

  // Uniqueness checks
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: data.username }, { phone: data.phone }] },
  });
  if (existing?.username === data.username) throw new ApiError(409, 'Username already taken');
  if (existing?.phone    === data.phone)    throw new ApiError(409, 'Phone number already registered');
  if (data.email) {
    const taken = await prisma.user.findUnique({ where: { email: data.email } });
    if (taken) throw new ApiError(409, 'Email already registered');
  }

  // Generate a secure temporary password (12 chars: letters + digits)
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const tempPassword = Array.from(
    { length: 12 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)],
  ).join('');

  const password_hash = await hashPassword(tempPassword);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        full_name:            data.full_name,
        username:             data.username,
        phone:                data.phone,
        email:                data.email,
        password_hash,
        role:                 data.role,
        must_change_password: true,
        two_fa_method:        TwoFaMethod.none,
      },
    });
    await tx.streak.create({ data: { user_id: u.id } });
    await tx.userPreference.create({ data: { user_id: u.id } });
    await tx.userSetting.create({ data: { user_id: u.id } });

    // If an org was specified, add the user as a member
    if (data.org_id) {
      await tx.orgMember.create({
        data: {
          user_id: u.id,
          org_id:  data.org_id,
          role:    data.role === Role.org_admin ? OrgRole.org_admin : OrgRole.instructor,
        },
      });
    }

    return u;
  });

  const { password_hash: _ph, ...safeUser } = user;
  // tempPassword is shown once — it is NOT stored in plaintext anywhere
  return { user: safeUser, tempPassword };
}

// ── Account activation / deactivation ────────────────────────────────────────

export async function setActiveStatus(
  targetId:    string,
  isActive:    boolean,
  requesterId: string,
  requesterRole: Role,
) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new ApiError(404, 'User not found');
  if (target.id === requesterId) throw new ApiError(400, 'Cannot change your own active status');
  if (target.role === Role.super_admin) throw new ApiError(403, 'Cannot deactivate a super admin');

  // org_admin can only deactivate instructors within their org
  if (requesterRole === Role.org_admin) {
    if (target.role !== Role.instructor) {
      throw new ApiError(403, 'Organization admins can only activate/deactivate instructors');
    }
    const sharedOrg = await prisma.orgMember.findFirst({
      where: {
        user_id: requesterId,
        role:    OrgRole.org_admin,
        org: {
          members: { some: { user_id: targetId } },
        },
      },
    });
    if (!sharedOrg) {
      throw new ApiError(403, 'That instructor does not belong to any of your organizations');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: targetId }, data: { is_active: isActive } });
    // Revoke all active sessions when deactivating
    if (!isActive) {
      await tx.refreshToken.updateMany({
        where: { user_id: targetId, revoked_at: null },
        data:  { revoked_at: new Date() },
      });
    }
  });

  return { is_active: isActive };
}

// ── Change own password ───────────────────────────────────────────────────────

export async function changePassword(
  userId:          string,
  currentPassword: string,
  newPassword:     string,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    throw new ApiError(400, 'Current password is incorrect');
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different from the current password');
  }

  const password_hash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data:  { password_hash, must_change_password: false },
    }),
    prisma.refreshToken.updateMany({
      where: { user_id: userId, revoked_at: null },
      data:  { revoked_at: new Date() },
    }),
  ]);

  return { message: 'Password updated. Please log in again with your new password.' };
}

// ── Admin — list users ────────────────────────────────────────────────────────

export async function listUsers(query: {
  page:          number;
  limit:         number;
  role?:         Role;
  search?:       string;
  requesterId:   string;
  requesterRole: Role;
}) {
  const { page, limit, role, search, requesterId, requesterRole } = query;
  const skip = (page - 1) * limit;

  const conditions: any[] = [];

  if (requesterRole === Role.org_admin) {
    // org_admin sees only instructors belonging to their orgs
    const memberships = await prisma.orgMember.findMany({
      where:  { user_id: requesterId, role: OrgRole.org_admin },
      select: { org_id: true },
    });
    const orgIds = memberships.map((m) => m.org_id);
    conditions.push({ role: Role.instructor });
    conditions.push({ org_memberships: { some: { org_id: { in: orgIds } } } });
  } else {
    // super_admin sees everyone; honour optional role filter
    if (role) conditions.push({ role });
  }

  if (search) {
    conditions.push({
      OR: [
        { username:  { contains: search } },
        { full_name: { contains: search } },
        { email:     { contains: search } },
        { phone:     { contains: search } },
      ],
    });
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};

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
        is_active:         true,
        avatar_url:        true,
        is_phone_verified: true,
        is_email_verified: true,
        two_fa_enabled:    true,
        must_change_password: true,
        created_at:        true,
        org_memberships: {
          select: {
            role: true,
            org:  { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total };
}

// ── Admin — edit managed user profile ────────────────────────────────────────

export async function updateManagedUser(
  targetId:      string,
  data:          { full_name?: string; phone?: string; email?: string },
  requesterId:   string,
  requesterRole: Role,
) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new ApiError(404, 'User not found');
  if (target.id === requesterId) throw new ApiError(400, 'Use /me to update your own profile');
  if (target.role === Role.super_admin) throw new ApiError(403, 'Cannot edit a super admin account');

  if (requesterRole === Role.org_admin) {
    if (target.role !== Role.instructor) {
      throw new ApiError(403, 'Organization admins can only edit instructor accounts');
    }
    const sharedOrg = await prisma.orgMember.findFirst({
      where: {
        user_id: requesterId,
        role:    OrgRole.org_admin,
        org:     { members: { some: { user_id: targetId } } },
      },
    });
    if (!sharedOrg) throw new ApiError(403, 'That instructor does not belong to any of your organizations');
  } else if (requesterRole !== Role.super_admin) {
    throw new ApiError(403, 'Insufficient permissions');
  }

  // Uniqueness checks
  if (data.phone && data.phone !== target.phone) {
    const taken = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (taken) throw new ApiError(409, 'Phone number already in use');
  }
  if (data.email && data.email !== target.email) {
    const taken = await prisma.user.findUnique({ where: { email: data.email } });
    if (taken) throw new ApiError(409, 'Email already in use');
  }

  const patch: Record<string, any> = {};
  if (data.full_name !== undefined) patch.full_name = data.full_name;
  if (data.phone !== undefined && data.phone !== target.phone) {
    patch.phone             = data.phone;
    patch.is_phone_verified = false;
  }
  if (data.email !== undefined && data.email !== target.email) {
    patch.email             = data.email;
    patch.is_email_verified = false;
  }

  const updated = await prisma.user.update({ where: { id: targetId }, data: patch });
  return sanitize(updated);
}

// ── Admin — reset managed user password ──────────────────────────────────────

export async function adminResetPassword(
  targetId:      string,
  requesterId:   string,
  requesterRole: Role,
) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new ApiError(404, 'User not found');
  if (target.id === requesterId) throw new ApiError(400, 'Cannot reset your own password via this endpoint');
  if (target.role === Role.super_admin) throw new ApiError(403, 'Cannot reset a super admin password');

  if (requesterRole === Role.org_admin) {
    if (target.role !== Role.instructor) {
      throw new ApiError(403, 'Organization admins can only reset instructor passwords');
    }
    const sharedOrg = await prisma.orgMember.findFirst({
      where: {
        user_id: requesterId,
        role:    OrgRole.org_admin,
        org:     { members: { some: { user_id: targetId } } },
      },
    });
    if (!sharedOrg) throw new ApiError(403, 'That instructor does not belong to any of your organizations');
  } else if (requesterRole !== Role.super_admin) {
    throw new ApiError(403, 'Insufficient permissions');
  }

  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const tempPassword = Array.from(
    { length: 12 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)],
  ).join('');
  const password_hash = await hashPassword(tempPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetId },
      data:  { password_hash, must_change_password: true },
    }),
    prisma.refreshToken.updateMany({
      where: { user_id: targetId, revoked_at: null },
      data:  { revoked_at: new Date() },
    }),
  ]);

  return { tempPassword };
}

// ── Admin — reassign user to a different organization ────────────────────────

export async function reassignOrg(
  targetId:    string,
  newOrgId:    string,
  requesterId: string,
) {
  if (targetId === requesterId) throw new ApiError(400, 'Cannot reassign your own organization');

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new ApiError(404, 'User not found');
  if (target.role === Role.super_admin || target.role === Role.learner) {
    throw new ApiError(400, 'Can only reassign org_admin or instructor accounts');
  }

  const org = await prisma.organization.findUnique({ where: { id: newOrgId } });
  if (!org) throw new ApiError(404, 'Organization not found');

  const newOrgRole = target.role === Role.org_admin ? OrgRole.org_admin : OrgRole.instructor;

  await prisma.$transaction(async (tx) => {
    await tx.orgMember.deleteMany({ where: { user_id: targetId } });
    await tx.orgMember.create({
      data: { user_id: targetId, org_id: newOrgId, role: newOrgRole },
    });
  });

  return { org_id: newOrgId, org_name: org.name };
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
