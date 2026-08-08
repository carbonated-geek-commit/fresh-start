/**
 * SPEC 01 sections 1.3, 1.4, 1.8 — the streak state machine.
 *
 * Pure. Time is passed in, never read from a clock (CLAUDE.md section 10).
 * Every transition is a fold over explicit day outcomes, so replaying the same
 * logs always produces the same state — which is what makes the accrued value
 * auditable rather than merely stored.
 */

import { type DayKey, addDays, compareDays, dayRange, daysBetween } from '../calendar'
import { type Ramp, rampValue } from '../ramp'
import {
  type CommitmentConfig,
  type DayTransition,
  type SessionLog,
  type StreakState,
  initialStreakState,
} from './types'

/** Per-day status inside a window. Drives the calendar surface. */
export type DayStatus = 'completed' | 'missed' | 'grace' | 'pending' | 'future'

export interface DaySlot {
  readonly day: DayKey
  readonly status: DayStatus
  readonly valueMinor: number
  readonly positionAfter: number
  readonly isRecovery: boolean
}

/**
 * Apply one completed day.
 *
 * SPEC 01 section 1.3: a completed day increments `position` by 1, in both
 * modes. The session is valued at the position it was earned *at*, before the
 * increment — which is why the alternating case in SPEC 02 section 2.5 values
 * every session at `value[0]`.
 */
export function applyCompletion(
  ramp: Ramp,
  config: CommitmentConfig,
  state: StreakState,
  day: DayKey,
): { state: StreakState; transition: DayTransition } {
  const positionBefore = state.position
  const offered = rampValue(ramp, positionBefore)

  // SPEC 01 section 1.4: accrual is capped at the target. Sessions past the
  // cap add zero value but are still recorded (SPEC 05). The `max(0, ...)`
  // makes it impossible for a session to subtract value — N3 by construction.
  const room = Math.max(0, config.stakeTargetMinor - state.accruedMinor)
  const valueMinor = Math.max(0, Math.min(offered, room))

  const positionAfter = positionBefore + 1

  // SPEC 05 section 5.4: a return, not a reset. True when the most recent
  // day-level event was a miss — the user came back.
  const hasOpenMiss =
    state.lastMissedDate !== null &&
    (state.lastCompletedDate === null || compareDays(state.lastMissedDate, state.lastCompletedDate) > 0)
  const isRecovery = hasOpenMiss
  const daysSinceMiss = hasOpenMiss ? daysBetween(state.lastMissedDate as DayKey, day) : null

  const reachesTarget = positionAfter >= config.streakTarget && state.streakTargetReachedOn === null

  const next: StreakState = {
    position: positionAfter,
    graceRemaining: state.graceRemaining,
    accruedMinor: state.accruedMinor + valueMinor,
    sessionsCompleted: state.sessionsCompleted + 1,
    lastCompletedDate: day,
    lastMissedDate: state.lastMissedDate,
    streakTargetReachedOn: reachesTarget ? day : state.streakTargetReachedOn,
    bestPosition: Math.max(state.bestPosition, positionAfter),
  }

  return {
    state: next,
    transition: {
      day,
      completed: true,
      positionBefore,
      positionAfter,
      valueMinor,
      rampValueMinor: offered,
      graceConsumed: false,
      isRecovery,
      daysSinceMiss,
      unlockedDouble: reachesTarget,
      cappedOut: valueMinor === 0,
    },
  }
}

/**
 * Apply one missed day.
 *
 * SPEC 01 section 1.3: in streak mode a miss resets `position` to 0 unless a
 * grace day is available; a grace day *holds* position without incrementing,
 * is consumed once, and does not replenish. In consistency mode gaps do not
 * reset — that is the whole of the difference between the modes.
 *
 * Nothing here reduces `accruedMinor`. A miss costs future value, never
 * earned value (N3).
 */
export function applyMiss(
  config: CommitmentConfig,
  state: StreakState,
  day: DayKey,
): { state: StreakState; transition: DayTransition } {
  const positionBefore = state.position
  let positionAfter = positionBefore
  let graceConsumed = false
  let graceRemaining = state.graceRemaining

  if (config.mode === 'streak') {
    if (graceRemaining > 0) {
      graceConsumed = true
      graceRemaining -= 1
      // position is held, not incremented
    } else {
      positionAfter = 0
    }
  }

  const next: StreakState = {
    ...state,
    position: positionAfter,
    graceRemaining,
    lastMissedDate: day,
  }

  return {
    state: next,
    transition: {
      day,
      completed: false,
      positionBefore,
      positionAfter,
      valueMinor: 0,
      rampValueMinor: 0,
      graceConsumed,
      isRecovery: false,
      daysSinceMiss: null,
      unlockedDouble: false,
      cappedOut: false,
    },
  }
}

export interface ReplayInput {
  readonly ramp: Ramp
  readonly config: CommitmentConfig
  readonly windowStart: DayKey
  readonly logs: readonly SessionLog[]
  /** The user's current calendar day. Passed in; never read from a clock. */
  readonly today: DayKey
}

export interface ReplayResult {
  readonly state: StreakState
  readonly transitions: readonly DayTransition[]
  readonly slots: readonly DaySlot[]
  readonly windowStart: DayKey
  readonly windowEnd: DayKey
  /** True once the window has fully elapsed (SPEC 01 section 1.5). */
  readonly windowElapsed: boolean
}

/**
 * Fold a window's logs into current state.
 *
 * A day inside the window that has passed with no completed log is a miss.
 * The current day is `pending`, not a miss — a user still has the day to log
 * (and may log yesterday honestly, SPEC 05 section 5.2). Days after today are
 * `future` and are not applied at all.
 */
export function replayWindow(input: ReplayInput): ReplayResult {
  const { ramp, config, windowStart, logs, today } = input
  const windowEnd = addDays(windowStart, config.windowDays - 1)

  const completedDays = new Set<string>()
  for (const log of logs) {
    if (!log.completed) continue
    if (compareDays(log.forDate, windowStart) < 0) continue
    if (compareDays(log.forDate, windowEnd) > 0) continue
    completedDays.add(log.forDate)
  }

  let state = initialStreakState(config)
  const transitions: DayTransition[] = []
  const slots: DaySlot[] = []

  for (const day of dayRange(windowStart, config.windowDays)) {
    if (compareDays(day, today) > 0) {
      slots.push({ day, status: 'future', valueMinor: 0, positionAfter: state.position, isRecovery: false })
      continue
    }

    if (completedDays.has(day)) {
      const applied = applyCompletion(ramp, config, state, day)
      state = applied.state
      transitions.push(applied.transition)
      slots.push({
        day,
        status: 'completed',
        valueMinor: applied.transition.valueMinor,
        positionAfter: state.position,
        isRecovery: applied.transition.isRecovery,
      })
      continue
    }

    if (compareDays(day, today) === 0) {
      slots.push({ day, status: 'pending', valueMinor: 0, positionAfter: state.position, isRecovery: false })
      continue
    }

    const applied = applyMiss(config, state, day)
    state = applied.state
    transitions.push(applied.transition)
    slots.push({
      day,
      status: applied.transition.graceConsumed ? 'grace' : 'missed',
      valueMinor: 0,
      positionAfter: state.position,
      isRecovery: false,
    })
  }

  return {
    state,
    transitions,
    slots,
    windowStart,
    windowEnd,
    windowElapsed: compareDays(today, windowEnd) > 0,
  }
}

/**
 * What the next completion would be worth, if logged now.
 *
 * Used by the UI to show the stake the user is playing for today. Reads no
 * clock and mutates nothing.
 */
export function pendingValueMinor(ramp: Ramp, config: CommitmentConfig, state: StreakState): number {
  const offered = rampValue(ramp, state.position)
  const room = Math.max(0, config.stakeTargetMinor - state.accruedMinor)
  return Math.max(0, Math.min(offered, room))
}

/**
 * SPEC 01 section 1.8. `abandoned` is reachable only by explicit user action;
 * inactivity never abandons a commitment, so there is no path from elapsed
 * time to `abandoned` anywhere in this module.
 */
export function nextStatus(
  current: 'draft' | 'active' | 'awaiting_settlement' | 'settled' | 'abandoned',
  replay: ReplayResult,
): 'draft' | 'active' | 'awaiting_settlement' | 'settled' | 'abandoned' {
  if (current !== 'active') return current
  return replay.windowElapsed ? 'awaiting_settlement' : 'active'
}
