/**
 * SPEC 08 sections 8.1 and 8.2 — the domain abstraction.
 *
 * "A **domain** groups habits and prescribes rituals. Domains do not have
 * their own engine — there is one habit engine (SPEC 01) and many domains."
 *
 * "A playbook is **data, not code**. Adding a domain must require no engine
 * change. If it does, the abstraction is wrong — escalate."
 *
 * So this file declares a shape and nothing else. There is no behaviour here,
 * no domain-specific branch anywhere in `src/engine/**`, and adding
 * `src/domains/financial/playbook.ts` requires touching nothing outside its
 * own directory. That is the test of the abstraction.
 */

import type { StakeableSizeClass } from '@/goals/schema'

export type DomainId = 'health' | 'financial' | 'family_time'

/** SPEC 08 section 8.3 — the ritual order is Reclaim, Set rules, Lock the habit. */
export type RitualKind = 'cleanup' | 'rules' | 'habit'

export interface Ritual {
  readonly order: number
  readonly kind: RitualKind
  readonly label: string
  /** Null for rituals that are not themselves a sized behaviour. */
  readonly sizeClass: StakeableSizeClass | null
  /** Key into the copy table. Copy is data, subject to SPEC 05 section 5.5. */
  readonly copyKey: string
}

export interface StarterHabit {
  readonly label: string
  readonly sizeClass: StakeableSizeClass
  /** Why this one. Shown so the suggestion is arguable rather than oracular. */
  readonly rationale: string
}

export interface Playbook {
  readonly domain: DomainId
  readonly name: string
  readonly rituals: readonly Ritual[]
  readonly starterHabits: readonly StarterHabit[]
  /** Copy keyed by `copyKey`. Data, not code. */
  readonly copy: Readonly<Record<string, RitualCopy>>
  /**
   * What this domain cannot do in v1, stated to the user rather than hidden.
   * For health this is the N10 honesty box.
   */
  readonly honestyBox: string
}

export interface RitualCopy {
  readonly headline: string
  readonly body: string
  /** The single action this ritual asks for. */
  readonly action: string
}
