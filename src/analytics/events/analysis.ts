/**
 * SPEC 07 sections 7.1, 7.3 and 7.4 — the analyses.
 *
 * Every function here computes from the section 7.2 event stream alone. That
 * is the acceptance criterion for T17, and it is why these live next to the
 * schema rather than in a warehouse: if an analysis needs a field the stream
 * does not carry, it fails to compile, and the gap is found now rather than in
 * month two when it is unfixable.
 *
 * Section 7.4 makes these a product feature, not an internal tool: the same
 * functions run over one user's own events and the result is shown to them.
 */

import type { AnalyticsEvent, EventPayload } from './schema'

type Named<N extends AnalyticsEvent['name']> = Extract<AnalyticsEvent, { name: N }>

function of<N extends AnalyticsEvent['name']>(events: readonly AnalyticsEvent[], name: N): Named<N>[] {
  return events.filter((e): e is Named<N> => e.name === name)
}

export interface Rate {
  readonly numerator: number
  readonly denominator: number
  /** Null when the denominator is zero — distinct from a rate of zero. */
  readonly rate: number | null
}

function rate(numerator: number, denominator: number): Rate {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator }
}

/* ------------------------------------------------------------------------ */
/* 7.3 — recovery rate after the first miss                                  */
/* ------------------------------------------------------------------------ */

/**
 * "The highest-leverage number in the product."
 *
 * Denominator is misses that were not absorbed by a grace day — a grace day is
 * not a miss the user has to come back from. Numerator is recovery events.
 */
export function recoveryRate(events: readonly AnalyticsEvent[]): Rate {
  const misses = of(events, 'session_missed').filter((e) => !e.payload.grace_consumed)
  const recoveries = of(events, 'recovery')
  return rate(recoveries.length, misses.length)
}

/** Recovery rate counting only each commitment's *first* miss. */
export function recoveryRateAfterFirstMiss(events: readonly AnalyticsEvent[]): Rate {
  const firstMissAt = new Map<string, string>()
  for (const e of ordered(of(events, 'session_missed'))) {
    if (e.commitment_id === null || e.payload.grace_consumed) continue
    if (!firstMissAt.has(e.commitment_id)) firstMissAt.set(e.commitment_id, e.occurred_at)
  }

  let recovered = 0
  for (const [commitmentId, missedAt] of firstMissAt) {
    const returned = of(events, 'recovery').some(
      (r) => r.commitment_id === commitmentId && r.occurred_at >= missedAt,
    )
    if (returned) recovered++
  }
  return rate(recovered, firstMissAt.size)
}

/* ------------------------------------------------------------------------ */
/* 7.3 — day-of-first-miss distribution                                      */
/* ------------------------------------------------------------------------ */

/** `position_before` at each commitment's first miss — where the nudge belongs. */
export function dayOfFirstMissDistribution(
  events: readonly AnalyticsEvent[],
): Map<number, number> {
  const seen = new Set<string>()
  const distribution = new Map<number, number>()

  for (const e of ordered(of(events, 'session_missed'))) {
    if (e.commitment_id === null || e.payload.grace_consumed) continue
    if (seen.has(e.commitment_id)) continue
    seen.add(e.commitment_id)
    const day = e.payload.position_before
    distribution.set(day, (distribution.get(day) ?? 0) + 1)
  }
  return distribution
}

/* ------------------------------------------------------------------------ */
/* 7.3 — completion rate, sliced                                             */
/* ------------------------------------------------------------------------ */

export type Slice = 'mode' | 'stake_kind' | 'partner_present' | 'habit_count' | 'size_class'

/**
 * Completion rate per slice, keyed by the slice value.
 *
 * Denominator is logged plus missed days for commitments in that slice —
 * which is exactly what the stream carries, with no join to a calendar.
 */
export function completionRateBy(
  events: readonly AnalyticsEvent[],
  slice: Slice,
): Map<string, Rate> {
  const configs = new Map<string, EventPayload<'commitment_created'>>()
  for (const e of of(events, 'commitment_created')) {
    if (e.commitment_id !== null) configs.set(e.commitment_id, e.payload)
  }

  const partnered = new Set(
    of(events, 'partner_added')
      .map((e) => e.commitment_id)
      .filter((id): id is string => id !== null),
  )

  const keyFor = (commitmentId: string): string | null => {
    const config = configs.get(commitmentId)
    if (!config) return null
    switch (slice) {
      case 'mode':
        return config.mode
      case 'stake_kind':
        return config.stake_kind
      case 'size_class':
        return config.size_class
      case 'habit_count':
        return String(config.habit_count_at_creation)
      case 'partner_present':
        return partnered.has(commitmentId) ? 'with_partner' : 'solo'
    }
  }

  const completed = new Map<string, number>()
  const total = new Map<string, number>()
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)

  for (const e of of(events, 'session_logged')) {
    if (e.commitment_id === null) continue
    const key = keyFor(e.commitment_id)
    if (key === null) continue
    bump(total, key)
    if (e.payload.completed) bump(completed, key)
  }
  for (const e of of(events, 'session_missed')) {
    if (e.commitment_id === null) continue
    const key = keyFor(e.commitment_id)
    if (key === null) continue
    bump(total, key)
  }

  const out = new Map<string, Rate>()
  for (const [key, denominator] of total) out.set(key, rate(completed.get(key) ?? 0, denominator))
  return out
}

/* ------------------------------------------------------------------------ */
/* 7.1 — the primary proof metric                                            */
/* ------------------------------------------------------------------------ */

export interface ContinuationResult {
  /** Users who completed a window and then started another at a lower stake. */
  readonly continuedAtLowerStake: number
  /** Users who completed a window at all — the denominator. */
  readonly completedAWindow: number
  readonly rate: number | null
  /** Completion rate in the *second* window, at the reduced stake. */
  readonly secondWindowCompletion: Rate
}

/**
 * **Month-2 continuation at reduced or zero stake** — SPEC 07 section 7.1.
 *
 * "If a user completes a window and keeps logging in month 2 without the same
 * incentive, the behavior stuck. If completions collapse when the stake drops,
 * you bought compliance, not a habit."
 *
 * Computed from `settlement` (a completed window) plus a later
 * `commitment_created` whose `stake_target_minor` is lower, plus the
 * `session_logged` events belonging to it. No other instrumentation needed —
 * which is the acceptance criterion.
 */
export function monthTwoContinuation(events: readonly AnalyticsEvent[]): ContinuationResult {
  const created = ordered(of(events, 'commitment_created'))
  const settlements = ordered(of(events, 'settlement'))

  const completedByUser = new Map<string, { at: string; targetMinor: number }>()
  for (const s of settlements) {
    if (s.payload.accrued_minor < s.payload.target_minor) continue
    const existing = completedByUser.get(s.user_id)
    if (!existing || s.occurred_at < existing.at) {
      completedByUser.set(s.user_id, { at: s.occurred_at, targetMinor: s.payload.target_minor })
    }
  }

  const continuationCommitments = new Set<string>()
  for (const [userId, first] of completedByUser) {
    const next = created.find(
      (c) =>
        c.user_id === userId &&
        c.occurred_at > first.at &&
        c.payload.stake_target_minor < first.targetMinor,
    )
    if (next?.commitment_id) continuationCommitments.add(next.commitment_id)
  }

  let completedDays = 0
  let totalDays = 0
  for (const e of of(events, 'session_logged')) {
    if (e.commitment_id === null || !continuationCommitments.has(e.commitment_id)) continue
    totalDays++
    if (e.payload.completed) completedDays++
  }
  for (const e of of(events, 'session_missed')) {
    if (e.commitment_id === null || !continuationCommitments.has(e.commitment_id)) continue
    totalDays++
  }

  const denominator = completedByUser.size
  return {
    continuedAtLowerStake: continuationCommitments.size,
    completedAWindow: denominator,
    rate: denominator === 0 ? null : continuationCommitments.size / denominator,
    secondWindowCompletion: rate(completedDays, totalDays),
  }
}

/* ------------------------------------------------------------------------ */
/* 7.4 — give the analysis back to the user                                  */
/* ------------------------------------------------------------------------ */

export interface PersonalInsight {
  readonly headline: string
  readonly detail: string
  /** Events the claim rests on. Shown so the user can weigh it. */
  readonly sampleSize: number
}

/**
 * Run the same analysis on one user's own data and show it to them.
 *
 * "You complete 4× more often when you log before 9am." Section 7.4 calls this
 * the primary justification for holding the data at all, and requires it be
 * treated as a product feature.
 *
 * Every insight is suppressed below a sample floor — a claim from four days of
 * data is a coin flip dressed as a finding, and the trust cost is not worth it.
 */
export function personalInsights(
  events: readonly AnalyticsEvent[],
  options: { readonly minSample?: number; readonly timeZone?: string } = {},
): PersonalInsight[] {
  const minSample = options.minSample ?? 10
  const timeZone = options.timeZone ?? 'UTC'
  const insights: PersonalInsight[] = []

  const logs = of(events, 'session_logged')
  const misses = of(events, 'session_missed')

  // --- Early logging ---
  const hourOf = (iso: string): number => {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hour12: false,
    }).format(new Date(iso))
    return Number.parseInt(formatted, 10)
  }

  const early = logs.filter((e) => e.payload.completed && hourOf(e.payload.logged_at) < 9).length
  const late = logs.filter((e) => e.payload.completed && hourOf(e.payload.logged_at) >= 9).length
  if (early + late >= minSample && early > 0 && late > 0) {
    const ratio = early / late
    if (ratio >= 1.5) {
      insights.push({
        headline: `You complete ${ratio.toFixed(1)}× more often when you log before 9am.`,
        detail: 'Getting it done early looks like the strongest single lever you have.',
        sampleSize: early + late,
      })
    }
  }

  // --- Recovery ---
  const recovery = recoveryRate(events)
  if (recovery.denominator >= Math.max(3, Math.floor(minSample / 3)) && recovery.rate !== null) {
    insights.push({
      headline: `You come back after ${Math.round(recovery.rate * 100)}% of missed days.`,
      detail:
        'Coming back is the number that predicts whether a habit holds — more than a clean run does.',
      sampleSize: recovery.denominator,
    })
  }

  // --- Load ---
  const byCount = completionRateBy(events, 'habit_count')
  const entries = [...byCount.entries()].filter(([, r]) => r.denominator >= minSample)
  if (entries.length >= 2) {
    entries.sort((a, b) => (b[1].rate ?? 0) - (a[1].rate ?? 0))
    const best = entries[0] as [string, Rate]
    const worst = entries[entries.length - 1] as [string, Rate]
    if ((best[1].rate ?? 0) - (worst[1].rate ?? 0) >= 0.15) {
      insights.push({
        headline: `You complete most reliably when you are holding ${best[0]} at a time.`,
        detail:
          `${Math.round((best[1].rate as number) * 100)}% at ${best[0]}, versus ` +
          `${Math.round((worst[1].rate as number) * 100)}% at ${worst[0]}.`,
        sampleSize: best[1].denominator + worst[1].denominator,
      })
    }
  }

  // --- Total days held ---
  const totalCompleted = logs.filter((e) => e.payload.completed).length
  if (totalCompleted > 0) {
    insights.push({
      headline: `${totalCompleted} ${totalCompleted === 1 ? 'day' : 'days'} done.`,
      detail:
        misses.length > 0
          ? `Across ${totalCompleted + misses.length} days you showed up for ${totalCompleted}.`
          : 'Every day you committed to, you did.',
      sampleSize: totalCompleted + misses.length,
    })
  }

  return insights
}

function ordered<T extends { occurred_at: string }>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : a.occurred_at > b.occurred_at ? 1 : 0))
}
