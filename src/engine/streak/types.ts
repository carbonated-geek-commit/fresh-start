/**
 * SPEC 01 — Habit Engine. Shared types for the streak state machine.
 *
 *     User -> Habit -> Commitment -> Window -> Session
 */

import type { DayKey } from '../calendar'
import type { Rational } from '../ramp'

/** SPEC 01 section 1.3. The only behavioural difference between the modes. */
export type Mode = 'streak' | 'consistency'

/** SPEC 01 section 1.8. */
export type CommitmentStatus = 'draft' | 'active' | 'awaiting_settlement' | 'settled' | 'abandoned'

/** SPEC 04 section 4.4. There is no company value and none may be added (N1). */
export type SettlementDestination = 'user' | 'charity'

/** SPEC 01 section 1.2. */
export interface CommitmentConfig {
  readonly mode: Mode
  /** N. User-configurable, default 12, minimum 3. */
  readonly streakTarget: number
  /** Default 30. Immutable after creation. */
  readonly windowDays: number
  /** T, integer minor units. v1 = points. */
  readonly stakeTargetMinor: number
  /** `streak` mode only. Allowed values 0 or 1. */
  readonly graceDays: number
  readonly successDestination: SettlementDestination
  readonly shortfallDestination: SettlementDestination
  /** R. Optional; defaults to 1/20 (SPEC 02 section 2.2). */
  readonly baseRatio?: Rational
}

export const DEFAULT_COMMITMENT_CONFIG: Omit<CommitmentConfig, 'mode'> = {
  streakTarget: 12,
  windowDays: 30,
  stakeTargetMinor: 10_000,
  graceDays: 0,
  successDestination: 'user',
  shortfallDestination: 'user',
}

/** SPEC 05 section 5.1. One logged completion inside a window. */
export interface SessionLog {
  readonly forDate: DayKey
  /** Server instant of the log action. Stored separately, never conflated. */
  readonly loggedAt: string
  readonly completed: boolean
  /** Optional, one line, user-supplied. Never enters an analytics event. */
  readonly note?: string | null
}

/** The full state of a commitment's progress. Derived, never hand-edited. */
export interface StreakState {
  /** SPEC 01 section 1.3. Index within the current run (streak mode) or
   *  cumulative completions (consistency mode). */
  readonly position: number
  /** Grace days not yet consumed. Does not replenish within the window. */
  readonly graceRemaining: number
  /** SPEC 01 section 1.4. Monotonic, capped at `stakeTargetMinor`. */
  readonly accruedMinor: number
  readonly sessionsCompleted: number
  readonly lastCompletedDate: DayKey | null
  readonly lastMissedDate: DayKey | null
  /** The day `position` first reached `streakTarget`, unlocking the double. */
  readonly streakTargetReachedOn: DayKey | null
  /** Highest `position` seen. Used for the size staircase and analytics. */
  readonly bestPosition: number
}

export function initialStreakState(config: CommitmentConfig): StreakState {
  return {
    position: 0,
    graceRemaining: config.mode === 'streak' ? config.graceDays : 0,
    accruedMinor: 0,
    sessionsCompleted: 0,
    lastCompletedDate: null,
    lastMissedDate: null,
    streakTargetReachedOn: null,
    bestPosition: 0,
  }
}

/** What happened when a day was applied. Feeds SPEC 07 events and the UI. */
export interface DayTransition {
  readonly day: DayKey
  readonly completed: boolean
  readonly positionBefore: number
  readonly positionAfter: number
  /** Value this session earned, after the accrual cap. Never negative. */
  readonly valueMinor: number
  /** Value the ramp offered before the cap, for honest UI messaging. */
  readonly rampValueMinor: number
  readonly graceConsumed: boolean
  /** SPEC 05 section 5.4. A completion immediately following a miss. */
  readonly isRecovery: boolean
  /** Days since the miss this completion returns from, when `isRecovery`. */
  readonly daysSinceMiss: number | null
  /** True on the transition where `position` first reaches `streakTarget`. */
  readonly unlockedDouble: boolean
  /** True when the session was logged but the accrual cap was already met. */
  readonly cappedOut: boolean
}
