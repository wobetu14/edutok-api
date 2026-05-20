import { DevicePlatform, NotificationType } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';
import { env } from '../../config/env';

// ── Expo Push dispatch ────────────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function dispatchExpoPush(
  tokens: string[],
  title:  string,
  body:   string,
  data?:  object,
): Promise<void> {
  if (tokens.length === 0) return;

  if (env.NODE_ENV !== 'production') {
    console.log(`[PUSH] "${title}" | ${body} → [${tokens.join(', ')}]`);
    return;
  }

  const messages = tokens.map(to => ({
    to,
    title,
    body,
    data:  data ?? {},
    sound: 'default',
  }));

  await fetch(EXPO_PUSH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify(messages),
  });
}

// ── Public: called by other modules (fire-and-forget friendly) ────────────────

export async function sendPush(
  userId: string,
  type:   NotificationType,
  title:  string,
  body:   string,
  data?:  object,
): Promise<void> {
  // Respect user's notification preference
  const settings = await prisma.userSetting.findUnique({
    where:  { user_id: userId },
    select: { notifications_enabled: true },
  });
  if (settings?.notifications_enabled === false) return;

  // Always log to DB so the in-app bell has history
  await prisma.notificationLog.create({
    data: { user_id: userId, type, title, body, data_json: data as any ?? null },
  });

  // Best-effort push — no tokens means no push (device hasn't registered)
  const devices = await prisma.deviceToken.findMany({
    where:  { user_id: userId },
    select: { token: true },
  });
  if (devices.length === 0) return;

  await dispatchExpoPush(devices.map(d => d.token), title, body, data);
}

// ── Device token management ───────────────────────────────────────────────────

export async function registerDeviceToken(
  userId:   string,
  token:    string,
  platform: DevicePlatform,
) {
  return prisma.deviceToken.upsert({
    where:  { user_id_platform: { user_id: userId, platform } },
    update: { token },
    create: { user_id: userId, token, platform },
  });
}

export async function deregisterDeviceToken(userId: string, platform: DevicePlatform) {
  const existing = await prisma.deviceToken.findUnique({
    where: { user_id_platform: { user_id: userId, platform } },
  });
  if (!existing) return; // Already gone — treat as success
  await prisma.deviceToken.delete({
    where: { user_id_platform: { user_id: userId, platform } },
  });
}

// ── Notification log ──────────────────────────────────────────────────────────

export async function listNotifications(
  userId: string,
  query:  { page: number; limit: number },
) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [notifications, total] = await prisma.$transaction([
    prisma.notificationLog.findMany({
      where:   { user_id: userId },
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.notificationLog.count({ where: { user_id: userId } }),
  ]);

  const unread_count = await prisma.notificationLog.count({
    where: { user_id: userId, read_at: null },
  });

  return { notifications, total, unread_count };
}

export async function markRead(notificationId: string, userId: string) {
  const notif = await prisma.notificationLog.findUnique({ where: { id: notificationId } });
  if (!notif)                    throw new ApiError(404, 'Notification not found');
  if (notif.user_id !== userId)  throw new ApiError(403, 'Access denied');
  if (notif.read_at)             return notif; // Already read — idempotent

  return prisma.notificationLog.update({
    where: { id: notificationId },
    data:  { read_at: new Date() },
  });
}

export async function markAllRead(userId: string) {
  const result = await prisma.notificationLog.updateMany({
    where: { user_id: userId, read_at: null },
    data:  { read_at: new Date() },
  });
  return { updated: result.count };
}
