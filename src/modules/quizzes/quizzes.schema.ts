import { z } from 'zod';
import { QuizType } from '@prisma/client';

// ── Question shapes per type ──────────────────────────────────────────────────

const trueFalseQuestions = z.array(
  z.object({ question: z.string().min(1).max(500), answer: z.boolean() }),
).min(1).max(20);

const multipleChoiceQuestions = z.array(
  z.object({
    question: z.string().min(1).max(500),
    options:  z.array(z.string().min(1)).min(2).max(6),
    answer:   z.string().min(1),
  }),
).min(1).max(20);

const imageMatchingQuestions = z.array(
  z.object({
    pairs: z.array(
      z.object({ image: z.string().url(), label: z.string().min(1) }),
    ).min(2).max(10),
  }),
).min(1).max(5);

// ── Quiz CRUD ─────────────────────────────────────────────────────────────────

export const createQuizSchema = z.discriminatedUnion('type', [
  z.object({
    lesson_id:     z.string().cuid(),
    type:          z.literal(QuizType.truefalse),
    questions_json: trueFalseQuestions,
  }),
  z.object({
    lesson_id:     z.string().cuid(),
    type:          z.literal(QuizType.multipleChoice),
    questions_json: multipleChoiceQuestions,
  }),
  z.object({
    lesson_id:     z.string().cuid(),
    type:          z.literal(QuizType.imageMatching),
    questions_json: imageMatchingQuestions,
  }),
]);

// Type can't change after creation; only questions_json can be updated
export const updateQuizSchema = z.object({
  questions_json: z.array(z.record(z.unknown())).min(1),
});

// ── Submission ────────────────────────────────────────────────────────────────

export const submitQuizSchema = z.object({
  // Flexible per quiz type:
  //   truefalse      → boolean[]
  //   multipleChoice → string[]
  //   imageMatching  → { [imageUrl]: label }[]
  answers: z.array(z.unknown()).min(1),
});
