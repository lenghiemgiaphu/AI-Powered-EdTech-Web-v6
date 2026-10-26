import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { z } from 'zod'
import { HttpError } from '@/lib/quiz/errors'

export const ROOM_TTL_SEC = 6 * 60 * 60
const ANSWER_GRACE_MS = 1200
const MAX_PLAYERS = 200
const CHOICES = ['A', 'B', 'C', 'D'] as const

type Choice = (typeof CHOICES)[number]
type Phase = 'lobby' | 'question' | 'reveal' | 'finished'

interface Meta {
  code: string
  title: string
  subject: string
  hostToken: string
  timeSec: number
  total: number
  phase: Phase
  qIndex: number
  qStartedAt: number
  createdAt: number
}

interface StoredQuestion {
  text: string
  options: Record<Choice, string>
  correct: Choice
  explanation: string
}

interface Player {
  name: string
  score: number
  streak: number
  correct: number
  totalMs: number
  joinedAt: number
  lastQ: number
  lastChoice: Choice | null
  lastPts: number
  lastCorrect: boolean
}

interface StoredAnswer {
  choice: Choice
  ms: number
}

let redisClient: Redis | null = null
export function getRedis() {
  if (redisClient) return redisClient
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new HttpError(503, 'Chưa kết nối Upstash Redis nên chưa thể tạo phòng đấu trực tiếp.')
  redisClient = new Redis({ url, token })
  return redisClient
}

const limiters = new Map<string, Ratelimit>()
export async function enforceLimit(name: string, key: string, requests: number, window: `${number} ${'s' | 'm'}`) {
  let limiter = limiters.get(name)
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(requests, window),
      prefix: `live:rl:${name}`,
    })
    limiters.set(name, limiter)
  }
  const { success } = await limiter.limit(key)
  if (!success) throw new HttpError(429, 'Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.')
}

const keys = (code: string) => ({
  meta: `live:${code}:meta`,
  questions: `live:${code}:q`,
  players: `live:${code}:players`,
  answers: (i: number) => `live:${code}:a:${i}`,
})

const questionSchema = z.object({
  text: z.string().trim().min(1).max(600),
  options: z.object({
    A: z.string().trim().min(1).max(300),
    B: z.string().trim().min(1).max(300),
    C: z.string().trim().min(1).max(300),
    D: z.string().trim().min(1).max(300),
  }),
  correct: z.enum(CHOICES),
  explanation: z.string().trim().max(900).optional().default(''),
})

export const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  subject: z.string().trim().max(40).default(''),
  timeSec: z.number().int().min(8).max(90),
  questions: z.array(questionSchema).min(1).max(40),
})

const cleanName = (raw: string) =>
  raw
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function loadMeta(code: string) {
  if (!/^\d{6}$/.test(code)) throw new HttpError(404, 'Mã phòng không hợp lệ.')
  const meta = await getRedis().get<Meta>(keys(code).meta)
  if (!meta) throw new HttpError(404, 'Không tìm thấy phòng. Phòng có thể đã hết hạn.')
  return meta
}

function assertHost(meta: Meta, hostToken: string | undefined) {
  if (!hostToken || hostToken !== meta.hostToken) throw new HttpError(403, 'Chỉ người tổ chức mới thực hiện được thao tác này.')
}

function effectivePhase(meta: Meta, answeredCount: number, playerCount: number, now: number): Phase {
  if (meta.phase !== 'question') return meta.phase
  const deadline = meta.qStartedAt + meta.timeSec * 1000
  if (now >= deadline) return 'reveal'
  if (playerCount > 0 && answeredCount >= playerCount) return 'reveal'
  return 'question'
}

export async function createRoom(input: z.infer<typeof createSchema>) {
  const redis = getRedis()
  const hostToken = crypto.randomUUID()
  const meta = (code: string): Meta => ({
    code,
    title: input.title,
    subject: input.subject,
    hostToken,
    timeSec: input.timeSec,
    total: input.questions.length,
    phase: 'lobby',
    qIndex: -1,
    qStartedAt: 0,
    createdAt: Date.now(),
  })

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode()
    const created = await redis.set(keys(code).meta, meta(code), { nx: true, ex: ROOM_TTL_SEC })
    if (!created) continue

    const k = keys(code)
    const entries: Record<string, StoredQuestion> = {}
    input.questions.forEach((q, i) => {
      entries[String(i)] = q
    })
    const pipe = redis.pipeline()
    pipe.hset(k.questions, entries)
    pipe.expire(k.questions, ROOM_TTL_SEC)
    await pipe.exec()
    return { code, hostToken }
  }
  throw new HttpError(503, 'Không tạo được mã phòng. Vui lòng thử lại.')
}

export async function joinRoom(code: string, rawName: string, existingPid?: string) {
  const redis = getRedis()
  const meta = await loadMeta(code)
  if (meta.phase === 'finished') throw new HttpError(409, 'Phòng này đã kết thúc.')
  const k = keys(code)

  if (existingPid) {
    const existing = await redis.hget<Player>(k.players, existingPid)
    if (existing) return { pid: existingPid, name: existing.name }
  }

  const name = cleanName(rawName)
  if (name.length < 1) throw new HttpError(400, 'Hãy nhập tên hiển thị.')

  const players = (await redis.hgetall<Record<string, Player>>(k.players)) ?? {}
  const list = Object.values(players)
  if (list.length >= MAX_PLAYERS) throw new HttpError(409, 'Phòng đã đủ người.')
  const taken = new Set(list.map((p) => p.name.toLowerCase()))
  let finalName = name
  for (let n = 2; taken.has(finalName.toLowerCase()); n++) finalName = `${name.slice(0, 17)} ${n}`

  const pid = crypto.randomUUID()
  const player: Player = {
    name: finalName,
    score: 0,
    streak: 0,
    correct: 0,
    totalMs: 0,
    joinedAt: Date.now(),
    lastQ: -1,
    lastChoice: null,
    lastPts: 0,
    lastCorrect: false,
  }
  const pipe = redis.pipeline()
  pipe.hset(k.players, { [pid]: player })
  pipe.expire(k.players, ROOM_TTL_SEC)
  await pipe.exec()
  return { pid, name: finalName }
}

export async function hostAction(code: string, hostToken: string | undefined, action: 'start' | 'next' | 'end') {
  const redis = getRedis()
  const meta = await loadMeta(code)
  assertHost(meta, hostToken)
  const k = keys(code)
  const now = Date.now()

  if (action === 'end') {
    meta.phase = 'finished'
  } else if (action === 'start') {
    if (meta.phase !== 'lobby') throw new HttpError(409, 'Trò chơi đã bắt đầu.')
    const count = await redis.hlen(k.players)
    if (count < 1) throw new HttpError(409, 'Cần ít nhất một người chơi để bắt đầu.')
    meta.phase = 'question'
    meta.qIndex = 0
    meta.qStartedAt = now
  } else {
    if (meta.phase === 'lobby' || meta.phase === 'finished') throw new HttpError(409, 'Không thể chuyển câu lúc này.')
    const [answeredCount, playerCount] = await Promise.all([redis.hlen(k.answers(meta.qIndex)), redis.hlen(k.players)])
    const phase = effectivePhase(meta, answeredCount, playerCount, now)
    if (phase === 'question') {
      meta.phase = 'reveal'
      meta.qStartedAt = Math.min(meta.qStartedAt, now - meta.timeSec * 1000)
    } else if (meta.qIndex + 1 < meta.total) {
      meta.phase = 'question'
      meta.qIndex += 1
      meta.qStartedAt = now
    } else {
      meta.phase = 'finished'
    }
  }
  await redis.set(k.meta, meta, { ex: ROOM_TTL_SEC })
  return { ok: true }
}

export async function submitAnswer(code: string, pid: string | undefined, choice: string) {
  if (!pid) throw new HttpError(400, 'Thiếu mã người chơi.')
  if (!CHOICES.includes(choice as Choice)) throw new HttpError(400, 'Đáp án không hợp lệ.')
  const redis = getRedis()
  const meta = await loadMeta(code)
  const k = keys(code)
  const now = Date.now()

  if (meta.phase !== 'question') throw new HttpError(409, 'Câu hỏi đã đóng.')
  const deadline = meta.qStartedAt + meta.timeSec * 1000
  if (now > deadline + ANSWER_GRACE_MS) throw new HttpError(409, 'Đã hết giờ cho câu này.')

  const player = await redis.hget<Player>(k.players, pid)
  if (!player) throw new HttpError(404, 'Bạn chưa tham gia phòng này.')

  const ms = Math.max(0, Math.min(now - meta.qStartedAt, meta.timeSec * 1000))
  const first = await redis.hsetnx(k.answers(meta.qIndex), pid, { choice: choice as Choice, ms } satisfies StoredAnswer)
  if (!first) throw new HttpError(409, 'Bạn đã trả lời câu này rồi.')
  await redis.expire(k.answers(meta.qIndex), ROOM_TTL_SEC)

  const question = await redis.hget<StoredQuestion>(k.questions, String(meta.qIndex))
  if (!question) throw new HttpError(500, 'Không tải được câu hỏi.')

  const correct = question.correct === choice
  const carriedStreak = player.lastCorrect && player.lastQ === meta.qIndex - 1 ? player.streak : 0
  const speedPoints = Math.round(1000 * (1 - 0.5 * (ms / (meta.timeSec * 1000))))
  const streakBonus = Math.min(carriedStreak, 5) * 50
  const pts = correct ? speedPoints + streakBonus : 0

  const updated: Player = {
    ...player,
    score: player.score + pts,
    streak: correct ? carriedStreak + 1 : 0,
    correct: player.correct + (correct ? 1 : 0),
    totalMs: player.totalMs + ms,
    lastQ: meta.qIndex,
    lastChoice: choice as Choice,
    lastPts: pts,
    lastCorrect: correct,
  }
  await redis.hset(k.players, { [pid]: updated })
  return { ok: true }
}

const rankPlayers = (entries: [string, Player][]) =>
  [...entries].sort(([, a], [, b]) => b.score - a.score || a.totalMs - b.totalMs || a.joinedAt - b.joinedAt)

export async function getState(code: string, opts: { pid?: string; hostToken?: string }) {
  const redis = getRedis()
  const meta = await loadMeta(code)
  const k = keys(code)
  const now = Date.now()
  const isHost = !!opts.hostToken && opts.hostToken === meta.hostToken
  const inGame = meta.phase === 'question' || meta.phase === 'reveal'

  const pipe = redis.pipeline()
  pipe.hgetall(k.players)
  if (inGame) {
    pipe.hgetall(k.answers(meta.qIndex))
    pipe.hget(k.questions, String(meta.qIndex))
  }
  const results = await pipe.exec<unknown[]>()
  const players = (results[0] as Record<string, Player> | null) ?? {}
  const answers = inGame ? ((results[1] as Record<string, StoredAnswer> | null) ?? {}) : {}
  const question = inGame ? (results[2] as StoredQuestion | null) : null

  const entries = Object.entries(players)
  const phase = effectivePhase(meta, Object.keys(answers).length, entries.length, now)
  const ranked = rankPlayers(entries)
  const rankOf = new Map(ranked.map(([id], i) => [id, i + 1]))
  const mePlayer = opts.pid ? players[opts.pid] : undefined

  const base = {
    code: meta.code,
    title: meta.title,
    subject: meta.subject,
    phase,
    total: meta.total,
    timeSec: meta.timeSec,
    qIndex: meta.qIndex,
    serverNow: now,
    startedAt: meta.qStartedAt,
    deadline: meta.qStartedAt + meta.timeSec * 1000,
    playerCount: entries.length,
    answeredCount: Object.keys(answers).length,
  }

  const lobbyNames = phase === 'lobby' ? entries.sort(([, a], [, b]) => a.joinedAt - b.joinedAt).map(([, p]) => p.name) : undefined

  const leaderboard = (phase === 'reveal' || phase === 'finished' ? ranked : [])
    .slice(0, phase === 'finished' ? 20 : 8)
    .map(([id, p], i) => ({
      rank: i + 1,
      name: p.name,
      score: p.score,
      streak: p.lastQ === meta.qIndex ? p.streak : 0,
      gained: p.lastQ === meta.qIndex ? p.lastPts : 0,
      me: id === opts.pid,
    }))

  const showQuestion = question && (phase === 'question' || phase === 'reveal')
  const reveal = phase === 'reveal' && question
  const counts: Record<Choice, number> = { A: 0, B: 0, C: 0, D: 0 }
  if (reveal) Object.values(answers).forEach((a) => (counts[a.choice] += 1))

  const myAnswer = opts.pid ? answers[opts.pid] : undefined
  const me = mePlayer
    ? {
        name: mePlayer.name,
        score: mePlayer.score,
        rank: rankOf.get(opts.pid as string) ?? 0,
        correct: mePlayer.correct,
        streak: mePlayer.lastQ >= meta.qIndex - 1 ? mePlayer.streak : 0,
        answered: !!myAnswer,
        choice: myAnswer?.choice ?? null,
        gained: mePlayer.lastQ === meta.qIndex ? mePlayer.lastPts : 0,
        wasCorrect: mePlayer.lastQ === meta.qIndex ? mePlayer.lastCorrect : false,
        totalMs: mePlayer.totalMs,
      }
    : null

  return {
    ...base,
    isHost,
    names: lobbyNames,
    leaderboard,
    question: showQuestion
      ? {
          text: question.text,
          options: question.options,
          ...(reveal ? { correct: question.correct, explanation: question.explanation, counts } : {}),
        }
      : null,
    me,
  }
}
