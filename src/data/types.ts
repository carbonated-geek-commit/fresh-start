/**
 * The persistence seam.
 *
 * ADR-002. Not owned by any task in the original DAG — the DAG assumed each
 * feature would talk to Supabase directly, which would have put the N7 and N5
 * gates in every call site instead of one. This interface exists so those
 * gates live in `src/services/**` and every store implementation inherits
 * them.
 *
 * Two implementations:
 *
 *   - `memory` — the default. No credential, no network. This is what makes
 *     the zero-credential development mode in `.env.example` real.
 *   - `supabase` — the spine described in SPEC 06. RLS still does the
 *     enforcing; this layer never re-implements it in TypeScript, because
 *     "application-layer checks are insufficient" (SPEC 06 section 6.1).
 */

import type { DayKey } from '@/engine/calendar'
import type { CommitmentStatus, Mode, SessionLog, SettlementDestination } from '@/engine/streak/types'
import type { AnalyticsEvent } from '@/analytics/events'
import type { SizeClass } from '@/goals/schema'
import type { Partner, PartnerRole } from '@/partners'

export interface Profile {
  readonly userId: string
  readonly displayName: string
  readonly timeZone: string
  readonly morningCue: string
  readonly eveningCheck: string
}

export interface Habit {
  readonly id: string
  readonly userId: string
  readonly label: string
  readonly sizeClass: SizeClass
  /** SPEC 03 section 3.2. Free text, never staked, never scored. */
  readonly motivatingOutcome: string | null
  readonly domain: string
  readonly createdAt: string
}

export interface CommitmentRecord {
  readonly id: string
  readonly userId: string
  readonly habitId: string
  readonly mode: Mode
  readonly streakTarget: number
  readonly windowDays: number
  readonly stakeTargetMinor: number
  readonly stakeKind: 'points' | 'currency'
  readonly graceDays: number
  readonly baseRatioNum: number
  readonly baseRatioDen: number
  readonly successDestination: SettlementDestination
  readonly shortfallDestination: SettlementDestination
  readonly status: CommitmentStatus
  readonly windowStart: DayKey
  readonly createdAt: string
  /** Set when the double was offered/accepted. SPEC 01 section 1.6. */
  readonly doubledFromCommitmentId: string | null
}

export interface SettlementRecord {
  readonly commitmentId: string
  readonly userId: string
  readonly accruedMinor: number
  readonly targetMinor: number
  readonly destination: SettlementDestination
  readonly userActionAt: string
  readonly rail: 'points_stub'
}

export interface RuleRecipeRecord {
  readonly userId: string
  readonly recipeKey: string
  readonly provider: string
  readonly applied: boolean
  readonly notedAt: string
}

export interface BrokerRequestRecord {
  readonly userId: string
  readonly brokerName: string
  readonly status: 'intended' | 'user_sent'
  readonly notedAt: string
}

export interface CreateHabitInput {
  readonly userId: string
  readonly label: string
  readonly sizeClass: SizeClass
  readonly motivatingOutcome?: string | null
  readonly domain?: string
}

export interface CreateCommitmentInput
  extends Omit<CommitmentRecord, 'id' | 'createdAt' | 'status' | 'doubledFromCommitmentId'> {
  readonly status?: CommitmentStatus
  readonly doubledFromCommitmentId?: string | null
}

/**
 * The store.
 *
 * Deliberately absent, and to stay absent:
 *   - any method that reads a mailbox (N8)
 *   - any method that writes to an external system (N9)
 *   - any method that creates a person record for a non-opted-in email (N6)
 *   - any method that settles without a user action instant (N5)
 */
export interface Store {
  readonly kind: 'memory' | 'supabase'

  getProfile(userId: string): Promise<Profile | null>
  upsertProfile(profile: Profile): Promise<Profile>

  createHabit(input: CreateHabitInput): Promise<Habit>
  getHabit(userId: string, habitId: string): Promise<Habit | null>
  listHabits(userId: string): Promise<Habit[]>

  createCommitment(input: CreateCommitmentInput): Promise<CommitmentRecord>
  getCommitment(userId: string, commitmentId: string): Promise<CommitmentRecord | null>
  listCommitments(userId: string): Promise<CommitmentRecord[]>
  /** Draft, active, or awaiting settlement. Drives the load indicator. */
  countLiveCommitments(userId: string): Promise<number>
  updateCommitmentStatus(userId: string, commitmentId: string, status: CommitmentStatus): Promise<void>
  updateShortfallDestination(
    userId: string,
    commitmentId: string,
    destination: SettlementDestination,
  ): Promise<void>

  listSessions(userId: string, commitmentId: string): Promise<SessionLog[]>
  insertSession(userId: string, commitmentId: string, log: SessionLog): Promise<void>

  getSettlement(userId: string, commitmentId: string): Promise<SettlementRecord | null>
  insertSettlement(record: SettlementRecord): Promise<void>

  listPartners(userId: string, commitmentId: string): Promise<Partner[]>
  insertPartner(partner: Partner): Promise<void>
  removePartnerInvite(userId: string, commitmentId: string, email: string): Promise<void>

  listRecipes(userId: string): Promise<RuleRecipeRecord[]>
  upsertRecipe(record: RuleRecipeRecord): Promise<void>

  listBrokerRequests(userId: string): Promise<BrokerRequestRecord[]>
  upsertBrokerRequest(record: BrokerRequestRecord): Promise<void>

  recordEvent(event: AnalyticsEvent): Promise<void>
  listEvents(userId: string): Promise<AnalyticsEvent[]>
}

export type { PartnerRole }
