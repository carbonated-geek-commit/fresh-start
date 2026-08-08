/**
 * SPEC 01 section 1.3 — mode selection.
 *
 * The two modes differ in exactly one respect: what a missed day does to
 * `position`. Everything else — the ramp, the accrual cap, the settlement
 * path — is shared. This module holds the user-facing framing and the
 * selection rules, not a second engine.
 *
 * Copy constraint, SPEC 05 section 5.5 and blueprint v0.4 section 6: Streak
 * mode is described as the harder, more motivating option. It must NOT be
 * described as destroying progress on a missed day, because the design does
 * not do that — earned value is never removed (N3).
 */

import type { CommitmentConfig, Mode } from '../streak/types'

export interface ModeDescriptor {
  readonly id: Mode
  readonly name: string
  /** One line, shown on the selection card. */
  readonly tagline: string
  /** What actually happens, in plain terms. No loss language. */
  readonly mechanics: string
  /** Who tends to pick it. Honest, not a prediction about the user. */
  readonly suitedTo: string
  readonly allowsGraceDay: boolean
}

export const MODES: readonly ModeDescriptor[] = [
  {
    id: 'streak',
    name: 'Streak',
    tagline: 'The harder door, and the more motivating one.',
    mechanics:
      'Each day in a row is worth more than the last. Miss a day and the ladder starts again ' +
      'from the first rung — what you have already earned stays yours.',
    suitedTo: 'People who want the pressure of a chain, and a clear moment when it pays off.',
    allowsGraceDay: true,
  },
  {
    id: 'consistency',
    name: 'Consistency',
    tagline: 'Every day counts, whenever it lands.',
    mechanics:
      'Each completed day moves you one rung up the same ladder. Gaps do not send you back — ' +
      'you pick up where you left off.',
    suitedTo: 'People with unpredictable weeks who want progress to survive a disrupted day.',
    allowsGraceDay: false,
  },
]

export const DEFAULT_MODE: Mode = 'streak'

export function describeMode(mode: Mode): ModeDescriptor {
  const found = MODES.find((m) => m.id === mode)
  if (!found) throw new RangeError(`Unknown mode: ${mode}`)
  return found
}

/** SPEC 01 section 1.2: `grace_days` is streak mode only, and is 0 or 1. */
export function normalizeGraceDays(mode: Mode, requested: number): number {
  if (mode !== 'streak') return 0
  if (!Number.isInteger(requested)) return 0
  return requested >= 1 ? 1 : 0
}

/**
 * Coerce a partial configuration into a lawful one. Applied before validation
 * so an impossible combination cannot be persisted.
 */
export function normalizeConfig(config: CommitmentConfig): CommitmentConfig {
  return { ...config, graceDays: normalizeGraceDays(config.mode, config.graceDays) }
}

/**
 * The double (SPEC 01 section 1.6) is a *new* commitment at twice the stake,
 * never a modification of the existing one, and always opt-in.
 */
export function doubledConfigFrom(source: CommitmentConfig, remainingDays: number): CommitmentConfig {
  return {
    ...source,
    stakeTargetMinor: source.stakeTargetMinor * 2,
    windowDays: Math.max(1, remainingDays),
  }
}
