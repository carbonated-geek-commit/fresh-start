/**
 * The deterministic translator provider.
 *
 * This is the default. It requires no credential, no network call, and no
 * third party — which is what makes the zero-credential development mode in
 * `.env.example` real rather than aspirational, and what makes the N7 test
 * suite reproducible.
 *
 * It decomposes a goal by splitting on the connectives people actually use
 * when they state one ("wake at 5, get to the gym by 5:30, and increase my PR
 * 50%"), then classifies each clause with the shared classifier. It is
 * deliberately unclever: the LLM provider exists for the cases this cannot
 * read, and the classifier — not the decomposition — is what guards the stake.
 */

import { classify, classifyByMinutes } from '../classifier'
import type { Behavior, Translation } from '../schema'
import type { TranslatorProvider } from '../translator'

/** Split a goal into candidate clauses. */
function splitClauses(goal: string): string[] {
  return goal
    .split(/[.;\n]+|,\s*(?:and\s+|then\s+)?|\s+and\s+then\s+|\s+and\s+(?=[a-z]{2,}\s)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
}

/** Pull an explicit duration out of a clause, in minutes. */
function estimateMinutes(clause: string): number | null {
  const hours = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i.exec(clause)
  if (hours) return Math.round(Number.parseFloat(hours[1] as string) * 60)

  const minutes = /(\d+)\s*(?:minutes?|mins?|m)\b/i.exec(clause)
  if (minutes) return Number.parseInt(minutes[1] as string, 10)

  // "5:30-6:30" or "5:30 to 6:30" — a bounded appointment
  const span = /(\d{1,2}):(\d{2})\s*(?:-|–|to)\s*(\d{1,2}):(\d{2})/.exec(clause)
  if (span) {
    const start = Number.parseInt(span[1] as string, 10) * 60 + Number.parseInt(span[2] as string, 10)
    const end = Number.parseInt(span[3] as string, 10) * 60 + Number.parseInt(span[4] as string, 10)
    const delta = end - start
    if (delta > 0) return delta
  }

  // A clause that is only a moment ("wake at 5:00", "at gym by 5:30") is small.
  if (/\b(?:at|by|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(clause)) return 5

  return null
}

/** Trim leading connectives and normalise casing for a display label. */
function toLabel(clause: string): string {
  const cleaned = clause
    .replace(/^(?:and|then|also|plus|i want to|i need to|i'?ll|i will|to)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length === 0) return clause.trim()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

export const heuristicProvider: TranslatorProvider = {
  id: 'heuristic',

  async translate(goalText: string): Promise<unknown> {
    const clauses = splitClauses(goalText)
    const source = clauses.length > 0 ? clauses : [goalText.trim()]

    const behaviors: Behavior[] = []
    const seen = new Set<string>()

    for (const clause of source) {
      const label = toLabel(clause).slice(0, 120)
      if (label.length === 0 || seen.has(label)) continue
      seen.add(label)

      const estMinutes = estimateMinutes(clause)
      const classification = classify(label, estMinutes)
      behaviors.push({
        label,
        size_class: classification.sizeClass,
        est_minutes: estMinutes,
        rationale: classification.rationale,
      })
    }

    if (behaviors.length === 0) {
      const label = goalText.trim().slice(0, 120) || 'Your goal'
      const classification = classify(label, null)
      behaviors.push({
        label,
        size_class: classification.sizeClass,
        est_minutes: null,
        rationale: classification.rationale,
      })
    }

    // SPEC 03 section 3.2: the outcome stays visible as the "why", never staked.
    const outcome = behaviors.find((b) => b.size_class === 'x_large')

    // SPEC 03 section 3.3: smallest viable rung first. Sort ascending by size,
    // then by estimated duration, and propose at most the two smallest — the
    // hour-long workout is deferred until the smaller rungs hold.
    const order = { small: 0, medium: 1, large: 2, x_large: 3 } as const
    const stakeable = behaviors
      .filter((b) => b.size_class !== 'x_large')
      .sort((a, b) => {
        const bySize = order[a.size_class] - order[b.size_class]
        if (bySize !== 0) return bySize
        return (a.est_minutes ?? 0) - (b.est_minutes ?? 0)
      })

    const recommended = stakeable.filter((b) => b.size_class === 'small').slice(0, 2)
    const recommendedStart = (recommended.length > 0 ? recommended : stakeable.slice(0, 1)).map(
      (b) => b.label,
    )

    const translation: Translation = {
      motivating_outcome: outcome ? outcome.label : null,
      behaviors,
      recommended_start: recommendedStart,
    }
    return translation
  },
}

export { classifyByMinutes }
