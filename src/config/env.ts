import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const schema = z.object({
  NODE_ENV:                z.enum(['development', 'production', 'test']).default('development'),
  PORT:                    z.coerce.number().default(3000),
  DATABASE_URL:            z.string(),
  JWT_ACCESS_SECRET:       z.string(),
  JWT_REFRESH_SECRET:      z.string(),
  JWT_ACCESS_EXPIRES_IN:   z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN:  z.string().default('7d'),
  CLOUDINARY_CLOUD_NAME:   z.string(),
  CLOUDINARY_API_KEY:      z.string(),
  CLOUDINARY_API_SECRET:   z.string(),
  SMTP_HOST:               z.string().optional(),
  SMTP_PORT:               z.coerce.number().optional(),
  SMTP_USER:               z.string().optional(),
  SMTP_PASS:               z.string().optional(),
  SMTP_FROM:               z.string().optional(),
  CLIENT_URL:              z.string().default('http://localhost:3000'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
