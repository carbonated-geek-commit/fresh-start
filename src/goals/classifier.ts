/**
 * SPEC 03 sections 3.1 and 3.2 — size classification and the behaviour/outcome
 * rule.
 *
 * This module is deterministic and has no dependency on an LLM. That is
 * deliberate: N7 is enforced by validation, not by a model's judgement, so the
 * classifier that guards the stake boundary must be inspectable and testable.
 * The LLM decomposes prose into candidate behaviours; *this* decides what may
 * be staked.
 */

import type { SizeClass } from './schema'

/** SPEC 03 section 3.1. Duration bands, in minutes. */
export function classifyByMinutes(estMinutes: number): Exclude<SizeClass, 'x_large'> {
  if (estMinutes <= 15) return 'small'
  if (estMinutes <= 30) return 'medium'
  return 'large'
}

/**
 * Phrases that mark a *result* rather than an action.
 *
 * SPEC 03 section 3.2: "An outcome is a result that depends on factors outside
 * the user's control — physiology, other people, time, chance." Staking money
 * on an outcome means a user can do everything right and still lose, which
 * breaks the trust the whole product runs on.
 */
const OUTCOME_PATTERNS: readonly RegExp[] = [
  // Quantified change in a measured result
  /\b(increase|decrease|improve|raise|lower|drop|lose|gain|cut|boost|reduce|grow)\b[^.]{0,40}\b(\d+\s*%|\d+\s*(lbs?|pounds?|kg|kilos?|inches|cm|bpm|points?|reps?|seconds?|minutes?))/i,
  // Personal-record and performance targets
  /\b(pr|personal record|personal best|1rm|max(?:imum)? lift)\b/i,
  // Body-composition and biometric results
  /\b(lose|drop|shed|gain|put on)\b[^.]{0,20}\b(weight|fat|body fat|muscle|mass)\b/i,
  /\b(body fat|bmi|blood pressure|cholesterol|a1c|resting heart rate|vo2)\b/i,
  // Achievement framings
  /\b(get|become|be)\b[^.]{0,25}\b(fit|ripped|healthy|strong|lean|toned|rich|debt[- ]free|promoted)\b/i,
  /\b(run|finish|complete)\b[^.]{0,20}\b(a )?(marathon|half[- ]marathon|10k|5k)\b[^.]{0,20}\bunder\b/i,
  // Outcomes gated on other people
  /\b(get|land|win|receive)\b[^.]{0,25}\b(a )?(raise|promotion|job|offer|client|customers?|followers?|subscribers?)\b/i,
  // Explicit deadline on a result
  /\bby (the )?(end of|next)\b[^.]{0,20}\b(month|week|year|quarter)\b/i,
]

/**
 * Verbs that describe something the user physically does. Presence of one of
 * these does not make a phrase a behaviour on its own, but its absence in a
 * phrase that also matches an outcome pattern is strong evidence.
 */
const BEHAVIOR_VERBS: readonly RegExp[] = [
  /\b(wake|get up|rise|arrive|go|walk|run|lift|train|stretch|meditate|read|write|journal|cook|prep|log|call|text|clean|tidy|review|plan|practice|study|floss|brush|drink|take|attend|show up|sit|breathe)\b/i,
]

export interface Classification {
  readonly sizeClass: SizeClass
  /** Why, in one line. Shown to the user — the education arrives with the friction. */
  readonly rationale: string
  readonly isOutcome: boolean
}

/**
 * Classify a single candidate.
 *
 * An outcome wins over any duration estimate. "Work out 1 hour" is a large
 * behaviour; "increase my PR 50% in 30 days" is an outcome no matter what
 * duration is attached to it.
 */
export function classify(label: string, estMinutes: number | null): Classification {
  const text = label.trim()

  const outcomeHit = OUTCOME_PATTERNS.find((re) => re.test(text))
  if (outcomeHit) {
    const hasBehaviorVerb = BEHAVIOR_VERBS.some((re) => re.test(text))
    // A phrase can carry both, e.g. "run a marathon under 4 hours". The result
    // clause is what would be staked, so it classifies as an outcome.
    return {
      sizeClass: 'x_large',
      isOutcome: true,
      rationale: hasBehaviorVerb
        ? 'This names a result as well as an action. The result depends on things you do not ' +
          'control, so it stays as your reason rather than your commitment.'
        : 'This is a result rather than something you do. You could do everything right and ' +
          'still not hit it, so it is not something to stake on.',
    }
  }

  if (estMinutes === null) {
    return {
      sizeClass: 'small',
      isOutcome: false,
      rationale: 'No duration given, so this is treated as the smallest rung until you set one.',
    }
  }

  const sizeClass = classifyByMinutes(estMinutes)
  const band =
    sizeClass === 'small' ? 'under 15 minutes' : sizeClass === 'medium' ? '15 to 30 minutes' : 'over 30 minutes'
  return {
    sizeClass,
    isOutcome: false,
    rationale: `Something you do, ${band}.`,
  }
}

/**
 * Reconcile a proposed class against the deterministic one.
 *
 * The translator may propose a `size_class`; this decides the one that counts.
 * The rule is one-directional on purpose: the classifier may *demote* a
 * behaviour to `x_large`, but a proposal of `x_large` is never overridden into
 * something stakeable. Errors therefore fall on the side of not staking.
 */
export function reconcileSizeClass(
  label: string,
  estMinutes: number | null,
  proposed: SizeClass,
): Classification {
  const determined = classify(label, estMinutes)
  if (determined.isOutcome) return determined
  if (proposed === 'x_large') {
    return {
      sizeClass: 'x_large',
      isOutcome: true,
      rationale: 'Flagged as a result rather than an action, so it stays as your reason to do this.',
    }
  }
  return determined
}
