import { Role, QuizType, NotificationType } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';
import { checkQuizBadges } from '../../utils/gamification';
import { findLessonCourseContext, assertLessonEditAccess } from '../lessons/lessons.service';
import { sendPush } from '../notifications/notifications.service';

const PASS_THRESHOLD = 0.7; // 70 % correct required to pass

// ── Grading ───────────────────────────────────────────────────────────────────

function grade(
  type:           QuizType,
  questionsJson:  any,
  answers:        any[],
): { score: number; total: number } {
  const questions = questionsJson as any[];
  const total = questions.length;
  let score = 0;

  for (let i = 0; i < total; i++) {
    const q = questions[i];
    const a = answers[i];

    switch (type) {
      case QuizType.truefalse:
        if (a === q.answer) score++;
        break;

      case QuizType.multipleChoice:
        if (a === q.answer) score++;
        break;

      case QuizType.imageMatching:
        // a must be { [imageUrl]: label }
        if (a && typeof a === 'object' && !Array.isArray(a)) {
          const allCorrect = (q.pairs as any[]).every(
            (pair: any) => a[pair.image] === pair.label,
          );
          if (allCorrect) score++;
        }
        break;
    }
  }

  return { score, total };
}

// Strips correct answers before sending to clients
function sanitizeForClient(quiz: any) {
  const questions = quiz.questions_json as any[];
  let clientQuestions: any[];

  switch (quiz.type as QuizType) {
    case QuizType.truefalse:
      clientQuestions = questions.map(q => ({ question: q.question }));
      break;
    case QuizType.multipleChoice:
      clientQuestions = questions.map(q => ({ question: q.question, options: q.options }));
      break;
    case QuizType.imageMatching:
      clientQuestions = questions.map(q => ({
        images: (q.pairs as any[]).map((p: any) => p.image),
        labels: (q.pairs as any[]).map((p: any) => p.label),
      }));
      break;
    default:
      clientQuestions = questions;
  }

  const { questions_json: _strip, ...rest } = quiz;
  return { ...rest, questions: clientQuestions };
}

// ── Learner: fetch quiz ───────────────────────────────────────────────────────

export async function getQuizByLesson(lessonId: string, userId: string, userRole?: Role) {
  const quiz = await prisma.quiz.findUnique({ where: { lesson_id: lessonId } });
  if (!quiz) throw new ApiError(404, 'Quiz not found for this lesson');

  // Staff see the full quiz including correct answers (needed for dashboard management)
  const isStaff = userRole === Role.super_admin || userRole === Role.org_admin || userRole === Role.instructor;
  if (isStaff) return quiz;

  const passed = !!(await prisma.quizPass.findUnique({
    where: { user_id_quiz_id: { user_id: userId, quiz_id: quiz.id } },
  }));

  return { ...sanitizeForClient(quiz), is_passed: passed };
}

// ── Learner: submit answers ───────────────────────────────────────────────────

export async function submitQuiz(quizId: string, userId: string, answers: unknown[]) {
  const quiz = await prisma.quiz.findUnique({
    where:   { id: quizId },
    include: { lesson: { select: { id: true, course_id: true } } },
  });
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  const { score, total } = grade(quiz.type, quiz.questions_json, answers);
  const passed = total > 0 && score / total >= PASS_THRESHOLD;

  let newBadges: string[] = [];

  if (passed) {
    // Upsert quiz pass — idempotent (can retake but only one record)
    await prisma.quizPass.upsert({
      where:  { user_id_quiz_id: { user_id: userId, quiz_id: quizId } },
      update: { score, passed_at: new Date() },
      create: {
        user_id:   userId,
        quiz_id:   quizId,
        lesson_id: quiz.lesson_id,
        score,
      },
    });

    newBadges = await checkQuizBadges(userId);

    // Fire-and-forget push notifications
    sendPush(userId, NotificationType.quiz_pass, 'Quiz Passed!', `Score: ${score}/${total} — great job!`, { quizId, score, total }).catch(() => {});
    if (newBadges.length > 0) {
      sendPush(userId, NotificationType.badge_earned, 'Badge Earned!', `You earned: ${newBadges.join(', ')}`, { badges: newBadges }).catch(() => {});
    }
  }

  return { score, total, passed, newBadges };
}

// ── Quiz CRUD ─────────────────────────────────────────────────────────────────

export async function createQuiz(
  userId:   string,
  userRole: Role,
  data: { lesson_id: string; type: QuizType; questions_json: unknown },
) {
  const lesson = await findLessonCourseContext(data.lesson_id);
  await assertLessonEditAccess(lesson, userId, userRole);

  // Each lesson can only have one quiz
  const existing = await prisma.quiz.findUnique({ where: { lesson_id: data.lesson_id } });
  if (existing) throw new ApiError(409, 'This lesson already has a quiz');

  const quiz = await prisma.$transaction(async (tx) => {
    const created = await tx.quiz.create({
      data: {
        lesson_id:     data.lesson_id,
        type:          data.type,
        questions_json: data.questions_json as any,
      },
    });
    // Mark lesson as having a quiz
    await tx.lesson.update({
      where: { id: data.lesson_id },
      data:  { has_quiz: true },
    });
    return created;
  });

  return quiz;
}

export async function updateQuiz(
  quizId:   string,
  userId:   string,
  userRole: Role,
  data:     { questions_json: unknown },
) {
  const quiz = await prisma.quiz.findUnique({
    where:   { id: quizId },
    include: { lesson: { include: { course: { select: { org_id: true, instructor_id: true } } } } },
  });
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  await assertLessonEditAccess(
    {
      id: quiz.lesson_id,
      course_id: quiz.lesson.course_id,
      course: quiz.lesson.course,
    },
    userId,
    userRole,
  );

  return prisma.quiz.update({
    where: { id: quizId },
    data:  { questions_json: data.questions_json as any },
  });
}

export async function deleteQuiz(quizId: string, userId: string, userRole: Role) {
  const quiz = await prisma.quiz.findUnique({
    where:   { id: quizId },
    include: { lesson: { include: { course: { select: { org_id: true, instructor_id: true } } } } },
  });
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  await assertLessonEditAccess(
    {
      id: quiz.lesson_id,
      course_id: quiz.lesson.course_id,
      course: quiz.lesson.course,
    },
    userId,
    userRole,
  );

  await prisma.$transaction(async (tx) => {
    await tx.quiz.delete({ where: { id: quizId } });
    await tx.lesson.update({
      where: { id: quiz.lesson_id },
      data:  { has_quiz: false },
    });
  });
}
