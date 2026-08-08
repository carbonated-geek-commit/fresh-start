import { NextResponse } from 'next/server'
import { resolveStore } from '@/data'
import { cueDueWithin, isPushConfigured, sendTickle } from '@/nudges/push'

export const dynamic = 'force-dynamic'

/**
 * Q15 — the tickle dispatcher.
 *
 * Called on a cadence by an external scheduler (Vercel Cron, GitHub Actions,
 * a systemd timer — anything). Runs across users, which is why it is the one
 * path with its own database role: `freshstart_nudger` can read the
 * `nudge_targets` view and nothing else (db/policies/0002).
 *
 * **What it can see:** a push endpoint, a timezone, and two cue times.
 * **What it sends:** nothing. The tickle has no payload; the service worker
 * fetches the cue with the user's own session.
 *
 * That combination is what lets a cross-user job exist without breaking N9 —
 * there is no point in the pipeline where behavioural data is in the
 * dispatcher's hands or on the wire to a third party.
 *
 * This endpoint sends notifications only. It cannot log a session, create a
 * commitment, or settle one; N5 is untouched, because nothing here resolves
 * anything.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.NUDGE_DISPATCH_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Dispatch is not configured.' }, { status: 503 })
  }

  // Constant-time-ish comparison is overkill for a cron secret, but a bare
  // equality check on a missing header should still fail closed.
  const provided = request.headers.get('authorization')
  if (provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'Push is not configured.' }, { status: 503 })
  }

  const store = resolveStore(process.env.NUDGE_DISPATCH_TOKEN)
  const targets = await store.listNudgeTargets()
  const now = new Date()

  // The window should match the cron cadence. Fifteen minutes suits a
  // */15 schedule and keeps a cue from firing twice.
  const windowMinutes = Number(process.env.NUDGE_DISPATCH_WINDOW_MINUTES ?? 15)

  let sent = 0
  let expired = 0
  let failed = 0

  for (const target of targets) {
    const due = cueDueWithin(
      {
        time_zone: target.timeZone,
        morning_cue: target.morningCue,
        evening_check: target.eveningCheck,
      },
      now,
      windowMinutes,
    )
    if (!due) continue

    const result = await sendTickle({
      subscriptionId: target.subscriptionId,
      endpoint: target.endpoint,
      keys: { p256dh: target.p256dh, auth: target.auth },
    })

    if (result === 'sent') sent++
    else if (result === 'expired') {
      expired++
      await store.markPushSubscriptionExpired(target.subscriptionId)
    } else failed++
  }

  // Counts only. No user identifiers in the response — this endpoint's caller
  // is a scheduler, and it has no business learning who was nudged.
  return NextResponse.json({ considered: targets.length, sent, expired, failed })
}
