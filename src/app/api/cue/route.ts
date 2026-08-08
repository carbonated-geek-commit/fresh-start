import { NextResponse } from 'next/server'
import { getSession } from '@/auth'
import { resolveStore } from '@/data'
import { leadNudgeFor } from '@/services/habit-service'

export const dynamic = 'force-dynamic'

/**
 * Q15 — what the service worker fetches after a contentless tickle.
 *
 * This is where the notification's text actually comes from. The push carried
 * nothing; the worker calls here **with the user's own session cookie**, so
 * the whole request runs inside the same RLS boundary as any page. The push
 * service never sees any of it.
 *
 * It is also where SPEC 05 section 5.3's "the evening check is suppressed if
 * the session is already logged" is applied. The dispatcher could not have
 * applied it — it is not permitted to know whether anything was logged — so
 * the suppression happens at the last possible moment, here, with the real
 * state in hand. A tickle for an already-logged evening simply returns nothing
 * and the worker shows no notification.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ cue: null }, { status: 401 })

  const store = resolveStore(session.accessToken)
  const cue = await leadNudgeFor(store, session)

  if (!cue) return NextResponse.json({ cue: null })

  return NextResponse.json(
    {
      cue: {
        title: cue.title,
        body: cue.body,
        url: `/habit/${cue.commitmentId}`,
        tag: `${cue.commitmentId}:${cue.forDate}:${cue.kind}`,
      },
    },
    // Never cached. It is per-user and it changes the moment they log.
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
