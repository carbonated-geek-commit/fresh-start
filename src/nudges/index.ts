/**
 * SPEC 05 section 5.3 — the nudge scheduler.
 *
 * "Two per commitment per day. These are **core scaffolding, not a
 * preference** — the cue is what triggers the behavior."
 *
 * Times are user-configurable; *whether* the nudges exist is not. The morning
 * cue prompts the behaviour, the evening check prompts the log, and the
 * evening check is suppressed once the session is already logged.
 *
 * Pure scheduling. This module computes *what* should fire and *when*; it does
 * not send anything, and it reads no clock — `now` is passed in.
 */

import { type DayKey, dayKeyInZone } from '@/engine/calendar'
import { isRecoveryPending, recoveryPrompt } from '@/engine/recovery'
import type { StreakState } from '@/engine/streak/types'

export type NudgeKind = 'morning_cue' | 'evening_check' | 'recovery'

/** SPEC 05 section 5.3 defaults, in the user's local time. */
export const DEFAULT_MORNING_CUE = '07:00'
export const DEFAULT_EVENING_CHECK = '20:00'

export interface NudgeSchedule {
  /** `HH:MM`, user-set, default 07:00 local. */
  readonly morningCue: string
  /** `HH:MM`, user-set, default 20:00 local. */
  readonly eveningCheck: string
  /** IANA zone. The user's day boundary, not the server's. */
  readonly timeZone: string
}

export const DEFAULT_SCHEDULE: NudgeSchedule = {
  morningCue: DEFAULT_MORNING_CUE,
  eveningCheck: DEFAULT_EVENING_CHECK,
  timeZone: 'UTC',
}

export interface PlannedNudge {
  readonly kind: NudgeKind
  readonly commitmentId: string
  readonly habitLabel: string
  /** The instant it should fire. */
  readonly fireAt: Date
  readonly forDate: DayKey
  readonly title: string
  readonly body: string
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value)
}

export function normalizeSchedule(partial: Partial<NudgeSchedule>): NudgeSchedule {
  return {
    morningCue: isValidTime(partial.morningCue ?? '') ? (partial.morningCue as string) : DEFAULT_MORNING_CUE,
    eveningCheck: isValidTime(partial.eveningCheck ?? '')
      ? (partial.eveningCheck as string)
      : DEFAULT_EVENING_CHECK,
    timeZone: partial.timeZone && partial.timeZone.length > 0 ? partial.timeZone : 'UTC',
  }
}

/**
 * Resolve `HH:MM` on a given calendar day in a zone to a UTC instant.
 *
 * Done by probing the zone's offset at that moment rather than by assuming
 * one, so a nudge set for 07:00 stays at 07:00 across a DST boundary.
 */
export function instantFor(day: DayKey, time: string, timeZone: string): Date {
  const [hh, mm] = time.split(':').map((n) => Number.parseInt(n, 10))
  const naive = Date.parse(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`)

  // Offset of the target zone at approximately that instant.
  const probe = new Date(naive)
  const asZoned = new Date(probe.toLocaleString('en-US', { timeZone }))
  const asUtc = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = asZoned.getTime() - asUtc.getTime()

  return new Date(naive - offsetMs)
}

export interface NudgeInput {
  readonly commitmentId: string
  readonly habitLabel: string
  readonly schedule: NudgeSchedule
  readonly state: StreakState
  /** True when a session for the user's current day is already logged. */
  readonly loggedToday: boolean
  /** Server instant. Passed in. */
  readonly now: Date
}

/**
 * The nudges due for one commitment on the user's current day.
 *
 * Returned whether or not their time has passed — the caller decides what to
 * do with a nudge whose `fireAt` is in the past (send it late, or skip it).
 * That keeps this function pure and testable at any instant.
 */
export function planDailyNudges(input: NudgeInput): PlannedNudge[] {
  const { commitmentId, habitLabel, schedule, state, loggedToday, now } = input
  const today = dayKeyInZone(now, schedule.timeZone)
  const planned: PlannedNudge[] = []

  // SPEC 05 section 5.4: the day after a miss is the most supported moment in
  // the product. It replaces the ordinary morning cue rather than adding to
  // it — two prompts on a recovery morning is pressure, not support.
  const recovering = isRecoveryPending(state, today)

  if (recovering) {
    const days = state.lastMissedDate ? Math.max(1, daysBetweenSafe(state.lastMissedDate, today)) : 1
    const prompt = recoveryPrompt(days)
    planned.push({
      kind: 'recovery',
      commitmentId,
      habitLabel,
      fireAt: instantFor(today, schedule.morningCue, schedule.timeZone),
      forDate: today,
      title: prompt.headline,
      body: `${habitLabel} — ${prompt.body}`,
    })
  } else {
    planned.push({
      kind: 'morning_cue',
      commitmentId,
      habitLabel,
      fireAt: instantFor(today, schedule.morningCue, schedule.timeZone),
      forDate: today,
      title: habitLabel,
      body: 'This is the cue. Doing it now is the whole of today’s job.',
    })
  }

  // SPEC 05 section 5.3: "The evening check is suppressed if the session is
  // already logged."
  if (!loggedToday) {
    planned.push({
      kind: 'evening_check',
      commitmentId,
      habitLabel,
      fireAt: instantFor(today, schedule.eveningCheck, schedule.timeZone),
      forDate: today,
      title: `Log ${habitLabel}?`,
      body: 'Takes a second. If today did not happen, that is fine too — log it honestly.',
    })
  }

  return planned
}

/** Nudges whose time has arrived and which have not been sent yet. */
export function dueNow(planned: readonly PlannedNudge[], now: Date, alreadySent: ReadonlySet<string>): PlannedNudge[] {
  return planned.filter(
    (nudge) => nudge.fireAt.getTime() <= now.getTime() && !alreadySent.has(nudgeKey(nudge)),
  )
}

/** Stable idempotency key: one nudge of each kind, per commitment, per day. */
export function nudgeKey(nudge: PlannedNudge): string {
  return `${nudge.commitmentId}:${nudge.forDate}:${nudge.kind}`
}

function daysBetweenSafe(from: DayKey, to: DayKey): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}
