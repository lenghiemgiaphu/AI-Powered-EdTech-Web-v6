import { z } from 'zod'

export const QUESTION_TYPES = ['multiple_choice', 'true_false', 'short_answer'] as const
export type QuizQuestionType = (typeof QUESTION_TYPES)[number]

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

export const generatedQuizSchema = z.object({
  title: z.string().describe('Tiêu đề ngắn gọn của bộ quiz (tối đa 80 ký tự)'),
  summary: z.string().describe('Tóm tắt nội dung tài liệu trong 4-6 câu'),
  keyPoints: z.array(z.string()).describe('5-8 ý chính cần nhớ, mỗi ý một câu'),
  questions: z.array(
    z.object({
      type: z.enum(QUESTION_TYPES),
      topic: z.string().describe('Tên chủ đề/chương/mục của tài liệu mà câu hỏi thuộc về (2-6 từ)'),
      difficulty: z.enum(DIFFICULTIES),
      questionText: z.string(),
      options: z.array(z.string()).nullable().describe('Đúng 4 phương án nếu là multiple_choice, ngược lại null'),
      correctIndex: z.number().int().nullable().describe('Chỉ số 0-3 của đáp án đúng nếu là multiple_choice, ngược lại null'),
      statements: z
        .array(z.object({ text: z.string(), isTrue: z.boolean() }))
        .nullable()
        .describe('Đúng 4 ý a,b,c,d nếu là true_false, ngược lại null'),
      shortAnswer: z.string().nullable().describe('Đáp án ngắn (một số hoặc cụm từ ngắn) nếu là short_answer, ngược lại null'),
      explanation: z.string().describe('Giải thích vì sao đáp án đúng, dựa trên tài liệu'),
    }),
  ),
})

export type GeneratedQuiz = z.infer<typeof generatedQuizSchema>

export const optionsSchema = z.object({
  subject: z.enum(['Physics', 'Chemistry', 'Biology', 'General']),
  grade: z.coerce.number().int().min(10).max(12),
  count: z.coerce.number().int().min(3).max(20),
  difficulty: z.enum(['mixed', 'easy', 'medium', 'hard']),
  types: z.array(z.enum(QUESTION_TYPES)).min(1),
})

export type QuizOptions = z.infer<typeof optionsSchema>

const LETTERS = ['A', 'B', 'C', 'D'] as const

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Converts model output into the question shape used by the practice engine, dropping malformed items. */
export function normalizeQuestions(raw: GeneratedQuiz['questions'], options: QuizOptions) {
  const out: Record<string, unknown>[] = []

  for (const q of raw) {
    if (!options.types.includes(q.type)) continue
    const base = {
      grade: options.grade,
      subject: options.subject,
      topic: clean(q.topic) || 'Nội dung chung',
      difficulty: q.difficulty,
      questionText: clean(q.questionText),
      explanation: clean(q.explanation),
      type: q.type,
    }
    if (!base.questionText) continue

    if (q.type === 'multiple_choice') {
      const opts = q.options?.map(clean) ?? []
      if (opts.length !== 4 || opts.some((o) => !o) || q.correctIndex == null || q.correctIndex < 0 || q.correctIndex > 3) continue
      if (new Set(opts.map((o) => o.toLowerCase())).size !== 4) continue
      const order = shuffle([0, 1, 2, 3])
      const mapped = Object.fromEntries(order.map((src, i) => [LETTERS[i], opts[src]]))
      out.push({ ...base, options: mapped, correctAnswer: LETTERS[order.indexOf(q.correctIndex)] })
    } else if (q.type === 'true_false') {
      const statements = q.statements?.map((s) => ({ text: clean(s.text), isTrue: s.isTrue })) ?? []
      if (statements.length < 2 || statements.some((s) => !s.text)) continue
      out.push({ ...base, statements: statements.slice(0, 4) })
    } else {
      const answer = clean(q.shortAnswer ?? '')
      if (!answer || answer.length > 60) continue
      out.push({ ...base, correctAnswer: answer, acceptedAnswers: [] })
    }
  }
  return out.slice(0, options.count)
}
