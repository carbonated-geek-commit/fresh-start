/**
 * SPEC 02 section 2.4 — golden fixtures.
 *
 * "specs/fixtures/ramp-golden.json is the pinned expected output. Tests load it
 * and compare exactly. These values are authoritative — if an implementation
 * disagrees, the implementation is wrong."
 *
 * The fixture is loaded from specs/, never restated here. A test that hardcodes
 * the numbers would pass while the fixture drifted, which defeats the purpose.
 */

import { describe, expect, it } from 'vitest'
import golden from '@specs/fixtures/ramp-golden.json'
import {
  DEFAULT_BASE_RATIO,
  buildRamp,
  rampValue,
  rationalFromNumber,
} from '@/engine/ramp'
import { exact } from '@/engine/ramp'

type GoldenProfile = {
  target_minor: number
  streak_target: number
  base_ratio: number
  base_minor: number
  day_values_minor: number[]
}

const profiles = golden.profiles as unknown as Record<string, GoldenProfile>

describe('SPEC 02 section 2.4 — golden fixtures', () => {
  for (const [name, p] of Object.entries(profiles)) {
    describe(`profile: ${name}`, () => {
      const ramp = buildRamp({
        targetMinor: p.target_minor,
        streakTarget: p.streak_target,
        baseRatio: rationalFromNumber(p.base_ratio),
      })

      it('reproduces base_minor exactly', () => {
        expect(ramp.baseMinor).toBe(p.base_minor)
      })

      it('reproduces every day value exactly', () => {
        expect(ramp.dayValuesMinor).toEqual(p.day_values_minor)
      })

      it('sums to the target exactly (P1)', () => {
        const sum = ramp.dayValuesMinor.reduce((a, b) => a + b, 0)
        expect(sum).toBe(p.target_minor)
      })

      it('is strictly increasing (P2)', () => {
        for (let i = 1; i < ramp.dayValuesMinor.length; i++) {
          expect(ramp.dayValuesMinor[i] as number).toBeGreaterThan(ramp.dayValuesMinor[i - 1] as number)
        }
      })
    })
  }

  it('the default profile matches SPEC 02 section 2.2 stated values', () => {
    const ramp = buildRamp({ targetMinor: 10_000, streakTarget: 12 })
    expect(ramp.dayValuesMinor).toEqual([
      500, 561, 621, 682, 742, 803, 864, 924, 985, 1045, 1106, 1167,
    ])
  })
})

describe('SPEC 02 section 2.1 — exactness', () => {
  it('0.05 is parsed as exactly 1/20, not as its binary approximation', () => {
    const r = rationalFromNumber(0.05)
    expect(r.n).toBe(1n)
    expect(r.d).toBe(20n)
    expect(exact.cmp(r, DEFAULT_BASE_RATIO)).toBe(0)
  })

  it('rounds half away from zero', () => {
    expect(exact.roundHalfUp(exact.rational(1n, 2n))).toBe(1n)
    expect(exact.roundHalfUp(exact.rational(3n, 2n))).toBe(2n)
    expect(exact.roundHalfUp(exact.rational(-1n, 2n))).toBe(-1n)
    expect(exact.roundHalfUp(exact.rational(5n, 1n))).toBe(5n)
  })

  it('a float base ratio cannot smuggle in binary error', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754. Routed through the decimal string, the
    // ramp built from 0.15 is identical to the one built from "15/100".
    const viaNumber = buildRamp({ targetMinor: 10_000, streakTarget: 3, baseRatio: rationalFromNumber(0.15) })
    const viaRatio = buildRamp({ targetMinor: 10_000, streakTarget: 3, baseRatio: exact.rational(15n, 100n) })
    expect(viaNumber.dayValuesMinor).toEqual(viaRatio.dayValuesMinor)
  })
})

describe('SPEC 02 section 2.5 — the structural floor', () => {
  it('true alternating over a 30-day window yields exactly 7500 minor units', () => {
    const ramp = buildRamp({ targetMinor: 10_000, streakTarget: 12 })
    // Every session lands at position 0, because each miss resets the run.
    let total = 0
    let sessions = 0
    for (let day = 0; day < 30; day++) {
      if (day % 2 === 0) {
        total += rampValue(ramp, 0)
        sessions++
      }
    }
    expect(sessions).toBe(15)
    expect(total).toBe(7500)
    expect(total).toBe(Math.floor(0.75 * 10_000))
  })
})

describe('SPEC 02 section 2.2 — rampValue bounds (P4)', () => {
  const ramp = buildRamp({ targetMinor: 10_000, streakTarget: 12 })

  it('returns 0 for positions at or past the streak target', () => {
    expect(rampValue(ramp, 12)).toBe(0)
    expect(rampValue(ramp, 1_000)).toBe(0)
  })

  it('never returns a negative value for any input at all', () => {
    for (const p of [-1, -100, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 11, 12]) {
      expect(rampValue(ramp, p)).toBeGreaterThanOrEqual(0)
    }
  })
})
