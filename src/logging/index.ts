/**
 * SPEC 05 sections 5.1 and 5.2 — logging and the honest-late path.
 *
 * "Honest self-report. **No verification, no surveillance, no proof upload.**"
 *
 * The governing rule of this module is section 5.2's last line: *always push
 * toward honesty and accuracy; never penalize the honest.* A late log is
 * accepted at full value. It is flagged in the UI with a nudge toward same-day
 * logging, and that nudge is the entire consequence — there is no reduced
 * value, no separate "late" ledger, and no path by which lateness can reach
 * the ramp.
 */

import { type DayKey, compareDays, daysBetween, previousDay } from '@/engine/calendar'
import type { SessionLog } from '@/engine/streak/types'

export type LogRejectionCode =
  | 'future_date' // cannot log a day that has not happened
  | 'too_far_back' // more than one day back (SPEC 05 section 5.2)
  | 'outside_window'
  | 'already_logged'
  | 'note_too_long'

export class LogRejectedError extends Error {
  readonly code: LogRejectionCode
  readonly userMessage: string
  constructor(code: LogRejectionCode, userMessage: string) {
    super(`${code}: ${userMessage}`)
    this.name = 'LogRejectedError'
    this.code = code
    this.userMessage = userMessage
  }
}

/** SPEC 05 section 5.1: one line, user-supplied. */
export const MAX_NOTE_LENGTH = 280

export interface LogRequest {
  readonly forDate: DayKey
  /** The user's current calendar day, resolved at the API boundary. */
  readonly today: DayKey
  readonly windowStart: DayKey
  readonly windowEnd: DayKey
  readonly completed: boolean
  readonly note?: string | null
  /** Days already logged for this commitment. */
  readonly existingDates: ReadonlySet<string>
  /** Server instant of the log action. */
  readonly loggedAt: Date
}

export interface AcceptedLog {
  readonly log: SessionLog
  /** True when `for_date` is the previous calendar day (SPEC 05 section 5.2). */
  readonly isLate: boolean
  /** The gentle nudge, or null. Never a penalty, never a scolding. */
  readonly latenessNudge: string | null
}

/**
 * Validate a log request and produce the session log.
 *
 * `for_date` and `logged_at` are stored separately and never conflated
 * (SPEC 05 section 5.1) — `for_date` is the day the behaviour happened, in the
 * user's own calendar; `logged_at` is a server instant. The `isLate` flag is
 * derived from the two and is presentational only.
 */
export function acceptLog(request: LogRequest): AcceptedLog {
  const { forDate, today, windowStart, windowEnd } = request

  if (compareDays(forDate, today) > 0) {
    throw new LogRejectedError('future_date', 'You cannot log a day that has not happened yet.')
  }

  const daysBack = daysBetween(forDate, today)
  if (daysBack > 1) {
    throw new LogRejectedError(
      'too_far_back',
      'You can log today or yesterday. Further back than that, the honest thing is to leave it — ' +
        'and it costs you nothing you had already earned.',
    )
  }

  if (compareDays(forDate, windowStart) < 0 || compareDays(forDate, windowEnd) > 0) {
    throw new LogRejectedError('outside_window', 'That day is outside this commitment’s window.')
  }

  if (request.existingDates.has(forDate)) {
    throw new LogRejectedError('already_logged', 'That day is already logged.')
  }

  const note = request.note?.trim() ?? null
  if (note !== null && note.length > MAX_NOTE_LENGTH) {
    throw new LogRejectedError('note_too_long', `Keep the note under ${MAX_NOTE_LENGTH} characters.`)
  }

  const isLate = daysBack === 1

  return {
    log: {
      forDate,
      loggedAt: request.loggedAt.toISOString(),
      completed: request.completed,
      note: note && note.length > 0 ? note : null,
    },
    isLate,
    // SPEC 05 section 5.2: nudge toward adjusting *when* they perform or log,
    // rather than penalising the timing. No value is affected by this string.
    latenessNudge: isLate
      ? 'Logged for yesterday, at full value. If catching up the next morning is becoming the ' +
        'pattern, it is usually easier to move the habit earlier than to remember later.'
      : null,
  }
}

/** Which days a user may still log right now. At most today and yesterday. */
export function loggableDays(today: DayKey, windowStart: DayKey, windowEnd: DayKey): DayKey[] {
  const candidates = [previousDay(today), today]
  return candidates.filter(
    (day) => compareDays(day, windowStart) >= 0 && compareDays(day, windowEnd) <= 0,
  )
}

/** Whether logging `forDate` would be a late log. Drives the UI flag. */
export function isLateLog(forDate: DayKey, today: DayKey): boolean {
  return daysBetween(forDate, today) === 1
}
