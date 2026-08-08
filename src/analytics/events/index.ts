/**
 * SPEC 07 — the event emitter.
 *
 * The sink is an interface with one method. There is deliberately no HTTP
 * implementation of it anywhere in this repository: N9 says behavioural data
 * is never pushed outward, and the enforcement is that no outbound sink
 * exists to configure. Adding one is a thesis-level escalation, not a config
 * change.
 */

import {
  type AnalyticsEvent,
  type EventName,
  type EventPayload,
  EventValidationError,
  parseEvent,
} from './schema'

export * from './schema'
export * from './analysis'

export interface EventSink {
  /** Persist a validated event. Subject to SPEC 06 like all other data. */
  record(event: AnalyticsEvent): Promise<void>
}

export interface EmitContext {
  readonly userId: string
  readonly commitmentId?: string | null
  /** Injected, never read from a clock inside the engine. */
  readonly occurredAt: Date
}

/**
 * Validate and record.
 *
 * Validation happens before the sink sees anything, so a payload carrying a
 * field SPEC 07 section 7.5 does not enumerate is rejected at the boundary
 * rather than stored and cleaned up later.
 */
export async function emit<N extends EventName>(
  sink: EventSink,
  name: N,
  context: EmitContext,
  payload: EventPayload<N>,
): Promise<AnalyticsEvent> {
  const event = parseEvent({
    name,
    user_id: context.userId,
    commitment_id: context.commitmentId ?? null,
    occurred_at: context.occurredAt.toISOString(),
    payload,
  })
  await sink.record(event)
  return event
}

/** In-memory sink. The default in development and the one tests assert on. */
export class MemoryEventSink implements EventSink {
  readonly events: AnalyticsEvent[] = []

  async record(event: AnalyticsEvent): Promise<void> {
    this.events.push(event)
  }

  byName<N extends EventName>(name: N): Extract<AnalyticsEvent, { name: N }>[] {
    return this.events.filter((e): e is Extract<AnalyticsEvent, { name: N }> => e.name === name)
  }

  clear(): void {
    this.events.length = 0
  }
}

export { EventValidationError }
