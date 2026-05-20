import { z } from 'zod';
import { DevicePlatform } from '@prisma/client';

export const registerTokenSchema = z.object({
  token:    z.string().min(1).max(500),
  platform: z.nativeEnum(DevicePlatform),
});

export const deregisterTokenQuerySchema = z.object({
  platform: z.nativeEnum(DevicePlatform),
});

export const listQuerySchema = z.object({
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
