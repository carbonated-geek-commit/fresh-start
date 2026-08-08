/**
 * SPEC 03 section 3.3 — the translator contract.
 *
 * "Output is validated against the schema before use. Invalid output is
 * retried once, then surfaced as an error. Never partially applied."
 *
 * The schema is the boundary. Anything crossing it — from an LLM, from the
 * deterministic classifier, from a test — is validated by the same code.
 */

import { z } from 'zod'

/** SPEC 03 section 3.1. */
export const SIZE_CLASSES = ['small', 'medium', 'large', 'x_large'] as const
export type SizeClass = (typeof SIZE_CLASSES)[number]

/** SPEC 03 section 3.1: x_large is an outcome and is never stakeable. */
export const STAKEABLE_SIZE_CLASSES = ['small', 'medium', 'large'] as const
export type StakeableSizeClass = (typeof STAKEABLE_SIZE_CLASSES)[number]

export function isStakeable(sizeClass: SizeClass): sizeClass is StakeableSizeClass {
  return sizeClass !== 'x_large'
}

export const sizeClassSchema = z.enum(SIZE_CLASSES)

export const behaviorSchema = z.object({
  label: z.string().trim().min(1).max(120),
  size_class: sizeClassSchema,
  est_minutes: z.number().int().min(0).max(1_440).nullable(),
  rationale: z.string().trim().min(1).max(400),
})

export const translationSchema = z.object({
  motivating_outcome: z.string().trim().min(1).max(400).nullable(),
  behaviors: z.array(behaviorSchema).min(1).max(12),
  /** Labels, smallest viable rung first. */
  recommended_start: z.array(z.string().trim().min(1)).max(5),
})

export type Behavior = z.infer<typeof behaviorSchema>
export type Translation = z.infer<typeof translationSchema>

/**
 * Cross-field rules the shape alone cannot express.
 *
 * `recommended_start` must reference behaviors that exist and are stakeable —
 * recommending an outcome as a starting rung would route the user straight
 * into an N7 violation.
 */
export function checkTranslationConsistency(t: Translation): string[] {
  const problems: string[] = []
  const byLabel = new Map(t.behaviors.map((b) => [b.label, b]))

  for (const label of t.recommended_start) {
    const behavior = byLabel.get(label)
    if (!behavior) {
      problems.push(`recommended_start references an unknown behavior: ${JSON.stringify(label)}`)
      continue
    }
    if (!isStakeable(behavior.size_class)) {
      problems.push(`recommended_start proposes an outcome as a starting rung: ${JSON.stringify(label)}`)
    }
  }

  if (t.behaviors.some((b) => isStakeable(b.size_class)) && t.recommended_start.length === 0) {
    problems.push('recommended_start is empty although a stakeable behavior exists')
  }

  const labels = t.behaviors.map((b) => b.label)
  if (new Set(labels).size !== labels.length) problems.push('behavior labels are not unique')

  return problems
}

export class TranslationValidationError extends Error {
  readonly problems: string[]
  readonly raw: unknown
  constructor(problems: string[], raw: unknown) {
    super(`Translator output failed validation: ${problems.join('; ')}`)
    this.name = 'TranslationValidationError'
    this.problems = problems
    this.raw = raw
  }
}

/** Parse and cross-check. Throws `TranslationValidationError` on any problem. */
export function parseTranslation(raw: unknown): Translation {
  const parsed = translationSchema.safeParse(raw)
  if (!parsed.success) {
    throw new TranslationValidationError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      raw,
    )
  }
  const problems = checkTranslationConsistency(parsed.data)
  if (problems.length > 0) throw new TranslationValidationError(problems, raw)
  return parsed.data
}
