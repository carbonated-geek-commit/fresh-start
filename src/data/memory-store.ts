/**
 * The in-memory store.
 *
 * The default, and the one the app runs on with no credentials at all. It
 * holds state in the server process, so it survives navigation within a `next
 * dev` session and is wiped on restart — which is the right trade for a
 * development and demo surface, and stops anyone mistaking it for durable
 * storage.
 *
 * It mirrors the RLS rules rather than replacing them: every read and write
 * filters on `userId`. That is not the enforcement — SPEC 06 section 6.1 says
 * the enforcement is RLS, and it is, in the Supabase store. Here it keeps the
 * two implementations behaviourally identical so a bug does not appear only in
 * production.
 */

import { randomUUID } from 'node:crypto'
import type { AnalyticsEvent } from '@/analytics/events'
import type { SessionLog, CommitmentStatus, SettlementDestination } from '@/engine/streak/types'
import type { Partner } from '@/partners'
import type {
  BrokerRequestRecord,
  CommitmentRecord,
  CreateCommitmentInput,
  CreateHabitInput,
  Habit,
  Profile,
  RuleRecipeRecord,
  SettlementRecord,
  Store,
} from './types'

interface State {
  profiles: Map<string, Profile>
  habits: Habit[]
  commitments: CommitmentRecord[]
  sessions: Map<string, SessionLog[]>
  settlements: SettlementRecord[]
  partners: Partner[]
  recipes: RuleRecipeRecord[]
  brokerRequests: BrokerRequestRecord[]
  events: AnalyticsEvent[]
}

function emptyState(): State {
  return {
    profiles: new Map(),
    habits: [],
    commitments: [],
    sessions: new Map(),
    settlements: [],
    partners: [],
    recipes: [],
    brokerRequests: [],
    events: [],
  }
}

/**
 * Held on `globalThis` so Next's dev-mode module reloading does not reset the
 * user's data on every edit.
 */
const globalRef = globalThis as unknown as { __freshstartStore?: State }
const state: State = (globalRef.__freshstartStore ??= emptyState())

export class MemoryStore implements Store {
  readonly kind = 'memory' as const

  async getProfile(userId: string): Promise<Profile | null> {
    return state.profiles.get(userId) ?? null
  }

  async upsertProfile(profile: Profile): Promise<Profile> {
    state.profiles.set(profile.userId, profile)
    return profile
  }

  async createHabit(input: CreateHabitInput): Promise<Habit> {
    const habit: Habit = {
      id: randomUUID(),
      userId: input.userId,
      label: input.label,
      sizeClass: input.sizeClass,
      motivatingOutcome: input.motivatingOutcome ?? null,
      domain: input.domain ?? 'health',
      createdAt: new Date().toISOString(),
    }
    state.habits.push(habit)
    return habit
  }

  async getHabit(userId: string, habitId: string): Promise<Habit | null> {
    return state.habits.find((h) => h.id === habitId && h.userId === userId) ?? null
  }

  async listHabits(userId: string): Promise<Habit[]> {
    return state.habits.filter((h) => h.userId === userId)
  }

  async createCommitment(input: CreateCommitmentInput): Promise<CommitmentRecord> {
    const record: CommitmentRecord = {
      ...input,
      id: randomUUID(),
      status: input.status ?? 'active',
      doubledFromCommitmentId: input.doubledFromCommitmentId ?? null,
      createdAt: new Date().toISOString(),
    }
    state.commitments.push(record)
    return record
  }

  async getCommitment(userId: string, commitmentId: string): Promise<CommitmentRecord | null> {
    return state.commitments.find((c) => c.id === commitmentId && c.userId === userId) ?? null
  }

  async listCommitments(userId: string): Promise<CommitmentRecord[]> {
    return state.commitments.filter((c) => c.userId === userId)
  }

  async countLiveCommitments(userId: string): Promise<number> {
    return state.commitments.filter(
      (c) => c.userId === userId && ['draft', 'active', 'awaiting_settlement'].includes(c.status),
    ).length
  }

  async updateCommitmentStatus(
    userId: string,
    commitmentId: string,
    status: CommitmentStatus,
  ): Promise<void> {
    const index = state.commitments.findIndex((c) => c.id === commitmentId && c.userId === userId)
    if (index < 0) return
    state.commitments[index] = { ...(state.commitments[index] as CommitmentRecord), status }
  }

  async updateShortfallDestination(
    userId: string,
    commitmentId: string,
    destination: SettlementDestination,
  ): Promise<void> {
    const index = state.commitments.findIndex((c) => c.id === commitmentId && c.userId === userId)
    if (index < 0) return
    const current = state.commitments[index] as CommitmentRecord
    // SPEC 01 section 1.5: changeable at any point up to settlement.
    if (current.status === 'settled') return
    state.commitments[index] = { ...current, shortfallDestination: destination }
  }

  async listSessions(userId: string, commitmentId: string): Promise<SessionLog[]> {
    const owned = state.commitments.some((c) => c.id === commitmentId && c.userId === userId)
    if (!owned) return []
    return [...(state.sessions.get(commitmentId) ?? [])].sort((a, b) =>
      a.forDate < b.forDate ? -1 : a.forDate > b.forDate ? 1 : 0,
    )
  }

  async insertSession(userId: string, commitmentId: string, log: SessionLog): Promise<void> {
    const owned = state.commitments.some((c) => c.id === commitmentId && c.userId === userId)
    if (!owned) throw new Error('No such commitment for this user.')
    const existing = state.sessions.get(commitmentId) ?? []
    if (existing.some((s) => s.forDate === log.forDate)) {
      throw new Error('That day is already logged.')
    }
    state.sessions.set(commitmentId, [...existing, log])
  }

  async getSettlement(userId: string, commitmentId: string): Promise<SettlementRecord | null> {
    return (
      state.settlements.find((s) => s.commitmentId === commitmentId && s.userId === userId) ?? null
    )
  }

  async insertSettlement(record: SettlementRecord): Promise<void> {
    if (state.settlements.some((s) => s.commitmentId === record.commitmentId)) {
      throw new Error('This commitment is already settled.')
    }
    state.settlements.push(record)
  }

  async listPartners(userId: string, commitmentId: string): Promise<Partner[]> {
    return state.partners.filter(
      (p) => p.commitmentId === commitmentId && p.inviterUserId === userId,
    )
  }

  async insertPartner(partner: Partner): Promise<void> {
    state.partners.push(partner)
  }

  async removePartnerInvite(userId: string, commitmentId: string, email: string): Promise<void> {
    const target = email.trim().toLowerCase()
    state.partners = state.partners.filter(
      (p) =>
        !(
          p.status === 'pending' &&
          p.inviterUserId === userId &&
          p.commitmentId === commitmentId &&
          p.email === target
        ),
    )
  }

  async listRecipes(userId: string): Promise<RuleRecipeRecord[]> {
    return state.recipes.filter((r) => r.userId === userId)
  }

  async upsertRecipe(record: RuleRecipeRecord): Promise<void> {
    const index = state.recipes.findIndex(
      (r) => r.userId === record.userId && r.recipeKey === record.recipeKey,
    )
    if (index >= 0) state.recipes[index] = record
    else state.recipes.push(record)
  }

  async listBrokerRequests(userId: string): Promise<BrokerRequestRecord[]> {
    return state.brokerRequests.filter((r) => r.userId === userId)
  }

  async upsertBrokerRequest(record: BrokerRequestRecord): Promise<void> {
    const index = state.brokerRequests.findIndex(
      (r) => r.userId === record.userId && r.brokerName === record.brokerName,
    )
    if (index >= 0) state.brokerRequests[index] = record
    else state.brokerRequests.push(record)
  }

  async recordEvent(event: AnalyticsEvent): Promise<void> {
    state.events.push(event)
  }

  async listEvents(userId: string): Promise<AnalyticsEvent[]> {
    return state.events.filter((e) => e.user_id === userId)
  }
}

/** Wipe everything. Tests only. */
export function resetMemoryStore(): void {
  Object.assign(state, emptyState())
}
