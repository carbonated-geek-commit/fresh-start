/**
 * SPEC 02 — Ramp and Payout.
 *
 * "Highest blast radius in the codebase. This determines value owed to a user."
 *
 * Pure by construction (SPEC 02 section 2.1): every input is an argument. No
 * I/O, no database, no clock, no randomness. All arithmetic is BigInt or the
 * exact rational in ./rational. No binary float appears in any value path.
 *
 * The domain gate is ADR-001: a profile is admissible only if the ramp it
 * produces actually satisfies P1-P3. See that ADR for why no closed-form
 * precondition on (T, N, R) is trustworthy.
 */

import {
  add,
  cmp,
  div,
  mul,
  rational,
  rationalFromDecimalString,
  rationalFromNumber,
  roundHalfUp,
  sub,
  type Rational,
} from './rational'

/** SPEC 02 section 2.2 default. The first day is worth 5% of the target. */
export const DEFAULT_BASE_RATIO: Rational = rational(1n, 20n)
/** SPEC 01 section 1.2 defaults. */
export const DEFAULT_STREAK_TARGET = 12
export const DEFAULT_TARGET_MINOR = 10_000

/** SPEC 02 section 2.3 generator ranges. Admissibility partitions this space. */
export const STREAK_TARGET_MIN = 3
export const STREAK_TARGET_MAX = 60
export const TARGET_MINOR_MIN = 100
export const TARGET_MINOR_MAX = 1_000_000
export const BASE_RATIO_MIN: Rational = rational(1n, 100n)
export const BASE_RATIO_MAX: Rational = rational(1n, 5n)

export interface RampProfile {
  /** T — total value of the commitment, in integer minor units. */
  readonly targetMinor: number
  /** N — number of ramp positions. SPEC 01 section 1.2, user-configurable. */
  readonly streakTarget: number
  /** R — first-day value as a fraction of T. Exact; never a float. */
  readonly baseRatio?: Rational
}

export interface Ramp {
  readonly targetMinor: number
  readonly streakTarget: number
  readonly baseRatio: Rational
  /** base_minor — SPEC 02 section 2.2. */
  readonly baseMinor: number
  /** value[0 .. N-1]: integer minor units, strictly increasing, summing to T. */
  readonly dayValuesMinor: readonly number[]
}

/** Why a profile cannot produce a lawful ramp. ADR-001. */
export type RampDomainViolation =
  | 'streak_target_out_of_range'
  | 'target_minor_out_of_range'
  | 'target_minor_not_integer'
  | 'base_ratio_out_of_range'
  | 'not_summing_to_target' // P1
  | 'not_strictly_increasing' // P2
  | 'not_all_positive' // P3

export class RampDomainError extends Error {
  readonly violation: RampDomainViolation
  readonly profile: RampProfile

  constructor(violation: RampDomainViolation, profile: RampProfile) {
    super(
      `RampDomainError: profile { targetMinor: ${profile.targetMinor}, ` +
        `streakTarget: ${profile.streakTarget} } is inadmissible (${violation}). See ADR-001.`,
    )
    this.name = 'RampDomainError'
    this.violation = violation
    this.profile = profile
  }
}

function checkParameterRanges(p: RampProfile): RampDomainViolation | null {
  if (!Number.isInteger(p.targetMinor)) return 'target_minor_not_integer'
  if (!Number.isInteger(p.streakTarget)) return 'streak_target_out_of_range'
  if (p.streakTarget < STREAK_TARGET_MIN || p.streakTarget > STREAK_TARGET_MAX) {
    return 'streak_target_out_of_range'
  }
  if (p.targetMinor < TARGET_MINOR_MIN || p.targetMinor > TARGET_MINOR_MAX) {
    return 'target_minor_out_of_range'
  }
  const r = p.baseRatio ?? DEFAULT_BASE_RATIO
  if (cmp(r, BASE_RATIO_MIN) < 0 || cmp(r, BASE_RATIO_MAX) > 0) return 'base_ratio_out_of_range'
  return null
}

/**
 * SPEC 02 section 2.2, transcribed without deviation.
 *
 *     base_minor  = round(T * R)
 *     triangular  = N * (N - 1) / 2
 *     step_exact  = (T - N * base_minor) / triangular
 *     value[i]    = round(base_minor + step_exact * i)      for i in 0..N-2
 *     value[N-1]  = T - sum(value[0 .. N-2])
 *
 * `step_exact` stays an exact rational throughout. Only `roundHalfUp` ever
 * collapses a rational to an integer, and it does so on the whole expression.
 */
function computeUnchecked(p: RampProfile): { baseMinor: bigint; values: bigint[] } {
  const T = BigInt(p.targetMinor)
  const N = BigInt(p.streakTarget)
  const R = p.baseRatio ?? DEFAULT_BASE_RATIO

  const baseMinor = roundHalfUp(mul(rational(T), R))
  const triangular = rational((N * (N - 1n)) / 2n)
  const stepExact = div(sub(rational(T), rational(N * baseMinor)), triangular)

  const values: bigint[] = []
  let running = 0n
  for (let i = 0n; i < N - 1n; i++) {
    const v = roundHalfUp(add(rational(baseMinor), mul(stepExact, rational(i))))
    values.push(v)
    running += v
  }
  // The final element absorbs all accumulated rounding remainder, so the sum
  // is exact by construction (SPEC 02 section 2.2).
  values.push(T - running)
  return { baseMinor, values }
}

/** P1, P2 and P3, asserted against the produced values. ADR-001. */
function checkProducedValues(
  values: readonly bigint[],
  targetMinor: number,
): RampDomainViolation | null {
  let sum = 0n
  for (const v of values) {
    if (v <= 0n) return 'not_all_positive' // P3
    sum += v
  }
  if (sum !== BigInt(targetMinor)) return 'not_summing_to_target' // P1
  for (let i = 1; i < values.length; i++) {
    if ((values[i] as bigint) <= (values[i - 1] as bigint)) return 'not_strictly_increasing' // P2
  }
  return null
}

/**
 * Build the ramp for a profile, or throw.
 *
 * Every ramp this function returns satisfies P1, P2 and P3 — checked against
 * the produced values, not inferred from the parameters. A caller holding a
 * `Ramp` therefore holds a lawful one, which is what makes N3 and N4
 * structural rather than aspirational.
 */
export function buildRamp(profile: RampProfile): Ramp {
  const rangeViolation = checkParameterRanges(profile)
  if (rangeViolation) throw new RampDomainError(rangeViolation, profile)

  const { baseMinor, values } = computeUnchecked(profile)
  const produced = checkProducedValues(values, profile.targetMinor)
  if (produced) throw new RampDomainError(produced, profile)

  return {
    targetMinor: profile.targetMinor,
    streakTarget: profile.streakTarget,
    baseRatio: profile.baseRatio ?? DEFAULT_BASE_RATIO,
    baseMinor: Number(baseMinor),
    dayValuesMinor: values.map(Number),
  }
}

/** The violation, or null when the profile is admissible. Never throws. */
export function describeProfile(profile: RampProfile): RampDomainViolation | null {
  const rangeViolation = checkParameterRanges(profile)
  if (rangeViolation) return rangeViolation
  const { values } = computeUnchecked(profile)
  return checkProducedValues(values, profile.targetMinor)
}

/** Total, non-throwing admissibility predicate. Used at every boundary. */
export function isAdmissibleProfile(profile: RampProfile): boolean {
  return describeProfile(profile) === null
}

/**
 * SPEC 02 section 2.2: returns `value[position]` for position in `0..N-1`, and
 * `0` for `position >= N`. P4 — never negative, for any input at all,
 * including negative, fractional and out of range.
 */
export function rampValue(ramp: Ramp, position: number): number {
  if (!Number.isInteger(position) || position < 0) return 0
  return ramp.dayValuesMinor[position] ?? 0
}

/**
 * Which streak targets are selectable for a given stake target. The UI asks
 * this rather than offering 3..60 unconditionally — at the default ratio only
 * N <= 19 is ever admissible, and validity is not monotone in T. ADR-001.
 */
export function admissibleStreakTargets(
  targetMinor: number,
  baseRatio: Rational = DEFAULT_BASE_RATIO,
): number[] {
  const out: number[] = []
  for (let n = STREAK_TARGET_MIN; n <= STREAK_TARGET_MAX; n++) {
    if (isAdmissibleProfile({ targetMinor, streakTarget: n, baseRatio })) out.push(n)
  }
  return out
}

export { rational, rationalFromDecimalString, rationalFromNumber }
export type { Rational }
