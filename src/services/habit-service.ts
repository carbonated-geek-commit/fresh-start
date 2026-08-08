/**
 * The service layer.
 *
 * ADR-002. Every gate the invariants depend on is applied here, once, so no
 * surface can skip one:
 *
 *   - `assertStakeable` before any commitment write (N7, ADR-001)
 *   - `acceptLog` before any session write (SPEC 05 sections 5.1, 5.2)
 *   - `settle` only with a caller-supplied user-action instant (N5)
 *   - SPEC 07 events emitted alongside the state change, not batched later
 *
 * The engine stays pure: this module reads the clock and the store, and passes
 * `today` and state into the engine as arguments.
 */

import { emit, type EventSink } from '@/analytics/events'
import { type DayKey, addDays, dayKeyInZone } from '@/engine/calendar'
import {
  type Ramp,
  buildRamp,
  DEFAULT_BASE_RATIO,
  exact,
  rampValue,
} from '@/engine/ramp'
import { doubledConfigFrom, normalizeConfig } from '@/engine/modes'
import { acknowledgeRecovery, isRecoveryPending, daysSinceOpenMiss } from '@/engine/recovery'
import {
  type CommitmentConfig,
  type DaySlot,
  type ReplayResult,
  type StreakState,
  nextStatus,
  pendingValueMinor,
  replayWindow,
} from '@/engine/streak'
import { assertStakeable, MAX_CONCURRENT_COMMITMENTS } from '@/goals/stake-guard'
import { loadIndicator, staircaseProposal, type LoadIndicator, type StaircaseProposal } from '@/habits/load'
import { acceptLog, loggableDays } from '@/logging'
import { DEFAULT_SCHEDULE, normalizeSchedule, planDailyNudges, type PlannedNudge } from '@/nudges'
import { destinationOptions, settle, settlementPrompt } from '@/settlement/stub'
import type { Session } from '@/auth'
import type {
  CommitmentRecord,
  Habit,
  Profile,
  SettlementRecord,
  Store,
} from '@/data'
import type { SettlementDestination, SizeClass } from './types'

export interface CommitmentView {
  readonly commitment: CommitmentRecord
  readonly habit: Habit
  readonly ramp: Ramp
  readonly state: StreakState
  readonly replay: ReplayResult
  readonly slots: readonly DaySlot[]
  /** What today's completion would be worth. */
  readonly pendingValueMinor: number
  readonly percentOfTarget: number
  readonly isRecoveryDay: boolean
  readonly daysSinceMiss: number | null
  readonly daysCompleted: number
  readonly loggableDays: readonly DayKey[]
  readonly loggedToday: boolean
  readonly awaitingSettlement: boolean
  readonly settlement: SettlementRecord | null
  readonly staircase: StaircaseProposal | null
  /** SPEC 01 section 1.6. Offered once the streak target is reached. */
  readonly doubleAvailable: boolean
}

export interface Dashboard {
  readonly profile: Profile
  readonly today: DayKey
  readonly commitments: readonly CommitmentView[]
  readonly load: LoadIndicator
  readonly nudges: readonly PlannedNudge[]
  readonly canAddMore: boolean
}

function configOf(record: CommitmentRecord): CommitmentConfig {
  return normalizeConfig({
    mode: record.mode,
    streakTarget: record.streakTarget,
    windowDays: record.windowDays,
    stakeTargetMinor: record.stakeTargetMinor,
    graceDays: record.graceDays,
    successDestination: record.successDestination,
    shortfallDestination: record.shortfallDestination,
    baseRatio: exact.rational(BigInt(record.baseRatioNum), BigInt(record.baseRatioDen)),
  })
}

async function ensureProfile(store: Store, session: Session): Promise<Profile> {
  const existing = await store.getProfile(session.userId)
  if (existing) return existing
  return store.upsertProfile({
    userId: session.userId,
    displayName: session.displayName,
    timeZone: DEFAULT_SCHEDULE.timeZone,
    morningCue: DEFAULT_SCHEDULE.morningCue,
    eveningCheck: DEFAULT_SCHEDULE.eveningCheck,
  })
}

/** Build the full view of one commitment. Pure once the reads are done. */
async function buildView(
  store: Store,
  session: Session,
  record: CommitmentRecord,
  today: DayKey,
): Promise<CommitmentView | null> {
  const habit = await store.getHabit(session.userId, record.habitId)
  if (!habit) return null

  const config = configOf(record)
  const ramp = buildRamp({
    targetMinor: config.stakeTargetMinor,
    streakTarget: config.streakTarget,
    baseRatio: config.baseRatio ?? DEFAULT_BASE_RATIO,
  })

  const logs = await store.listSessions(session.userId, record.id)
  const replay = replayWindow({ ramp, config, windowStart: record.windowStart, logs, today })
  const settlement = await store.getSettlement(session.userId, record.id)

  const completedDates = new Set(logs.filter((l) => l.completed).map((l) => l.forDate))
  const status = nextStatus(record.status, replay)
  const heldFullWindow = replay.windowElapsed && replay.state.accruedMinor >= config.stakeTargetMinor

  return {
    commitment: { ...record, status },
    habit,
    ramp,
    state: replay.state,
    replay,
    slots: replay.slots,
    pendingValueMinor: pendingValueMinor(ramp, config, replay.state),
    percentOfTarget: Math.floor((replay.state.accruedMinor * 100) / config.stakeTargetMinor),
    isRecoveryDay: isRecoveryPending(replay.state, today),
    daysSinceMiss: daysSinceOpenMiss(replay.state, today),
    daysCompleted: replay.state.sessionsCompleted,
    loggableDays: loggableDays(today, replay.windowStart, replay.windowEnd).filter(
      (day) => !completedDates.has(day),
    ),
    loggedToday: completedDates.has(today),
    awaitingSettlement: status === 'awaiting_settlement' && settlement === null,
    settlement,
    staircase: staircaseProposal({
      sizeClass: habit.sizeClass,
      habitLabel: habit.label,
      heldFullWindow,
      accruedMinor: replay.state.accruedMinor,
      targetMinor: config.stakeTargetMinor,
    }),
    doubleAvailable:
      replay.state.streakTargetReachedOn !== null &&
      !replay.windowElapsed &&
      record.doubledFromCommitmentId === null,
  }
}

export async function loadDashboard(store: Store, session: Session): Promise<Dashboard> {
  const profile = await ensureProfile(store, session)
  const today = dayKeyInZone(new Date(), profile.timeZone)

  const records = await store.listCommitments(session.userId)
  const live = records.filter((r) => r.status !== 'settled' && r.status !== 'abandoned')

  const views: CommitmentView[] = []
  for (const record of records) {
    const view = await buildView(store, session, record, today)
    if (view) views.push(view)
  }

  const schedule = normalizeSchedule({
    morningCue: profile.morningCue,
    eveningCheck: profile.eveningCheck,
    timeZone: profile.timeZone,
  })

  const nudges: PlannedNudge[] = []
  for (const view of views) {
    if (view.commitment.status !== 'active') continue
    nudges.push(
      ...planDailyNudges({
        commitmentId: view.commitment.id,
        habitLabel: view.habit.label,
        schedule,
        state: view.state,
        loggedToday: view.loggedToday,
        now: new Date(),
      }),
    )
  }

  return {
    profile,
    today,
    commitments: views,
    load: loadIndicator(live.length),
    nudges,
    canAddMore: live.length < MAX_CONCURRENT_COMMITMENTS,
  }
}

/* ------------------------------------------------------------------------ */
/* Creating a commitment — the N7 gate                                       */
/* ------------------------------------------------------------------------ */

export interface CreateCommitmentRequest {
  readonly label: string
  readonly sizeClass: SizeClass
  readonly motivatingOutcome?: string | null
  readonly mode: 'streak' | 'consistency'
  readonly streakTarget: number
  readonly windowDays: number
  readonly stakeTargetMinor: number
  readonly graceDays: number
  readonly shortfallDestination: SettlementDestination
  readonly domain?: string
}

export async function createCommitment(
  store: Store,
  sink: EventSink,
  session: Session,
  request: CreateCommitmentRequest,
): Promise<CommitmentRecord> {
  const profile = await ensureProfile(store, session)
  const liveCount = await store.countLiveCommitments(session.userId)

  const profileRatio = DEFAULT_BASE_RATIO

  // The gate. N7 and ADR-001, at the persistence boundary — not in the UI.
  assertStakeable({
    habitLabel: request.label,
    sizeClass: request.sizeClass,
    windowDays: request.windowDays,
    graceDays: request.graceDays,
    mode: request.mode,
    profile: {
      targetMinor: request.stakeTargetMinor,
      streakTarget: request.streakTarget,
      baseRatio: profileRatio,
    },
    activeCommitmentCount: liveCount,
  })

  const habit = await store.createHabit({
    userId: session.userId,
    label: request.label,
    sizeClass: request.sizeClass,
    motivatingOutcome: request.motivatingOutcome ?? null,
    domain: request.domain ?? 'health',
  })

  const today = dayKeyInZone(new Date(), profile.timeZone)

  const record = await store.createCommitment({
    userId: session.userId,
    habitId: habit.id,
    mode: request.mode,
    streakTarget: request.streakTarget,
    windowDays: request.windowDays,
    stakeTargetMinor: request.stakeTargetMinor,
    // v1 is points only (thesis, v1 scope). Recorded so SPEC 07 section 7.3's
    // points-versus-currency comparison is computable when currency exists.
    stakeKind: 'points',
    graceDays: request.mode === 'streak' ? request.graceDays : 0,
    baseRatioNum: Number(profileRatio.n),
    baseRatioDen: Number(profileRatio.d),
    successDestination: 'user',
    shortfallDestination: request.shortfallDestination,
    windowStart: today,
    status: 'active',
  })

  await emit(
    sink,
    'commitment_created',
    { userId: session.userId, commitmentId: record.id, occurredAt: new Date() },
    {
      mode: record.mode,
      streak_target: record.streakTarget,
      window_days: record.windowDays,
      stake_target_minor: record.stakeTargetMinor,
      stake_kind: 'points',
      grace_days: record.graceDays,
      size_class: habit.sizeClass,
      habit_count_at_creation: liveCount + 1,
    },
  )

  return record
}

/* ------------------------------------------------------------------------ */
/* Logging a session                                                         */
/* ------------------------------------------------------------------------ */

export interface LogResult {
  readonly valueMinor: number
  readonly isLate: boolean
  readonly latenessNudge: string | null
  readonly recovery: ReturnType<typeof acknowledgeRecovery> | null
  readonly unlockedDouble: boolean
  readonly cappedOut: boolean
}

export async function logSession(
  store: Store,
  sink: EventSink,
  session: Session,
  commitmentId: string,
  forDate: DayKey,
  completed: boolean,
  note?: string | null,
): Promise<LogResult> {
  const profile = await ensureProfile(store, session)
  const today = dayKeyInZone(new Date(), profile.timeZone)

  const record = await store.getCommitment(session.userId, commitmentId)
  if (!record) throw new Error('No such commitment.')

  const config = configOf(record)
  const ramp = buildRamp({
    targetMinor: config.stakeTargetMinor,
    streakTarget: config.streakTarget,
    baseRatio: config.baseRatio ?? DEFAULT_BASE_RATIO,
  })

  const existing = await store.listSessions(session.userId, commitmentId)
  const windowEnd = addDays(record.windowStart, record.windowDays - 1)

  // SPEC 05 sections 5.1 and 5.2. Rejects a future day and anything more than
  // one day back; accepts a late log at full value.
  const accepted = acceptLog({
    forDate,
    today,
    windowStart: record.windowStart,
    windowEnd,
    completed,
    note: note ?? null,
    existingDates: new Set(existing.map((s) => s.forDate)),
    loggedAt: new Date(),
  })

  const before = replayWindow({ ramp, config, windowStart: record.windowStart, logs: existing, today })

  await store.insertSession(session.userId, commitmentId, accepted.log)

  const after = replayWindow({
    ramp,
    config,
    windowStart: record.windowStart,
    logs: [...existing, accepted.log],
    today,
  })

  const transition = after.transitions.find((t) => t.day === forDate) ?? null
  const valueMinor = transition?.valueMinor ?? 0

  await emit(
    sink,
    'session_logged',
    { userId: session.userId, commitmentId, occurredAt: new Date() },
    {
      for_date: forDate,
      logged_at: accepted.log.loggedAt,
      completed: accepted.log.completed,
      position_before: transition?.positionBefore ?? before.state.position,
      position_after: transition?.positionAfter ?? after.state.position,
      value_minor: valueMinor,
      is_late: accepted.isLate,
    },
  )

  // SPEC 05 section 5.4 / SPEC 07 section 7.2.
  let recovery: ReturnType<typeof acknowledgeRecovery> | null = null
  if (transition?.isRecovery) {
    const days = transition.daysSinceMiss ?? 1
    recovery = acknowledgeRecovery(days)
    await emit(
      sink,
      'recovery',
      { userId: session.userId, commitmentId, occurredAt: new Date() },
      { days_since_miss: days },
    )
  }

  // Misses become visible only once the day has passed, so emitting them here
  // (rather than from a job) keeps the stream complete without a scheduler.
  const knownMisses = new Set(before.transitions.filter((t) => !t.completed).map((t) => t.day))
  for (const t of after.transitions) {
    if (t.completed || knownMisses.has(t.day)) continue
    await emit(
      sink,
      'session_missed',
      { userId: session.userId, commitmentId, occurredAt: new Date() },
      { for_date: t.day, position_before: t.positionBefore, grace_consumed: t.graceConsumed },
    )
  }

  if (transition?.unlockedDouble) {
    await emit(
      sink,
      'double_offered',
      { userId: session.userId, commitmentId, occurredAt: new Date() },
      { source_commitment_id: commitmentId },
    )
  }

  return {
    valueMinor,
    isLate: accepted.isLate,
    latenessNudge: accepted.latenessNudge,
    recovery,
    unlockedDouble: transition?.unlockedDouble ?? false,
    cappedOut: transition?.cappedOut ?? false,
  }
}

/* ------------------------------------------------------------------------ */
/* Settlement — N5                                                           */
/* ------------------------------------------------------------------------ */

export interface SettlementView {
  readonly commitmentId: string
  readonly habitLabel: string
  readonly accruedMinor: number
  readonly targetMinor: number
  readonly daysCompleted: number
  readonly prompt: ReturnType<typeof settlementPrompt>
  readonly options: ReturnType<typeof destinationOptions>
  readonly currentChoice: SettlementDestination
}

export async function settlementView(
  store: Store,
  session: Session,
  commitmentId: string,
): Promise<SettlementView | null> {
  const profile = await ensureProfile(store, session)
  const today = dayKeyInZone(new Date(), profile.timeZone)
  const record = await store.getCommitment(session.userId, commitmentId)
  if (!record) return null

  const view = await buildView(store, session, record, today)
  if (!view) return null

  return {
    commitmentId,
    habitLabel: view.habit.label,
    accruedMinor: view.state.accruedMinor,
    targetMinor: record.stakeTargetMinor,
    daysCompleted: view.daysCompleted,
    prompt: settlementPrompt(view.state.accruedMinor, record.stakeTargetMinor, view.daysCompleted),
    options: destinationOptions(Math.max(0, record.stakeTargetMinor - view.state.accruedMinor)),
    currentChoice: record.shortfallDestination,
  }
}

/**
 * Settle.
 *
 * `userActionAt` is passed in from the request that the user's click produced.
 * N5 says settlement resolves only on an explicit user action, and nothing in
 * this repository calls this from a timer — `grep -rn "settleCommitment" src`
 * is the audit.
 */
export async function settleCommitment(
  store: Store,
  sink: EventSink,
  session: Session,
  commitmentId: string,
  destination: SettlementDestination,
  userActionAt: Date,
): Promise<void> {
  const profile = await ensureProfile(store, session)
  const today = dayKeyInZone(new Date(), profile.timeZone)
  const record = await store.getCommitment(session.userId, commitmentId)
  if (!record) throw new Error('No such commitment.')
  if (await store.getSettlement(session.userId, commitmentId)) {
    throw new Error('This commitment is already settled.')
  }

  const view = await buildView(store, session, record, today)
  if (!view) throw new Error('No such commitment.')
  if (!view.replay.windowElapsed) throw new Error('This window has not finished yet.')

  const result = await settle({
    commitmentId,
    userId: session.userId,
    accruedMinor: view.state.accruedMinor,
    targetMinor: record.stakeTargetMinor,
    destination,
    userActionAt,
  })

  await store.insertSettlement({
    commitmentId,
    userId: session.userId,
    accruedMinor: result.settledMinor,
    targetMinor: record.stakeTargetMinor,
    destination: result.destination,
    userActionAt: result.userActionAt,
    rail: result.rail,
  })
  await store.updateCommitmentStatus(session.userId, commitmentId, 'settled')

  await emit(
    sink,
    'settlement',
    { userId: session.userId, commitmentId, occurredAt: new Date() },
    {
      accrued_minor: result.settledMinor,
      target_minor: record.stakeTargetMinor,
      destination: result.destination,
      user_action_at: result.userActionAt,
    },
  )
}

/* ------------------------------------------------------------------------ */
/* The double — SPEC 01 section 1.6                                          */
/* ------------------------------------------------------------------------ */

/**
 * Accept the double.
 *
 * "It is never a modification of the existing commitment, and it is always
 * opt-in." So this creates a new commitment and leaves the source untouched.
 */
export async function acceptDouble(
  store: Store,
  sink: EventSink,
  session: Session,
  sourceCommitmentId: string,
): Promise<CommitmentRecord> {
  const profile = await ensureProfile(store, session)
  const today = dayKeyInZone(new Date(), profile.timeZone)
  const source = await store.getCommitment(session.userId, sourceCommitmentId)
  if (!source) throw new Error('No such commitment.')

  const view = await buildView(store, session, source, today)
  if (!view?.doubleAvailable) throw new Error('The double is not available for this commitment.')

  const remainingDays = Math.max(
    1,
    source.windowDays -
      view.slots.filter((s) => s.status !== 'future').length,
  )
  const doubled = doubledConfigFrom(configOf(source), remainingDays)
  const liveCount = await store.countLiveCommitments(session.userId)

  assertStakeable({
    habitLabel: view.habit.label,
    sizeClass: view.habit.sizeClass,
    windowDays: doubled.windowDays,
    graceDays: doubled.graceDays,
    mode: doubled.mode,
    profile: {
      targetMinor: doubled.stakeTargetMinor,
      streakTarget: doubled.streakTarget,
      baseRatio: doubled.baseRatio ?? DEFAULT_BASE_RATIO,
    },
    activeCommitmentCount: liveCount,
  })

  const record = await store.createCommitment({
    userId: session.userId,
    habitId: source.habitId,
    mode: doubled.mode,
    streakTarget: doubled.streakTarget,
    windowDays: doubled.windowDays,
    stakeTargetMinor: doubled.stakeTargetMinor,
    stakeKind: 'points',
    graceDays: doubled.graceDays,
    baseRatioNum: source.baseRatioNum,
    baseRatioDen: source.baseRatioDen,
    successDestination: source.successDestination,
    shortfallDestination: source.shortfallDestination,
    windowStart: today,
    status: 'active',
    doubledFromCommitmentId: sourceCommitmentId,
  })

  await emit(
    sink,
    'double_accepted',
    { userId: session.userId, commitmentId: record.id, occurredAt: new Date() },
    { source_commitment_id: sourceCommitmentId },
  )

  return record
}

/**
 * SPEC 01 section 1.8: `abandoned` requires an explicit user action, and
 * inactivity never abandons a commitment. This is the only path to that state.
 */
export async function abandonCommitment(
  store: Store,
  session: Session,
  commitmentId: string,
): Promise<void> {
  await store.updateCommitmentStatus(session.userId, commitmentId, 'abandoned')
}

export { rampValue }
