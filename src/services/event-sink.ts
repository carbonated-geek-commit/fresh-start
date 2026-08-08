/**
 * The event sink used by the service layer.
 *
 * It writes through the store, so events are governed by SPEC 06 like all
 * other data (SPEC 07 section 7.5) and inherit the same RLS. There is no
 * second destination, and no exporter — N9.
 */

import type { AnalyticsEvent, EventSink } from '@/analytics/events'
import type { Store } from '@/data'

export function storeEventSink(store: Store): EventSink {
  return {
    async record(event: AnalyticsEvent): Promise<void> {
      await store.recordEvent(event)
    },
  }
}
