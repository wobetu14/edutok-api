import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';

import authRouter from './modules/auth/auth.router';
import usersRouter from './modules/users/users.router';
import organizationsRouter from './modules/organizations/organizations.router';
import coursesRouter from './modules/courses/courses.router';
import lessonsRouter from './modules/lessons/lessons.router';
import quizzesRouter from './modules/quizzes/quizzes.router';
import engagementRouter from './modules/engagement/engagement.router';
import progressRouter from './modules/progress/progress.router';
import notificationsRouter from './modules/notifications/notifications.router';
import searchRouter from './modules/search/search.router';
import mediaRouter from './modules/media/media.router';
import adminRouter from './modules/admin/admin.router';

const app = express();

app.use(helmet());
const allowedOrigins = env.CLIENT_URL.split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Tighter rate limit on auth endpoints
app.use(
  '/api/auth',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many auth requests, slow down.' }),
);
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

app.get('/health', (_, res) => res.json({ status: 'ok', env: env.NODE_ENV }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/lessons', lessonsRouter);
app.use('/api/quizzes', quizzesRouter);
app.use('/api/engagement', engagementRouter);
app.use('/api/progress', progressRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/search', searchRouter);
app.use('/api/media', mediaRouter);
app.use('/api/admin', adminRouter);

app.use(errorHandler);

export default app;
