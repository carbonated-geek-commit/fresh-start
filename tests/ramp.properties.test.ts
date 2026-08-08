/**
 * SPEC 02 section 2.3 — property tests P1 through P8.
 *
 * Generator ranges are exactly the ones the spec declares: N 3..60,
 * T 100..1000000, R 0.01..0.20. Admissibility (ADR-001) partitions that space:
 * P1-P6 are asserted on the admissible side and P8 on the inadmissible side.
 *
 * This partition is not a convenience. Sampled across the declared ranges, the
 * section 2.2 algorithm produces a non-increasing ramp in roughly 73% of
 * combinations and a negative one in roughly 50%. See ADR-001.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  RampDomainError,
  buildRamp,
  describeProfile,
  exact,
  isAdmissibleProfile,
  rampValue,
  type RampProfile,
} from '@/engine/ramp'

const profileArb = fc
  .record({
    targetMinor: fc.integer({ min: 100, max: 1_000_000 }),
    streakTarget: fc.integer({ min: 3, max: 60 }),
    ratioHundredths: fc.integer({ min: 1, max: 20 }),
  })
  .map(
    ({ targetMinor, streakTarget, ratioHundredths }): RampProfile => ({
      targetMinor,
      streakTarget,
      baseRatio: exact.rational(BigInt(ratioHundredths), 100n),
    }),
  )

const admissibleArb = profileArb.filter(isAdmissibleProfile)
const inadmissibleArb = profileArb.filter((p) => !isAdmissibleProfile(p))

const RUNS = 3_000

describe('SPEC 02 section 2.3 — admissible profiles', () => {
  it('P1: sum(value) === target_minor, exactly', () => {
    fc.assert(
      fc.property(admissibleArb, (p) => {
        const ramp = buildRamp(p)
        const sum = ramp.dayValuesMinor.reduce((a, b) => a + b, 0)
        expect(sum).toBe(p.targetMinor)
      }),
      { numRuns: RUNS },
    )
  })

  it('P2: value is strictly increasing', () => {
    fc.assert(
      fc.property(admissibleArb, (p) => {
        const v = buildRamp(p).dayValuesMinor
        for (let i = 1; i < v.length; i++) {
          expect(v[i] as number).toBeGreaterThan(v[i - 1] as number)
        }
      }),
      { numRuns: RUNS },
    )
  })

  it('P3: value[i] > 0 for all i', () => {
    fc.assert(
      fc.property(admissibleArb, (p) => {
        for (const v of buildRamp(p).dayValuesMinor) expect(v).toBeGreaterThan(0)
      }),
      { numRuns: RUNS },
    )
  })

  it('P3b: the ramp has exactly streak_target entries', () => {
    fc.assert(
      fc.property(admissibleArb, (p) => {
        expect(buildRamp(p).dayValuesMinor).toHaveLength(p.streakTarget)
      }),
      { numRuns: RUNS },
    )
  })

  it('P4: ramp_value(p) >= 0 for all p, including out of range', () => {
    fc.assert(
      fc.property(admissibleArb, fc.integer({ min: -1_000, max: 1_000 }), (p, position) => {
        expect(rampValue(buildRamp(p), position)).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: RUNS },
    )
  })

  it('P7: deterministic — same inputs, same output, always', () => {
    fc.assert(
      fc.property(admissibleArb, (p) => {
        const a = buildRamp(p)
        const b = buildRamp(p)
        expect(a.dayValuesMinor).toEqual(b.dayValuesMinor)
        expect(a.baseMinor).toBe(b.baseMinor)
      }),
      { numRuns: RUNS },
    )
  })
})

describe('SPEC 02 section 2.3 / ADR-001 — inadmissible profiles', () => {
  it('P8: an inadmissible profile is rejected and yields no ramp', () => {
    fc.assert(
      fc.property(inadmissibleArb, (p) => {
        expect(() => buildRamp(p)).toThrow(RampDomainError)
      }),
      { numRuns: RUNS },
    )
  })

  it('P8b: rejection reports a violation, never silently succeeds', () => {
    fc.assert(
      fc.property(inadmissibleArb, (p) => {
        expect(describeProfile(p)).not.toBeNull()
      }),
      { numRuns: RUNS },
    )
  })

  it('the descending-ramp case from ADR-001 is refused', () => {
    // N=6, T=1000, R=0.20 would otherwise produce 200, 187, 173, 160, 147, 133.
    const p: RampProfile = {
      targetMinor: 1_000,
      streakTarget: 6,
      baseRatio: exact.rational(1n, 5n),
    }
    expect(isAdmissibleProfile(p)).toBe(false)
    expect(describeProfile(p)).toBe('not_strictly_increasing')
    expect(() => buildRamp(p)).toThrow(RampDomainError)
  })

  it('the flat-ramp case is refused', () => {
    // N=5, T=100, R=0.20: step_exact is exactly 0, giving 20,20,20,20,20.
    const p: RampProfile = { targetMinor: 100, streakTarget: 5, baseRatio: exact.rational(1n, 5n) }
    expect(describeProfile(p)).toBe('not_strictly_increasing')
  })

  it('the last-element collision case is refused', () => {
    // N=9, T=100, R=0.05 has step_exact = 1.53 yet still ends ... 14, 16, 16.
    const p: RampProfile = { targetMinor: 100, streakTarget: 9, baseRatio: exact.rational(1n, 20n) }
    expect(describeProfile(p)).toBe('not_strictly_increasing')
  })

  it('out-of-range parameters are refused before any arithmetic runs', () => {
    expect(describeProfile({ targetMinor: 10_000, streakTarget: 2 })).toBe('streak_target_out_of_range')
    expect(describeProfile({ targetMinor: 10_000, streakTarget: 61 })).toBe('streak_target_out_of_range')
    expect(describeProfile({ targetMinor: 99, streakTarget: 12 })).toBe('target_minor_out_of_range')
    expect(describeProfile({ targetMinor: 1_000_001, streakTarget: 12 })).toBe('target_minor_out_of_range')
    expect(describeProfile({ targetMinor: 10_000.5, streakTarget: 12 })).toBe('target_minor_not_integer')
  })

  it('every ramp that exists at runtime is lawful — the partition is total', () => {
    fc.assert(
      fc.property(profileArb, (p) => {
        let ramp
        try {
          ramp = buildRamp(p)
        } catch (error) {
          expect(error).toBeInstanceOf(RampDomainError)
          return
        }
        // If it built, P1-P3 hold. No third outcome exists.
        const sum = ramp.dayValuesMinor.reduce((a, b) => a + b, 0)
        expect(sum).toBe(p.targetMinor)
        for (let i = 0; i < ramp.dayValuesMinor.length; i++) {
          expect(ramp.dayValuesMinor[i] as number).toBeGreaterThan(0)
          if (i > 0) {
            expect(ramp.dayValuesMinor[i] as number).toBeGreaterThan(
              ramp.dayValuesMinor[i - 1] as number,
            )
          }
        }
      }),
      { numRuns: 10_000 },
    )
  })
})
