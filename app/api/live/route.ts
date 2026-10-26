import { NextResponse } from 'next/server'
import { z } from 'zod'
import { HttpError } from '@/lib/quiz/errors'
import { createRoom, createSchema, enforceLimit, getState, hostAction, joinRoom, submitAnswer } from '@/lib/live/engine'

export const dynamic = 'force-dynamic'

const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

const codeSchema = z.string().regex(/^\d{6}$/)

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create') }).extend(createSchema.shape),
  z.object({ action: z.literal('join'), code: codeSchema, name: z.string().max(60), pid: z.string().max(64).optional() }),
  z.object({ action: z.enum(['start', 'next', 'end']), code: codeSchema, hostToken: z.string().max(64) }),
  z.object({ action: z.literal('answer'), code: codeSchema, pid: z.string().max(64), choice: z.string().max(2) }),
])

function failure(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return NextResponse.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 })
  console.error('[live] unexpected error', error)
  return NextResponse.json({ error: 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.' }, { status: 500 })
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const code = codeSchema.parse(searchParams.get('code') ?? '')
    const state = await getState(code, {
      pid: searchParams.get('pid') ?? undefined,
      hostToken: searchParams.get('host') ?? undefined,
    })
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Mã phòng không hợp lệ.' }, { status: 404 })
    return failure(error)
  }
}

export async function POST(req: Request) {
  try {
    const body = actionSchema.parse(await req.json())
    const ip = clientIp(req)

    switch (body.action) {
      case 'create': {
        await enforceLimit('create', ip, 8, '1 m')
        const { action: _action, ...input } = body
        return NextResponse.json(await createRoom(input))
      }
      case 'join':
        await enforceLimit('join', ip, 80, '1 m')
        return NextResponse.json(await joinRoom(body.code, body.name, body.pid))
      case 'answer':
        await enforceLimit('answer', body.pid, 20, '10 s')
        return NextResponse.json(await submitAnswer(body.code, body.pid, body.choice))
      default:
        return NextResponse.json(await hostAction(body.code, body.hostToken, body.action))
    }
  } catch (error) {
    return failure(error)
  }
}
