/**
 * SPEC 03 sections 3.4 and 3.5 — the habit-load indicator and the size
 * staircase.
 *
 * Blueprint v0.4 section 4.3 states what this surface is for: it "earns trust
 * whether they hit or not, warns without forbidding, and makes overachieving
 * feel like a genuine win — 'I did it anyway.'"
 *
 * **The indicator warns; it never blocks.** The only hard stop is the ceiling
 * of five (SPEC 01 section 1.7), and that is enforced in `assertStakeable`,
 * not here. This module produces copy and a colour, and nothing else — which
 * is the point: the user is the ultimate arbiter (thesis).
 */

import { MAX_CONCURRENT_COMMITMENTS } from '@/goals/stake-guard'
import type { SizeClass, StakeableSizeClass } from '@/goals/schema'

export type LoadLevel = 'green' | 'yellow' | 'orange' | 'red'

export interface LoadIndicator {
  readonly level: LoadLevel
  readonly habitCount: number
  /** Remaining slots before the ceiling. Zero at five. */
  readonly remaining: number
  readonly headline: string
  /**
   * Honest heuristic at launch, replaced by observed rates once SPEC 07 data
   * exists (SPEC 03 section 3.4). Never phrased as a prediction about *this*
   * user.
   */
  readonly note: string
  /** True when the copy states an observed rate rather than the heuristic. */
  readonly dataBacked: boolean
}

/** SPEC 03 section 3.4. */
export function levelFor(habitCount: number): LoadLevel {
  if (habitCount <= 2) return 'green'
  if (habitCount === 3) return 'yellow'
  if (habitCount === 4) return 'orange'
  return 'red'
}

/**
 * Observed completion rates by habit count, once SPEC 07 has enough data to
 * support them. Passing this in swaps the heuristic copy for the real number,
 * which is the whole intent of section 3.4 — and of blueprint section 3.4,
 * "give the analysis back to the user".
 */
export interface ObservedCompletionRates {
  /** habitCount -> completion rate in 0..1. */
  readonly byHabitCount: Readonly<Record<number, number>>
  /** Minimum sample size before a rate is shown. Below it, use the heuristic. */
  readonly minSample: number
  readonly sampleByHabitCount: Readonly<Record<number, number>>
}

const HEURISTIC_NOTES: Record<LoadLevel, string> = {
  green: 'A load most people hold without much strain.',
  yellow: 'Most people find three or more hard to hold at once.',
  orange: 'Four at once is a lot. If one slips, it is usually the one you cared about least.',
  red: 'Five is the ceiling, and it is a hard one to hold. Worth being sure about the fifth.',
}

const HEADLINES: Record<LoadLevel, string> = {
  green: 'Room to spare',
  yellow: 'Getting full',
  orange: 'Heavy load',
  red: 'At the ceiling',
}

export function loadIndicator(
  habitCount: number,
  observed?: ObservedCompletionRates,
): LoadIndicator {
  const count = Math.max(0, Math.trunc(habitCount))
  const level = levelFor(count)

  const sample = observed?.sampleByHabitCount[count] ?? 0
  const rate = observed?.byHabitCount[count]
  const useObserved = observed !== undefined && rate !== undefined && sample >= observed.minSample

  const note = useObserved
    ? `People holding ${count} ${count === 1 ? 'habit' : 'habits'} complete ` +
      `${Math.round((rate as number) * 100)}% of their days.`
    : (HEURISTIC_NOTES[level] as string)

  return {
    level,
    habitCount: count,
    remaining: Math.max(0, MAX_CONCURRENT_COMMITMENTS - count),
    headline: HEADLINES[level] as string,
    note,
    dataBacked: useObserved,
  }
}

/**
 * The warning shown *before* adding one more, so the user decides with the
 * cost in front of them rather than after the fact.
 */
export function addAnotherWarning(currentCount: number): string | null {
  const next = currentCount + 1
  if (next > MAX_CONCURRENT_COMMITMENTS) {
    return `Five is the ceiling. Finish or step back from one before adding another.`
  }
  if (next <= 2) return null
  return `${loadIndicator(next).note} You can add it anyway — this is your call.`
}

/* ------------------------------------------------------------------------ */
/* SPEC 03 section 3.5 — the size staircase                                  */
/* ------------------------------------------------------------------------ */

const NEXT_RUNG: Record<StakeableSizeClass, StakeableSizeClass | null> = {
  small: 'medium',
  medium: 'large',
  large: null,
}

export interface StaircaseProposal {
  readonly from: StakeableSizeClass
  readonly to: StakeableSizeClass
  readonly headline: string
  readonly body: string
}

export interface StaircaseInput {
  readonly sizeClass: SizeClass
  readonly habitLabel: string
  /** True once the habit has held for a full window (SPEC 03 section 3.5). */
  readonly heldFullWindow: boolean
  readonly accruedMinor: number
  readonly targetMinor: number
}

/**
 * Propose the next rung up, or nothing.
 *
 * Proposal only — the user chooses (SPEC 03 section 3.5). It fires only after
 * a habit has actually held for a full window, which is blueprint section 4.4
 * in code: bank the 5:30am win first, add the hour workout once that is
 * holding.
 */
export function staircaseProposal(input: StaircaseInput): StaircaseProposal | null {
  if (!input.heldFullWindow) return null
  if (input.accruedMinor < input.targetMinor) return null
  if (input.sizeClass === 'x_large') return null

  const from = input.sizeClass
  const to = NEXT_RUNG[from]
  if (to === null) return null

  const bands: Record<StakeableSizeClass, string> = {
    small: 'under 15 minutes',
    medium: '15 to 30 minutes',
    large: 'over 30 minutes',
  }

  return {
    from,
    to,
    headline: `"${input.habitLabel}" is holding.`,
    body:
      `You ran a full window and hit the target. If you want the next rung, the same habit at ` +
      `${bands[to]} is the natural step up. Staying where you are is also a real answer — ` +
      `a habit that holds is the point.`,
  }
}
