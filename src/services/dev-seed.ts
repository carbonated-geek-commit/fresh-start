/**
 * Demo scaffolding — local mode only.
 *
 * Settlement, the recovery day, the double, and the month-end artifact all
 * depend on a window that has partly or fully elapsed. Waiting thirty days to
 * see them is not a workable way to evaluate a proof of concept, so this
 * builds those states directly.
 *
 * **Two guards, both hard:**
 *
 *   1. Every entry point checks `isLocalMode()` and throws otherwise. With
 *      Supabase configured this code cannot run at all.
 *   2. It still calls `assertStakeable` on every commitment it creates, so the
 *      seeded data is lawful under N7 and ADR-001 — a demo fixture that could
 *      not exist in production would be a misleading demo.
 *
 * It writes through the same `Store` and emits the same SPEC 07 events as the
 * real paths, so the insights surface reads real data rather than a fiction.
 */

import { emit, type EventSink } from '@/analytics/events'
import { isLocalMode, type Session } from '@/auth'
import type { Store } from '@/data'
import { type DayKey, addDays, dayKeyInZone } from '@/engine/calendar'
import { DEFAULT_BASE_RATIO, buildRamp } from '@/engine/ramp'
import { replayWindow } from '@/engine/streak'
import type { CommitmentConfig } from '@/engine/streak/types'
import { assertStakeable } from '@/goals/stake-guard'

export class DevOnlyError extends Error {
  constructor() {
    super('Demo data is only available in local mode.')
    this.name = 'DevOnlyError'
  }
}

interface Scenario {
  readonly label: string
  readonly sizeClass: 'small' | 'medium' | 'large'
  readonly mode: 'streak' | 'consistency'
  readonly streakTarget: number
  readonly windowDays: number
  readonly stakeTargetMinor: number
  /** Days before today the window opened. */
  readonly startedDaysAgo: number
  /** Which offsets from the window start were completed. */
  readonly completedOffsets: (windowDays: number) => number[]
}

const SCENARIOS: readonly Scenario[] = [
  {
    // A finished window that fell short — the settlement decision, and the
    // month-end artifact for someone who did not hit the target.
    label: 'Ten minutes of walking',
    sizeClass: 'small',
    mode: 'streak',
    streakTarget: 12,
    windowDays: 30,
    stakeTargetMinor: 10_000,
    startedDaysAgo: 34,
    completedOffsets: (days) => Array.from({ length: days }, (_, i) => i).filter((i) => i % 3 !== 2),
  },
  {
    // Missed yesterday: today is a recovery day, the most supported moment in
    // the product (SPEC 05 section 5.4).
    label: 'A glass of water before anything else',
    sizeClass: 'small',
    mode: 'streak',
    streakTarget: 12,
    windowDays: 30,
    stakeTargetMinor: 5_000,
    startedDaysAgo: 6,
    completedOffsets: () => [0, 1, 2, 3, 4],
  },
  {
    // Twelve in a row: the streak target is reached and the double unlocks
    // (SPEC 01 section 1.6).
    label: 'Out of bed within 10 minutes of the alarm',
    sizeClass: 'small',
    mode: 'streak',
    streakTarget: 12,
    windowDays: 30,
    stakeTargetMinor: 10_000,
    startedDaysAgo: 12,
    completedOffsets: () => Array.from({ length: 12 }, (_, i) => i),
  },
]

export async function seedDemoData(
  store: Store,
  sink: EventSink,
  session: Session,
): Promise<number> {
  if (!isLocalMode()) throw new DevOnlyError()

  const profile = await store.getProfile(session.userId)
  const timeZone = profile?.timeZone ?? 'UTC'
  const today = dayKeyInZone(new Date(), timeZone)

  let created = 0

  for (const scenario of SCENARIOS) {
    const liveCount = await store.countLiveCommitments(session.userId)
    if (liveCount >= 5) break

    // The same gate the real path uses. A fixture that could not be created
    // for real is not a fixture worth demoing.
    assertStakeable({
      habitLabel: scenario.label,
      sizeClass: scenario.sizeClass,
      windowDays: scenario.windowDays,
      graceDays: 0,
      mode: scenario.mode,
      profile: {
        targetMinor: scenario.stakeTargetMinor,
        streakTarget: scenario.streakTarget,
        baseRatio: DEFAULT_BASE_RATIO,
      },
      activeCommitmentCount: liveCount,
    })

    const habit = await store.createHabit({
      userId: session.userId,
      label: scenario.label,
      sizeClass: scenario.sizeClass,
      domain: 'health',
    })

    const windowStart = addDays(today, -scenario.startedDaysAgo) as DayKey

    const record = await store.createCommitment({
      userId: session.userId,
      habitId: habit.id,
      mode: scenario.mode,
      streakTarget: scenario.streakTarget,
      windowDays: scenario.windowDays,
      stakeTargetMinor: scenario.stakeTargetMinor,
      stakeKind: 'points',
      graceDays: 0,
      baseRatioNum: Number(DEFAULT_BASE_RATIO.n),
      baseRatioDen: Number(DEFAULT_BASE_RATIO.d),
      successDestination: 'user',
      shortfallDestination: 'user',
      windowStart,
      status: 'active',
    })

    await emit(
      sink,
      'commitment_created',
      { userId: session.userId, commitmentId: record.id, occurredAt: new Date() },
      {
        mode: scenario.mode,
        streak_target: scenario.streakTarget,
        window_days: scenario.windowDays,
        stake_target_minor: scenario.stakeTargetMinor,
        stake_kind: 'points',
        grace_days: 0,
        size_class: scenario.sizeClass,
        habit_count_at_creation: liveCount + 1,
      },
    )

    // Write the sessions, then replay once and emit the events the real path
    // would have emitted day by day. Same engine, same event stream.
    const offsets = scenario
      .completedOffsets(scenario.windowDays)
      .filter((offset) => offset < scenario.startedDaysAgo)

    for (const offset of offsets) {
      const day = addDays(windowStart, offset)
      await store.insertSession(session.userId, record.id, {
        forDate: day,
        loggedAt: `${day}T08:30:00.000Z`,
        completed: true,
        note: null,
      })
    }

    const config: CommitmentConfig = {
      mode: scenario.mode,
      streakTarget: scenario.streakTarget,
      windowDays: scenario.windowDays,
      stakeTargetMinor: scenario.stakeTargetMinor,
      graceDays: 0,
      successDestination: 'user',
      shortfallDestination: 'user',
      baseRatio: DEFAULT_BASE_RATIO,
    }
    const ramp = buildRamp({
      targetMinor: scenario.stakeTargetMinor,
      streakTarget: scenario.streakTarget,
      baseRatio: DEFAULT_BASE_RATIO,
    })
    const logs = await store.listSessions(session.userId, record.id)
    const replay = replayWindow({ ramp, config, windowStart, logs, today })

    for (const transition of replay.transitions) {
      const occurredAt = new Date(`${transition.day}T20:00:00.000Z`)
      if (transition.completed) {
        await emit(
          sink,
          'session_logged',
          { userId: session.userId, commitmentId: record.id, occurredAt },
          {
            for_date: transition.day,
            logged_at: `${transition.day}T08:30:00.000Z`,
            completed: true,
            position_before: transition.positionBefore,
            position_after: transition.positionAfter,
            value_minor: transition.valueMinor,
            is_late: false,
          },
        )
        if (transition.isRecovery) {
          await emit(
            sink,
            'recovery',
            { userId: session.userId, commitmentId: record.id, occurredAt },
            { days_since_miss: transition.daysSinceMiss ?? 1 },
          )
        }
      } else {
        await emit(
          sink,
          'session_missed',
          { userId: session.userId, commitmentId: record.id, occurredAt },
          {
            for_date: transition.day,
            position_before: transition.positionBefore,
            grace_consumed: transition.graceConsumed,
          },
        )
      }
    }

    if (replay.windowElapsed) {
      await store.updateCommitmentStatus(session.userId, record.id, 'awaiting_settlement')
    }

    created++
  }

  return created
}
