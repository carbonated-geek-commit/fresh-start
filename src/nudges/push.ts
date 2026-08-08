/**
 * Q15 — contentless web push.
 *
 * CLAUDE.md section 4 approves a push notification service; the VAPID key pair
 * stays a human decision. With `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
 * unset, `isPushConfigured()` is false and the app behaves exactly as it did
 * before — in-app cues only. Absence of the credential is the switch.
 *
 * **Nothing is sent in the payload.** The tickle wakes the service worker; the
 * worker fetches `/api/cue` with the user's own session and builds the
 * notification locally.
 *
 * Web push payloads are encrypted end to end (RFC 8291), so putting the habit
 * label in one would not technically expose it to the push service. The reason
 * not to is different: the push endpoint is a third party on an outbound path,
 * and N9 is about whether behavioural data travels such a path at all, not
 * about how well it is wrapped. A contentless tickle means there is nothing in
 * transit to reason about, which is a much easier property to keep true.
 */

import webpush from 'web-push'

export interface PushKeys {
  readonly p256dh: string
  readonly auth: string
}

export interface PushTarget {
  readonly subscriptionId: string
  readonly endpoint: string
  readonly keys: PushKeys
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

/** The public key the browser needs to subscribe. Safe to expose. */
export function publicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null
}

let configured = false

function ensureConfigured(): void {
  if (configured) return
  if (!isPushConfigured()) throw new Error('Push is not configured.')
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:hello@freshstart.invalid',
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  )
  configured = true
}

export type PushResult = 'sent' | 'expired' | 'failed'

/**
 * Send one tickle.
 *
 * Note the absent payload argument — there is no parameter through which
 * content could be added without changing this signature, which is the point.
 *
 * `expired` means the push service says the subscription is gone (404/410).
 * The caller marks it so a dead endpoint stops being retried forever.
 */
export async function sendTickle(target: PushTarget): Promise<PushResult> {
  ensureConfigured()
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.keys.p256dh, auth: target.keys.auth } },
      // No payload. Deliberately.
      undefined,
      { TTL: 3_600, urgency: 'normal' },
    )
    return 'sent'
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return 'expired'
    return 'failed'
  }
}

/**
 * Is a cue due for this target right now?
 *
 * Runs on scheduling metadata alone — the user's timezone and their two cue
 * times. It cannot consult habits or sessions, because the dispatcher is not
 * allowed to see them (db/policies/0002). Whether the evening check is
 * actually needed is decided later, by the service worker, from the user's own
 * session — which is where suppression-once-logged lives (SPEC 05 section 5.3).
 */
export function cueDueWithin(
  target: { time_zone: string; morning_cue: string; evening_check: string },
  now: Date,
  windowMinutes: number,
): 'morning_cue' | 'evening_check' | null {
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone: target.time_zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)

  const [hh, mm] = local.split(':').map((n) => Number.parseInt(n, 10))
  const minutesNow = (hh as number) * 60 + (mm as number)

  const at = (time: string): number => {
    const [h, m] = time.slice(0, 5).split(':').map((n) => Number.parseInt(n, 10))
    return (h as number) * 60 + (m as number)
  }

  const within = (target_: number): boolean => {
    const delta = minutesNow - target_
    return delta >= 0 && delta < windowMinutes
  }

  if (within(at(target.morning_cue))) return 'morning_cue'
  if (within(at(target.evening_check))) return 'evening_check'
  return null
}
