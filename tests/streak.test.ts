/**
 * SPEC 01 sections 1.3, 1.4, 1.8 — the streak state machine.
 *
 * Includes property tests for P5 and P6 (SPEC 02 section 2.3), which are
 * accrual properties and therefore belong here rather than in the ramp suite.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type DayKey, addDays, dayRange } from '@/engine/calendar'
import { buildRamp } from '@/engine/ramp'
import {
  type CommitmentConfig,
  applyCompletion,
  applyMiss,
  initialStreakState,
  nextStatus,
  replayWindow,
} from '@/engine/streak'

const START = '2026-01-01' as DayKey

function config(overrides: Partial<CommitmentConfig> = {}): CommitmentConfig {
  return {
    mode: 'streak',
    streakTarget: 12,
    windowDays: 30,
    stakeTargetMinor: 10_000,
    graceDays: 0,
    successDestination: 'user',
    shortfallDestination: 'user',
    ...overrides,
  }
}

const ramp = buildRamp({ targetMinor: 10_000, streakTarget: 12 })

function logsFor(days: readonly DayKey[]) {
  return days.map((day) => ({
    forDate: day,
    loggedAt: `${day}T09:00:00.000Z`,
    completed: true,
    note: null,
  }))
}

describe('SPEC 01 §1.3 — streak mode', () => {
  it('a completed day increments position by one', () => {
    const c = config()
    let state = initialStreakState(c)
    state = applyCompletion(ramp, c, state, START).state
    expect(state.position).toBe(1)
    state = applyCompletion(ramp, c, state, addDays(START, 1)).state
    expect(state.position).toBe(2)
  })

  it('a session is valued at the position it was earned at, before the increment', () => {
    const c = config()
    const state = initialStreakState(c)
    const { transition } = applyCompletion(ramp, c, state, START)
    expect(transition.positionBefore).toBe(0)
    expect(transition.valueMinor).toBe(500)
    expect(transition.positionAfter).toBe(1)
  })

  it('a missed day resets position to 0 when no grace day is available', () => {
    const c = config()
    let state = initialStreakState(c)
    state = applyCompletion(ramp, c, state, START).state
    state = applyCompletion(ramp, c, state, addDays(START, 1)).state
    expect(state.position).toBe(2)

    state = applyMiss(c, state, addDays(START, 2)).state
    expect(state.position).toBe(0)
  })

  it('a miss never reduces accrued value (N3)', () => {
    const c = config()
    let state = initialStreakState(c)
    state = applyCompletion(ramp, c, state, START).state
    const earned = state.accruedMinor
    state = applyMiss(c, state, addDays(START, 1)).state
    expect(state.accruedMinor).toBe(earned)
  })
})

describe('SPEC 01 §1.3 — the grace day', () => {
  it('holds position without incrementing, is consumed once, and does not replenish', () => {
    const c = config({ graceDays: 1 })
    let state = initialStreakState(c)
    state = applyCompletion(ramp, c, state, START).state
    state = applyCompletion(ramp, c, state, addDays(START, 1)).state
    expect(state.position).toBe(2)
    expect(state.graceRemaining).toBe(1)

    // First miss: absorbed. Position held, not incremented.
    const first = applyMiss(c, state, addDays(START, 2))
    state = first.state
    expect(first.transition.graceConsumed).toBe(true)
    expect(state.position).toBe(2)
    expect(state.graceRemaining).toBe(0)

    // Second miss: nothing left to absorb it.
    const second = applyMiss(c, state, addDays(START, 3))
    state = second.state
    expect(second.transition.graceConsumed).toBe(false)
    expect(state.position).toBe(0)
  })

  it('is not available in consistency mode (SPEC 01 §1.2)', () => {
    const c = config({ mode: 'consistency', graceDays: 1 })
    expect(initialStreakState(c).graceRemaining).toBe(0)
  })
})

describe('SPEC 01 §1.3 — consistency mode', () => {
  it('increments on every completion regardless of gaps', () => {
    const c = config({ mode: 'consistency' })
    let state = initialStreakState(c)
    state = applyCompletion(ramp, c, state, START).state
    state = applyMiss(c, state, addDays(START, 1)).state
    expect(state.position).toBe(1) // gaps do not reset
    state = applyCompletion(ramp, c, state, addDays(START, 2)).state
    expect(state.position).toBe(2)
  })

  it('reaches the target on a gappy pattern that streak mode could not', () => {
    const c = config({ mode: 'consistency' })
    const everyOtherDay = dayRange(START, 30).filter((_, i) => i % 2 === 0)
    const result = replayWindow({
      ramp,
      config: c,
      windowStart: START,
      logs: logsFor(everyOtherDay),
      today: addDays(START, 29),
    })
    expect(result.state.accruedMinor).toBe(10_000)
  })
})

describe('SPEC 02 §2.5 — the structural floor', () => {
  it('true alternating over a 30-day window yields exactly 7500 in streak mode', () => {
    const c = config()
    const everyOtherDay = dayRange(START, 30).filter((_, i) => i % 2 === 0)
    const result = replayWindow({
      ramp,
      config: c,
      windowStart: START,
      logs: logsFor(everyOtherDay),
      today: addDays(START, 29),
    })
    expect(result.state.sessionsCompleted).toBe(15)
    expect(result.state.accruedMinor).toBe(7_500)
    // Nothing was confiscated; the calendar ran out.
    expect(result.state.accruedMinor).toBe(Math.floor(0.75 * 10_000))
  })
})

describe('SPEC 01 §1.4 — accrual', () => {
  it('is capped at the target, and later sessions add zero but are recorded', () => {
    const c = config({ mode: 'consistency', windowDays: 30 })
    const allDays = dayRange(START, 30)
    const result = replayWindow({
      ramp,
      config: c,
      windowStart: START,
      logs: logsFor(allDays),
      today: addDays(START, 29),
    })
    expect(result.state.accruedMinor).toBe(10_000)
    expect(result.state.sessionsCompleted).toBe(30)
    const past = result.transitions.filter((t) => t.completed && t.valueMinor === 0)
    expect(past.length).toBeGreaterThan(0)
    expect(past.every((t) => t.cappedOut)).toBe(true)
  })

  it('P5/P6: accrual is monotonic and never exceeds the target, for any pattern', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }),
        fc.constantFrom<'streak' | 'consistency'>('streak', 'consistency'),
        fc.constantFrom(0, 1),
        (pattern, mode, graceDays) => {
          const c = config({ mode, graceDays: mode === 'streak' ? graceDays : 0 })
          let state = initialStreakState(c)
          let previous = 0

          pattern.forEach((completed, index) => {
            const day = addDays(START, index)
            state = completed
              ? applyCompletion(ramp, c, state, day).state
              : applyMiss(c, state, day).state
            expect(state.accruedMinor).toBeGreaterThanOrEqual(previous) // P5
            expect(state.accruedMinor).toBeLessThanOrEqual(c.stakeTargetMinor) // P6
            previous = state.accruedMinor
          })
        },
      ),
      { numRuns: 2_000 },
    )
  })
})

describe('SPEC 05 §5.4 — recovery', () => {
  it('a completion after a miss is a recovery, and reports the gap', () => {
    const c = config()
    let state = initialStreakState(c)
    state = applyCompletion(ramp, c, state, START).state
    state = applyMiss(c, state, addDays(START, 1)).state

    const { transition } = applyCompletion(ramp, c, state, addDays(START, 2))
    expect(transition.isRecovery).toBe(true)
    expect(transition.daysSinceMiss).toBe(1)
  })

  it('the first completion of a window is not a recovery', () => {
    const c = config()
    const { transition } = applyCompletion(ramp, c, initialStreakState(c), START)
    expect(transition.isRecovery).toBe(false)
  })
})

describe('SPEC 01 §1.6 and §1.8', () => {
  it('reaching the streak target unlocks the double exactly once', () => {
    const c = config()
    const twelve = dayRange(START, 12)
    const result = replayWindow({
      ramp,
      config: c,
      windowStart: START,
      logs: logsFor(twelve),
      today: addDays(START, 20),
    })
    const unlocks = result.transitions.filter((t) => t.unlockedDouble)
    expect(unlocks).toHaveLength(1)
    expect(result.state.streakTargetReachedOn).toBe(addDays(START, 11))
  })

  it('a window that has elapsed moves to awaiting_settlement, never to abandoned', () => {
    const c = config()
    const elapsed = replayWindow({
      ramp,
      config: c,
      windowStart: START,
      logs: [],
      today: addDays(START, 40),
    })
    expect(nextStatus('active', elapsed)).toBe('awaiting_settlement')
    // Inactivity never abandons: the whole window was missed and it still is not.
    expect(nextStatus('active', elapsed)).not.toBe('abandoned')
  })

  it('today is pending, not missed, until the day has passed', () => {
    const c = config()
    const result = replayWindow({
      ramp,
      config: c,
      windowStart: START,
      logs: [],
      today: addDays(START, 2),
    })
    const statuses = result.slots.slice(0, 4).map((s) => s.status)
    expect(statuses).toEqual(['missed', 'missed', 'pending', 'future'])
  })
})
