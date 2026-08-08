/**
 * The Supabase store — SPEC 06 section 6.1's spine.
 *
 * Note what this file does **not** do: it never checks that a row belongs to
 * the caller. Every query below would happily ask for another user's rows, and
 * every one of them comes back empty, because RLS is doing the work. That is
 * the point of SPEC 06 section 6.1 — "application-layer checks are
 * insufficient and do not satisfy this spec" — and re-implementing the check
 * here would create a second, weaker copy of the rule that could drift.
 *
 * Every write supplies the four consent-ledger columns. There is no code path
 * that inserts user data without them, because the schema makes
 * `consent_basis` NOT NULL with no default.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AnalyticsEvent } from '@/analytics/events'
import type { CommitmentStatus, SessionLog, SettlementDestination } from '@/engine/streak/types'
import type { DayKey } from '@/engine/calendar'
import type { Partner } from '@/partners'
import type { SizeClass } from '@/goals/schema'
import type {
  BrokerRequestRecord,
  NudgeTarget,
  PushSubscriptionRecord,
  CommitmentRecord,
  CreateCommitmentInput,
  CreateHabitInput,
  Habit,
  Profile,
  RuleRecipeRecord,
  SettlementRecord,
  Store,
} from './types'

/** SPEC 06 section 6.2 columns, supplied on every insert. */
interface LedgerColumns {
  provenance: 'user_entered' | 'derived' | 'partner_invite' | 'rule_receipt'
  consent_basis: { agreement_key: string; agreed_at: string; agreement_ver: number }
  permitted_use: string[]
  egress_record: unknown[]
}

const AGREEMENT_KEY = 'tos.v1'
const AGREEMENT_VERSION = 1

function ledger(
  provenance: LedgerColumns['provenance'],
  permittedUse: string[] = ['operate_habit'],
  egress: unknown[] = [],
): LedgerColumns {
  return {
    provenance,
    consent_basis: {
      agreement_key: AGREEMENT_KEY,
      agreed_at: new Date().toISOString(),
      agreement_ver: AGREEMENT_VERSION,
    },
    permitted_use: permittedUse,
    egress_record: egress,
  }
}

function must(
  result: { data: unknown; error: { message: string } | null },
  what: string,
): Record<string, unknown> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  if (result.data == null) throw new Error(`${what}: no row returned`)
  return result.data as Record<string, unknown>
}

export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  static fromEnv(accessToken?: string): SupabaseStore | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return null

    // The anon key plus the user's access token. There is no service-role key
    // in this repository: a service-role client bypasses RLS, which would
    // bypass the consent ledger (SPEC 06 section 6.1).
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
    })
    return new SupabaseStore(client)
  }

  /* ---------------------------------------------------------------- profile */

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('user_id, display_name, time_zone, morning_cue, evening_check')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(`getProfile: ${error.message}`)
    if (!data) return null
    return {
      userId: data.user_id,
      displayName: data.display_name,
      timeZone: data.time_zone,
      morningCue: String(data.morning_cue).slice(0, 5),
      eveningCheck: String(data.evening_check).slice(0, 5),
    }
  }

  async upsertProfile(profile: Profile): Promise<Profile> {
    const { error } = await this.client.from('profiles').upsert(
      {
        user_id: profile.userId,
        display_name: profile.displayName,
        time_zone: profile.timeZone,
        morning_cue: profile.morningCue,
        evening_check: profile.eveningCheck,
        ...ledger('user_entered'),
      },
      { onConflict: 'user_id' },
    )
    if (error) throw new Error(`upsertProfile: ${error.message}`)
    return profile
  }

  /* ----------------------------------------------------------------- habits */

  async createHabit(input: CreateHabitInput): Promise<Habit> {
    const row = must(
      await this.client
        .from('habits')
        .insert({
          user_id: input.userId,
          label: input.label,
          size_class: input.sizeClass,
          motivating_outcome: input.motivatingOutcome ?? null,
          domain: input.domain ?? 'health',
          ...ledger('user_entered'),
        })
        .select()
        .single(),
      'createHabit',
    )
    return toHabit(row)
  }

  async getHabit(_userId: string, habitId: string): Promise<Habit | null> {
    const { data, error } = await this.client.from('habits').select().eq('id', habitId).maybeSingle()
    if (error) throw new Error(`getHabit: ${error.message}`)
    return data ? toHabit(data) : null
  }

  async listHabits(_userId: string): Promise<Habit[]> {
    const { data, error } = await this.client.from('habits').select().order('created_at')
    if (error) throw new Error(`listHabits: ${error.message}`)
    return (data ?? []).map(toHabit)
  }

  /* ------------------------------------------------------------ commitments */

  async createCommitment(input: CreateCommitmentInput): Promise<CommitmentRecord> {
    const row = must(
      await this.client
        .from('commitments')
        .insert({
          user_id: input.userId,
          habit_id: input.habitId,
          mode: input.mode,
          streak_target: input.streakTarget,
          window_days: input.windowDays,
          stake_target_minor: input.stakeTargetMinor,
          stake_kind: input.stakeKind,
          grace_days: input.graceDays,
          base_ratio_num: input.baseRatioNum,
          base_ratio_den: input.baseRatioDen,
          success_destination: input.successDestination,
          shortfall_destination: input.shortfallDestination,
          status: input.status ?? 'active',
          window_start: input.windowStart,
          ...ledger('user_entered'),
        })
        .select()
        .single(),
      'createCommitment',
    )
    return toCommitment(row, input.doubledFromCommitmentId ?? null)
  }

  async getCommitment(_userId: string, commitmentId: string): Promise<CommitmentRecord | null> {
    const { data, error } = await this.client
      .from('commitments')
      .select()
      .eq('id', commitmentId)
      .maybeSingle()
    if (error) throw new Error(`getCommitment: ${error.message}`)
    return data ? toCommitment(data, null) : null
  }

  async listCommitments(_userId: string): Promise<CommitmentRecord[]> {
    const { data, error } = await this.client.from('commitments').select().order('created_at')
    if (error) throw new Error(`listCommitments: ${error.message}`)
    return (data ?? []).map((row) => toCommitment(row, null))
  }

  async countLiveCommitments(_userId: string): Promise<number> {
    const { count, error } = await this.client
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'active', 'awaiting_settlement'])
    if (error) throw new Error(`countLiveCommitments: ${error.message}`)
    return count ?? 0
  }

  async updateCommitmentStatus(
    _userId: string,
    commitmentId: string,
    status: CommitmentStatus,
  ): Promise<void> {
    const { error } = await this.client.from('commitments').update({ status }).eq('id', commitmentId)
    if (error) throw new Error(`updateCommitmentStatus: ${error.message}`)
  }

  async updateShortfallDestination(
    _userId: string,
    commitmentId: string,
    destination: SettlementDestination,
  ): Promise<void> {
    const { error } = await this.client
      .from('commitments')
      .update({ shortfall_destination: destination })
      .eq('id', commitmentId)
    if (error) throw new Error(`updateShortfallDestination: ${error.message}`)
  }

  /* --------------------------------------------------------------- sessions */

  async listSessions(_userId: string, commitmentId: string): Promise<SessionLog[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select('for_date, logged_at, completed, note')
      .eq('commitment_id', commitmentId)
      .order('for_date')
    if (error) throw new Error(`listSessions: ${error.message}`)
    return (data ?? []).map((row) => ({
      forDate: row.for_date as DayKey,
      loggedAt: row.logged_at as string,
      completed: row.completed as boolean,
      note: (row.note as string | null) ?? null,
    }))
  }

  async insertSession(userId: string, commitmentId: string, log: SessionLog): Promise<void> {
    const { error } = await this.client.from('sessions').insert({
      commitment_id: commitmentId,
      user_id: userId,
      for_date: log.forDate,
      logged_at: log.loggedAt,
      completed: log.completed,
      note: log.note ?? null,
      ...ledger('user_entered'),
    })
    if (error) throw new Error(`insertSession: ${error.message}`)
  }

  /* ------------------------------------------------------------ settlements */

  async getSettlement(_userId: string, commitmentId: string): Promise<SettlementRecord | null> {
    const { data, error } = await this.client
      .from('settlements')
      .select()
      .eq('commitment_id', commitmentId)
      .maybeSingle()
    if (error) throw new Error(`getSettlement: ${error.message}`)
    if (!data) return null
    return {
      commitmentId: data.commitment_id,
      userId: data.user_id,
      accruedMinor: Number(data.accrued_minor),
      targetMinor: Number(data.target_minor),
      destination: data.destination,
      userActionAt: data.user_action_at,
      rail: 'points_stub',
    }
  }

  async insertSettlement(record: SettlementRecord): Promise<void> {
    const { error } = await this.client.from('settlements').insert({
      commitment_id: record.commitmentId,
      user_id: record.userId,
      accrued_minor: record.accruedMinor,
      target_minor: record.targetMinor,
      destination: record.destination,
      // N5. Supplied by the caller from a real user action; NOT NULL, no default.
      user_action_at: record.userActionAt,
      rail: record.rail,
      ...ledger('user_entered'),
    })
    if (error) throw new Error(`insertSettlement: ${error.message}`)
  }

  /* --------------------------------------------------------------- partners */

  async listPartners(userId: string, commitmentId: string): Promise<Partner[]> {
    const { data, error } = await this.client
      .from('profile_partner_invites')
      .select('invitee_email, role, invited_at, authorized_sends')
      .eq('commitment_id', commitmentId)
    if (error) throw new Error(`listPartners: ${error.message}`)
    return (data ?? []).map((row) => ({
      status: 'pending' as const,
      inviterUserId: userId,
      commitmentId,
      email: row.invitee_email as string,
      role: row.role as Partner['role'],
      invitedAt: row.invited_at as string,
      authorizedSends: 'completion_notifications_only' as const,
    }))
  }

  async insertPartner(partner: Partner): Promise<void> {
    if (partner.status !== 'pending') {
      throw new Error('Only pending invites are written by this path (N6).')
    }
    const { error } = await this.client.from('profile_partner_invites').insert({
      inviter_user_id: partner.inviterUserId,
      commitment_id: partner.commitmentId,
      invitee_email: partner.email,
      role: partner.role,
      authorized_sends: partner.authorizedSends,
      // The one place an egress grant is written, and it grants exactly the
      // one target SPEC 04 section 4.3 permits.
      ...ledger(
        'partner_invite',
        ['operate_habit', 'notify_partner'],
        [{ target: 'partner_email', granted_at: new Date().toISOString(), revoked_at: null }],
      ),
    })
    if (error) throw new Error(`insertPartner: ${error.message}`)
  }

  async removePartnerInvite(_userId: string, commitmentId: string, email: string): Promise<void> {
    // SPEC 04 section 4.2: unlinking removes the address. A hard delete, not a
    // soft flag — a retained-but-hidden address is still an address we hold.
    const { error } = await this.client
      .from('profile_partner_invites')
      .delete()
      .eq('commitment_id', commitmentId)
      .eq('invitee_email', email.trim().toLowerCase())
    if (error) throw new Error(`removePartnerInvite: ${error.message}`)
  }

  /* ---------------------------------------------------------------- cleanup */

  async listRecipes(userId: string): Promise<RuleRecipeRecord[]> {
    const { data, error } = await this.client.from('rule_recipes').select()
    if (error) throw new Error(`listRecipes: ${error.message}`)
    return (data ?? []).map((row) => ({
      userId,
      recipeKey: row.recipe_key,
      provider: row.provider,
      applied: row.applied,
      notedAt: row.noted_at,
    }))
  }

  async upsertRecipe(record: RuleRecipeRecord): Promise<void> {
    const { error } = await this.client.from('rule_recipes').upsert(
      {
        user_id: record.userId,
        recipe_key: record.recipeKey,
        provider: record.provider,
        applied: record.applied,
        noted_at: record.notedAt,
        ...ledger('rule_receipt'),
      },
      { onConflict: 'user_id,recipe_key' },
    )
    if (error) throw new Error(`upsertRecipe: ${error.message}`)
  }

  async listBrokerRequests(userId: string): Promise<BrokerRequestRecord[]> {
    const { data, error } = await this.client.from('broker_requests').select()
    if (error) throw new Error(`listBrokerRequests: ${error.message}`)
    return (data ?? []).map((row) => ({
      userId,
      brokerName: row.broker_name,
      status: row.status,
      notedAt: row.noted_at,
    }))
  }

  async upsertBrokerRequest(record: BrokerRequestRecord): Promise<void> {
    const { error } = await this.client.from('broker_requests').upsert(
      {
        user_id: record.userId,
        broker_name: record.brokerName,
        status: record.status,
        noted_at: record.notedAt,
        ...ledger('user_entered'),
      },
      { onConflict: 'user_id,broker_name' },
    )
    if (error) throw new Error(`upsertBrokerRequest: ${error.message}`)
  }

  /* ------------------------------------------------------------------- push */

  async listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
    const { data, error } = await this.client
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, user_agent')
      .is('expired_at', null)
    if (error) throw new Error(`listPushSubscriptions: ${error.message}`)
    return (data ?? []).map((row) => ({
      subscriptionId: row.id as string,
      userId,
      endpoint: row.endpoint as string,
      p256dh: row.p256dh as string,
      auth: row.auth as string,
      userAgent: (row.user_agent as string | null) ?? null,
    }))
  }

  async upsertPushSubscription(
    record: Omit<PushSubscriptionRecord, 'subscriptionId'>,
  ): Promise<void> {
    const { error } = await this.client.from('push_subscriptions').upsert(
      {
        user_id: record.userId,
        endpoint: record.endpoint,
        p256dh: record.p256dh,
        auth: record.auth,
        user_agent: record.userAgent,
        expired_at: null,
        // The one egress grant a subscription carries. It permits waking this
        // browser and nothing else — the tickle has no payload (Q15).
        ...ledger(
          'user_entered',
          ['operate_habit'],
          [{ target: 'push_endpoint', granted_at: new Date().toISOString(), revoked_at: null }],
        ),
      },
      { onConflict: 'endpoint' },
    )
    if (error) throw new Error(`upsertPushSubscription: ${error.message}`)
  }

  async removePushSubscription(_userId: string, endpoint: string): Promise<void> {
    const { error } = await this.client
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
    if (error) throw new Error(`removePushSubscription: ${error.message}`)
  }

  /**
   * Reads the `nudge_targets` view, which is all the dispatcher's role can
   * see. Requires a client authenticated as `freshstart_nudger`; an ordinary
   * user session gets nothing back, which is the intended behaviour.
   */
  async listNudgeTargets(): Promise<NudgeTarget[]> {
    const { data, error } = await this.client.from('nudge_targets').select()
    if (error) throw new Error(`listNudgeTargets: ${error.message}`)
    return (data ?? []).map((row) => ({
      subscriptionId: row.subscription_id as string,
      userId: row.user_id as string,
      endpoint: row.endpoint as string,
      p256dh: row.p256dh as string,
      auth: row.auth as string,
      timeZone: row.time_zone as string,
      morningCue: String(row.morning_cue).slice(0, 5),
      eveningCheck: String(row.evening_check).slice(0, 5),
    }))
  }

  async markPushSubscriptionExpired(subscriptionId: string): Promise<void> {
    const { error } = await this.client
      .from('push_subscriptions')
      .update({ expired_at: new Date().toISOString() })
      .eq('id', subscriptionId)
    if (error) throw new Error(`markPushSubscriptionExpired: ${error.message}`)
  }

  /* ----------------------------------------------------------------- events */

  async recordEvent(event: AnalyticsEvent): Promise<void> {
    const { error } = await this.client.from('analytics_events').insert({
      user_id: event.user_id,
      commitment_id: event.commitment_id,
      name: event.name,
      occurred_at: event.occurred_at,
      payload: event.payload,
      ...ledger('derived', ['operate_habit', 'show_user_own_data', 'aggregate_analytics']),
    })
    if (error) throw new Error(`recordEvent: ${error.message}`)
  }

  async listEvents(_userId: string): Promise<AnalyticsEvent[]> {
    const { data, error } = await this.client
      .from('analytics_events')
      .select('user_id, commitment_id, name, occurred_at, payload')
      .order('occurred_at')
    if (error) throw new Error(`listEvents: ${error.message}`)
    return (data ?? []) as unknown as AnalyticsEvent[]
  }
}

function toHabit(row: Record<string, unknown>): Habit {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    label: row.label as string,
    sizeClass: row.size_class as SizeClass,
    motivatingOutcome: (row.motivating_outcome as string | null) ?? null,
    domain: (row.domain as string) ?? 'health',
    createdAt: row.created_at as string,
  }
}

function toCommitment(row: Record<string, unknown>, doubledFrom: string | null): CommitmentRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    habitId: row.habit_id as string,
    mode: row.mode as CommitmentRecord['mode'],
    streakTarget: Number(row.streak_target),
    windowDays: Number(row.window_days),
    stakeTargetMinor: Number(row.stake_target_minor),
    stakeKind: row.stake_kind as 'points' | 'currency',
    graceDays: Number(row.grace_days),
    baseRatioNum: Number(row.base_ratio_num),
    baseRatioDen: Number(row.base_ratio_den),
    successDestination: row.success_destination as SettlementDestination,
    shortfallDestination: row.shortfall_destination as SettlementDestination,
    status: row.status as CommitmentStatus,
    windowStart: row.window_start as DayKey,
    createdAt: row.created_at as string,
    doubledFromCommitmentId: doubledFrom,
  }
}
