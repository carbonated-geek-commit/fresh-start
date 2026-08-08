/**
 * SPEC 05 section 5.4 — the recovery day.
 *
 * "The day after a missed day is the most supported moment in the product."
 *
 * Blueprint v0.4 section 3.3 is the reason: Lally's finding is that a missed
 * day barely moves automaticity — the damage comes from abandoning after the
 * slip. So "did they come back?" predicts habit formation better than "was the
 * chain clean?", and recovery rate is the number this product optimises.
 *
 * The economic reset (position -> 0) and the emotional framing are decoupled
 * here on purpose. The ramp resets; the acknowledgement does not treat that as
 * a failure, because the behaviour the user controlled — returning — is
 * exactly the behaviour worth crediting (thesis, success principle).
 */

import { type DayKey, compareDays, daysBetween } from '../calendar'
import type { DayTransition, StreakState } from '../streak/types'

export type RecoveryTone = 'next_day' | 'short_gap' | 'long_gap'

export interface RecoveryAcknowledgement {
  readonly tone: RecoveryTone
  readonly daysSinceMiss: number
  /** Large type. Names the return. */
  readonly headline: string
  /** Supporting line. Never mentions lost progress or starting over. */
  readonly body: string
  /** What the app credits them for, in their own terms. */
  readonly credit: string
}

/**
 * Is the user in a position to recover right now? True when the most recent
 * day-level event was a miss, so today's log would be a return.
 *
 * Used to decide whether the home surface leads with the recovery treatment
 * before the user has logged, which is the point — support arrives at the
 * moment of the decision, not after it.
 */
export function isRecoveryPending(state: StreakState, today: DayKey): boolean {
  if (state.lastMissedDate === null) return false
  if (compareDays(state.lastMissedDate, today) >= 0) return false
  if (state.lastCompletedDate !== null && compareDays(state.lastCompletedDate, state.lastMissedDate) > 0) {
    return false
  }
  return true
}

/** Days between the open miss and `today`, or null when nothing to recover from. */
export function daysSinceOpenMiss(state: StreakState, today: DayKey): number | null {
  if (!isRecoveryPending(state, today)) return null
  return daysBetween(state.lastMissedDate as DayKey, today)
}

function toneFor(days: number): RecoveryTone {
  if (days <= 1) return 'next_day'
  if (days <= 3) return 'short_gap'
  return 'long_gap'
}

/**
 * Copy for a completed return.
 *
 * SPEC 05 section 5.5 constrains this language: no claim that a missed day
 * destroyed progress, no "start over", no failure framing. Every line credits
 * the action the user took.
 */
export function acknowledgeRecovery(daysSinceMiss: number): RecoveryAcknowledgement {
  const tone = toneFor(daysSinceMiss)

  if (tone === 'next_day') {
    return {
      tone,
      daysSinceMiss,
      headline: "You're back.",
      body:
        'Coming back the day after is the hardest single thing this app asks of anyone, ' +
        'and you just did it.',
      credit: 'Returning the next day is the behaviour that separates a habit from an attempt.',
    }
  }

  if (tone === 'short_gap') {
    return {
      tone,
      daysSinceMiss,
      headline: "You're back.",
      body: `A ${daysSinceMiss}-day gap, and you returned anyway. Everything you earned is still yours.`,
      credit: 'You chose to return. That is the part you controlled, and you got it right.',
    }
  }

  return {
    tone,
    daysSinceMiss,
    headline: 'Welcome back.',
    body:
      `It has been ${daysSinceMiss} days. Picking this back up is worth more than a clean run ` +
      'you never broke, because you had to decide to do it.',
    credit: 'You came back. Today counts, in full.',
  }
}

/**
 * The prompt shown *before* logging, on a day where a return is available.
 * Deliberately quiet and low-stakes: the day after a miss is where people quit,
 * so this surface must not add pressure.
 */
export function recoveryPrompt(daysSinceMiss: number): { headline: string; body: string } {
  if (daysSinceMiss <= 1) {
    return {
      headline: 'Yesterday got away. Today is still here.',
      body: 'One day back is all this needs. What you already earned has not moved.',
    }
  }
  return {
    headline: 'Pick it back up whenever you are ready.',
    body: 'Nothing you earned has gone anywhere. Today counts in full, the same as any other day.',
  }
}

/** Recovery transitions in a window, for SPEC 07 event emission and analysis. */
export function recoveriesIn(transitions: readonly DayTransition[]): DayTransition[] {
  return transitions.filter((t) => t.isRecovery)
}

/**
 * SPEC 07 section 7.3 — recovery rate after the first miss, computed over one
 * commitment's transitions. Returns null when there was no miss to recover
 * from, which is different from a rate of zero and must not be conflated.
 */
export function recoveryRate(transitions: readonly DayTransition[]): number | null {
  let misses = 0
  let recoveries = 0
  for (const t of transitions) {
    if (!t.completed && !t.graceConsumed) misses++
    if (t.isRecovery) recoveries++
  }
  if (misses === 0) return null
  return recoveries / misses
}
