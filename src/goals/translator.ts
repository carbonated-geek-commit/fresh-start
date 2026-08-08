/**
 * SPEC 03 section 3.3 — the translator contract, and the retry policy.
 *
 * "Output is validated against the schema before use. Invalid output is
 * retried once, then surfaced as an error. Never partially applied."
 *
 * Validation and reconciliation happen here, on the way back from whichever
 * provider ran. No provider is trusted to have classified correctly: the
 * deterministic classifier gets the last word on `size_class`, so N7 does not
 * depend on a model's judgement.
 */

import { reconcileSizeClass } from './classifier'
import {
  type Behavior,
  type Translation,
  TranslationValidationError,
  isStakeable,
  parseTranslation,
} from './schema'

export interface TranslatorProvider {
  readonly id: string
  /** Returns unvalidated candidate output. Throwing is a valid outcome. */
  translate(goalText: string): Promise<unknown>
}

export interface TranslatorResult {
  readonly translation: Translation
  readonly providerId: string
  /** True when the first attempt failed validation and the retry succeeded. */
  readonly retried: boolean
  /** Behaviours the classifier demoted to `x_large` against the proposal. */
  readonly reclassified: readonly string[]
}

/** SPEC 03 section 3.3: goal text only, and nothing else, ever. */
export const MAX_GOAL_LENGTH = 2_000

export class TranslatorError extends Error {
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'TranslatorError'
    this.cause = cause
  }
}

/**
 * Apply the deterministic classifier over a proposal.
 *
 * The rule is one-directional (see `reconcileSizeClass`): the classifier may
 * demote a behaviour to `x_large`, never promote an `x_large` into something
 * stakeable. A model that mislabels an outcome as `small` is corrected; a model
 * that is over-cautious is left alone.
 */
function reconcile(translation: Translation): { translation: Translation; reclassified: string[] } {
  const reclassified: string[] = []

  const behaviors: Behavior[] = translation.behaviors.map((behavior) => {
    const determined = reconcileSizeClass(behavior.label, behavior.est_minutes, behavior.size_class)
    if (determined.sizeClass !== behavior.size_class) reclassified.push(behavior.label)
    return { ...behavior, size_class: determined.sizeClass, rationale: determined.rationale }
  })

  // A reclassified behaviour may now be sitting in recommended_start, which
  // would route the user straight at an outcome. Drop it rather than fail —
  // the proposal is still useful, just one rung shorter.
  const stakeableLabels = new Set(behaviors.filter((b) => isStakeable(b.size_class)).map((b) => b.label))
  const recommendedStart = translation.recommended_start.filter((label) => stakeableLabels.has(label))

  // SPEC 03 section 3.2: an outcome remains visible as the stated "why".
  const outcome = behaviors.find((b) => b.size_class === 'x_large')
  const motivatingOutcome = translation.motivating_outcome ?? (outcome ? outcome.label : null)

  return {
    translation: {
      motivating_outcome: motivatingOutcome,
      behaviors,
      recommended_start: recommendedStart,
    },
    reclassified,
  }
}

/**
 * Run a provider, validate, reconcile.
 *
 * On a validation failure the provider is retried exactly once. A second
 * failure surfaces as a `TranslatorError` and nothing is applied — there is no
 * partial result and no silently-repaired output.
 */
export async function runTranslator(
  provider: TranslatorProvider,
  goalText: string,
): Promise<TranslatorResult> {
  const trimmed = goalText.trim()
  if (trimmed.length === 0) throw new TranslatorError('Enter a goal first.')
  if (trimmed.length > MAX_GOAL_LENGTH) {
    throw new TranslatorError(`A goal has to be under ${MAX_GOAL_LENGTH} characters.`)
  }

  let lastError: unknown = null

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: unknown
    try {
      raw = await provider.translate(trimmed)
    } catch (error) {
      lastError = error
      continue
    }

    try {
      const parsed = parseTranslation(raw)
      const { translation, reclassified } = reconcile(parsed)
      return { translation, providerId: provider.id, retried: attempt > 0, reclassified }
    } catch (error) {
      lastError = error
      if (!(error instanceof TranslationValidationError)) break
    }
  }

  throw new TranslatorError(
    'We could not break that goal into steps. Try describing it as the things you would ' +
      'actually do, one per line.',
    lastError,
  )
}
