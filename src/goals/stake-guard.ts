/**
 * N7 — "A user stakes on an outcome rather than a behavior."
 *
 * SPEC 03 section 3.2: "Stake creation rejects any habit classified x_large.
 * This is a hard validation at the persistence boundary, not a UI hint."
 *
 * Every path that creates a commitment calls `assertStakeable`. There is no
 * second path. A UI that forgot to disable a button cannot produce a staked
 * outcome, because the button is not what enforces this.
 *
 * The ramp-profile check (ADR-001) is enforced in the same place for the same
 * reason: a commitment on an inadmissible profile would owe a user a value the
 * ramp cannot lawfully produce.
 */

import { type RampProfile, describeProfile, type RampDomainViolation } from '@/engine/ramp'
import { type SizeClass, isStakeable } from './schema'

export type StakeRejectionCode =
  | 'outcome_not_stakeable' // N7
  | 'habit_limit_reached' // SPEC 01 section 1.7
  | 'ramp_profile_inadmissible' // ADR-001
  | 'window_days_invalid' // SPEC 01 section 1.2
  | 'grace_days_invalid' // SPEC 01 section 1.2

export class StakeRejectedError extends Error {
  readonly code: StakeRejectionCode
  /** Shown to the user verbatim. Explains, never scolds. */
  readonly userMessage: string
  readonly detail?: RampDomainViolation

  constructor(code: StakeRejectionCode, userMessage: string, detail?: RampDomainViolation) {
    super(`${code}: ${userMessage}`)
    this.name = 'StakeRejectedError'
    this.code = code
    this.userMessage = userMessage
    this.detail = detail
  }
}

/** SPEC 01 section 1.7. */
export const MAX_CONCURRENT_COMMITMENTS = 5

export interface StakeRequest {
  readonly habitLabel: string
  readonly sizeClass: SizeClass
  readonly windowDays: number
  readonly graceDays: number
  readonly mode: 'streak' | 'consistency'
  readonly profile: RampProfile
  /** Commitments already active for this user. */
  readonly activeCommitmentCount: number
}

/**
 * The single gate. Throws `StakeRejectedError`, or returns cleanly.
 *
 * Called by the repository layer before any write, so it holds regardless of
 * which surface — web form, API route, seed script, test — originated the
 * request.
 */
export function assertStakeable(request: StakeRequest): void {
  // N7 first. This is the invariant, and it is checked before anything that
  // could throw for a lesser reason and mask it.
  if (!isStakeable(request.sizeClass)) {
    throw new StakeRejectedError(
      'outcome_not_stakeable',
      `"${request.habitLabel}" is a result, not something you do. You could do everything right ` +
        'and still not reach it, so it is not something to stake on. Keep it as your reason — ' +
        'stake on the behaviour that gets you there.',
    )
  }

  if (request.activeCommitmentCount >= MAX_CONCURRENT_COMMITMENTS) {
    throw new StakeRejectedError(
      'habit_limit_reached',
      `You are holding ${MAX_CONCURRENT_COMMITMENTS} habits already, which is the ceiling. ` +
        'Finish or step back from one before adding another.',
    )
  }

  if (!Number.isInteger(request.windowDays) || request.windowDays < 1 || request.windowDays > 366) {
    throw new StakeRejectedError(
      'window_days_invalid',
      'A window has to be between 1 and 366 days.',
    )
  }

  const graceOk =
    Number.isInteger(request.graceDays) &&
    request.graceDays >= 0 &&
    (request.mode === 'streak' ? request.graceDays <= 1 : request.graceDays === 0)
  if (!graceOk) {
    throw new StakeRejectedError(
      'grace_days_invalid',
      request.mode === 'streak'
        ? 'A streak can carry at most one grace day.'
        : 'Consistency mode does not use grace days — gaps already do not reset you.',
    )
  }

  const violation = describeProfile(request.profile)
  if (violation) {
    throw new StakeRejectedError(
      'ramp_profile_inadmissible',
      'That combination of streak length and target cannot make a fair ladder — the daily ' +
        'values would not rise. Try a longer target or a shorter streak.',
      violation,
    )
  }
}

/** Non-throwing form, for disabling a button before the user submits. */
export function stakeRejection(request: StakeRequest): StakeRejectedError | null {
  try {
    assertStakeable(request)
    return null
  } catch (error) {
    if (error instanceof StakeRejectedError) return error
    throw error
  }
}
