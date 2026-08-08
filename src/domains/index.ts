/**
 * SPEC 08 section 8.1 — the domain registry.
 *
 * Order: Health (v1), then Financial, then Family time. The later two are not
 * in this registry because they are not built; adding one is adding a file and
 * a line here, and nothing else (section 8.2).
 */

import { healthPlaybook } from './health/playbook'
import type { DomainId, Playbook } from './types'

export * from './types'
export { healthPlaybook }

const REGISTRY: Partial<Record<DomainId, Playbook>> = {
  health: healthPlaybook,
}

export const AVAILABLE_DOMAINS: readonly DomainId[] = ['health']

export function playbookFor(domain: DomainId): Playbook | null {
  return REGISTRY[domain] ?? null
}

/** Rituals in the order SPEC 08 section 8.3 prescribes. */
export function ritualsInOrder(playbook: Playbook) {
  return [...playbook.rituals].sort((a, b) => a.order - b.order)
}
