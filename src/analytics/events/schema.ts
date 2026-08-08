/**
 * SPEC 07 section 7.2 — the required events.
 *
 * "The product's central claim is that it produces habits, not 30-day
 * compliance. That claim is only testable if configuration and outcome are
 * logged as structured events from the first release. This cannot be
 * backfilled."
 *
 * Two constraints shape every type here:
 *
 *   - **SPEC 07 section 7.5: no free-text user content beyond enumerated
 *     fields.** There is no `note`, no `label`, no `goal_text` on any payload.
 *     A habit's label never enters the event stream. This is enforced by the
 *     schemas below rejecting unknown keys, not by reviewer diligence.
 *   - **N9: no event is transmitted to any third party.** There is no exporter
 *     in this module and no outbound path anywhere in the repository.
 */

import { z } from 'zod'

export const EVENT_NAMES = [
  'commitment_created',
  'session_logged',
  'session_missed',
  'recovery',
  'settlement',
  'double_offered',
  'double_accepted',
  'partner_added',
  'translator_run',
  'load_indicator_shown',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const isoInstant = z.string().datetime()
const sizeClass = z.enum(['small', 'medium', 'large', 'x_large'])

/**
 * Every event carries `user_id`, `commitment_id` where applicable, and a
 * server timestamp (SPEC 07 section 7.2).
 */
const envelope = {
  user_id: z.string().min(1),
  /** Server-assigned. Never taken from the client. */
  occurred_at: isoInstant,
}

export const payloadSchemas = {
  commitment_created: z.object({
    mode: z.enum(['streak', 'consistency']),
    streak_target: z.number().int(),
    window_days: z.number().int(),
    stake_target_minor: z.number().int(),
    stake_kind: z.enum(['points', 'currency']),
    grace_days: z.number().int(),
    size_class: sizeClass,
    habit_count_at_creation: z.number().int(),
  }),

  session_logged: z.object({
    for_date: dayKey,
    logged_at: isoInstant,
    completed: z.boolean(),
    position_before: z.number().int(),
    position_after: z.number().int(),
    value_minor: z.number().int(),
    is_late: z.boolean(),
  }),

  session_missed: z.object({
    for_date: dayKey,
    position_before: z.number().int(),
    grace_consumed: z.boolean(),
  }),

  recovery: z.object({
    days_since_miss: z.number().int(),
  }),

  settlement: z.object({
    accrued_minor: z.number().int(),
    target_minor: z.number().int(),
    destination: z.enum(['user', 'charity']),
    user_action_at: isoInstant,
  }),

  double_offered: z.object({ source_commitment_id: z.string().min(1) }),
  double_accepted: z.object({ source_commitment_id: z.string().min(1) }),

  partner_added: z.object({
    role: z.enum(['witness', 'referee']),
    opted_in: z.boolean(),
  }),

  translator_run: z.object({
    behavior_count: z.number().int(),
    /** Distribution, not labels. SPEC 07 section 7.5. */
    size_class_distribution: z.record(sizeClass, z.number().int()),
    accepted_recommendation: z.boolean(),
  }),

  load_indicator_shown: z.object({
    level: z.enum(['green', 'yellow', 'orange', 'red']),
    habit_count: z.number().int(),
  }),
} as const

/**
 * `.strict()` is the enforcement of SPEC 07 section 7.5 — an event carrying a
 * field the spec does not enumerate fails validation and is never stored.
 *
 * The union is written out rather than built by mapping over `EVENT_NAMES`,
 * because a mapped array widens to `ZodTypeAny[]` and `z.infer` then collapses
 * every payload to `unknown`. Spelling it out keeps each event's payload typed
 * at the call site, which is what makes the SPEC 07 section 7.3 analyses
 * compile-time-checkable against the stream.
 */
function evt<N extends EventName>(name: N, payload: (typeof payloadSchemas)[N]) {
  return z
    .object({
      ...envelope,
      name: z.literal(name),
      commitment_id: z.string().min(1).nullable(),
      payload: payload.strict(),
    })
    .strict()
}

export const eventSchema = z.discriminatedUnion('name', [
  evt('commitment_created', payloadSchemas.commitment_created),
  evt('session_logged', payloadSchemas.session_logged),
  evt('session_missed', payloadSchemas.session_missed),
  evt('recovery', payloadSchemas.recovery),
  evt('settlement', payloadSchemas.settlement),
  evt('double_offered', payloadSchemas.double_offered),
  evt('double_accepted', payloadSchemas.double_accepted),
  evt('partner_added', payloadSchemas.partner_added),
  evt('translator_run', payloadSchemas.translator_run),
  evt('load_indicator_shown', payloadSchemas.load_indicator_shown),
])

export type EventPayload<N extends EventName> = z.infer<(typeof payloadSchemas)[N]>

export interface EventEnvelope<N extends EventName> {
  readonly name: N
  readonly user_id: string
  readonly commitment_id: string | null
  /** Server-assigned ISO instant. */
  readonly occurred_at: string
  readonly payload: EventPayload<N>
}

/**
 * The event union, declared rather than inferred from `eventSchema`.
 *
 * Inferring it collapses `name` to the wide `EventName` on each member, so
 * `Extract<AnalyticsEvent, { name: 'session_missed' }>` matches every member
 * and every payload access widens to the union of all payloads. Declaring the
 * union keeps the discriminant literal, which is what lets the section 7.3
 * analyses be checked against the stream at compile time.
 */
export type AnalyticsEvent =
  | EventEnvelope<'commitment_created'>
  | EventEnvelope<'session_logged'>
  | EventEnvelope<'session_missed'>
  | EventEnvelope<'recovery'>
  | EventEnvelope<'settlement'>
  | EventEnvelope<'double_offered'>
  | EventEnvelope<'double_accepted'>
  | EventEnvelope<'partner_added'>
  | EventEnvelope<'translator_run'>
  | EventEnvelope<'load_indicator_shown'>

export class EventValidationError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`Event failed SPEC 07 validation: ${problems.join('; ')}`)
    this.name = 'EventValidationError'
    this.problems = problems
  }
}

export function parseEvent(raw: unknown): AnalyticsEvent {
  const result = eventSchema.safeParse(raw)
  if (!result.success) {
    throw new EventValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    )
  }
  return result.data as unknown as AnalyticsEvent
}
