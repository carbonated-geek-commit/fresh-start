'use server'

/**
 * Server actions.
 *
 * Every mutation the UI can perform goes through `src/services/**`, which is
 * where the N5 and N7 gates live. No action here reaches the store directly,
 * and none of them can be invoked by a scheduler — a server action needs a
 * request, which needs a user.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { endLocalSession, isLocalMode, requireSession, startLocalSession } from '@/auth'
import { resolveStore } from '@/data'
import type { DayKey } from '@/engine/calendar'
import { runTranslator, resolveTranslatorProvider, StakeRejectedError, TranslatorError } from '@/goals'
import { generateRecipes } from '@/cleanup'
import { createInvite, PartnerInviteError } from '@/partners'
import { normalizeSchedule } from '@/nudges'
import { seedDemoData } from '@/services/dev-seed'
import { emit } from '@/analytics/events'
import { storeEventSink } from '@/services/event-sink'
import {
  abandonCommitment,
  acceptDouble,
  createCommitment,
  logSession,
  settleCommitment,
} from '@/services/habit-service'
import type { SettlementDestination } from '@/engine/streak/types'
import type { SizeClass } from '@/goals/schema'

export interface ActionState {
  readonly error?: string
  readonly ok?: boolean
  readonly message?: string
}

async function context() {
  const session = await requireSession()
  const store = resolveStore(session.accessToken)
  return { session, store, sink: storeEventSink(store) }
}

/* ---------------------------------------------------------------- session */

export async function signInLocal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isLocalMode()) return { error: 'Local sign-in is disabled when Supabase is configured.' }
  const name = String(formData.get('displayName') ?? '').trim()
  if (name.length === 0) return { error: 'Tell us what to call you.' }
  await startLocalSession(name)
  redirect('/')
}

export async function signOut(): Promise<void> {
  await endLocalSession()
  redirect('/start')
}

/**
 * SPEC 05 section 5.3 — nudge times are user-configurable.
 *
 * There is no parameter here that disables the nudges: the spec calls them
 * core scaffolding rather than a preference, so the only thing this action can
 * change is *when*.
 */
export async function updateSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session, store } = await context()

  const displayName = String(formData.get('displayName') ?? '').trim()
  if (displayName.length === 0) return { error: 'Tell us what to call you.' }

  const requestedZone = String(formData.get('timeZone') ?? 'UTC')
  if (!isKnownTimeZone(requestedZone)) return { error: 'That timezone is not one we recognise.' }

  const schedule = normalizeSchedule({
    morningCue: String(formData.get('morningCue') ?? ''),
    eveningCheck: String(formData.get('eveningCheck') ?? ''),
    timeZone: requestedZone,
  })

  await store.upsertProfile({
    userId: session.userId,
    displayName: displayName.slice(0, 80),
    timeZone: schedule.timeZone,
    morningCue: schedule.morningCue,
    eveningCheck: schedule.eveningCheck,
  })

  revalidatePath('/settings')
  revalidatePath('/')
  return { ok: true, message: 'Saved.' }
}

/** Validated against the runtime's own zone database rather than a list. */
function isKnownTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------- translator */

export interface TranslateState {
  readonly error?: string
  readonly goalText?: string
  readonly behaviors?: {
    label: string
    sizeClass: SizeClass
    estMinutes: number | null
    rationale: string
  }[]
  readonly motivatingOutcome?: string | null
  readonly recommended?: string[]
}

/**
 * SPEC 03 section 3.3: the translator **proposes**; the user chooses. This
 * action returns a proposal and creates nothing.
 */
export async function translateGoal(
  _prev: TranslateState,
  formData: FormData,
): Promise<TranslateState> {
  const goalText = String(formData.get('goal') ?? '')
  try {
    const provider = await resolveTranslatorProvider()
    const result = await runTranslator(provider, goalText)

    // The translator receives goal text only (N8, N10) — see the provider.
    const { session, store, sink } = await context()
    const distribution: Record<string, number> = {}
    for (const b of result.translation.behaviors) {
      distribution[b.size_class] = (distribution[b.size_class] ?? 0) + 1
    }
    await emit(
      sink,
      'translator_run',
      { userId: session.userId, occurredAt: new Date() },
      {
        behavior_count: result.translation.behaviors.length,
        size_class_distribution: distribution as never,
        accepted_recommendation: false,
      },
    )
    void store

    return {
      goalText,
      motivatingOutcome: result.translation.motivating_outcome,
      recommended: result.translation.recommended_start,
      behaviors: result.translation.behaviors.map((b) => ({
        label: b.label,
        sizeClass: b.size_class,
        estMinutes: b.est_minutes,
        rationale: b.rationale,
      })),
    }
  } catch (error) {
    if (error instanceof TranslatorError) return { goalText, error: error.message }
    return { goalText, error: 'Something went wrong reading that. Try rephrasing it.' }
  }
}

/* ------------------------------------------------------------ commitments */

export async function createCommitmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session, store, sink } = await context()

  const label = String(formData.get('label') ?? '').trim()
  const sizeClass = String(formData.get('sizeClass') ?? 'small') as SizeClass
  const mode = String(formData.get('mode') ?? 'streak') as 'streak' | 'consistency'
  const streakTarget = Number(formData.get('streakTarget') ?? 12)
  const windowDays = Number(formData.get('windowDays') ?? 30)
  const stakeTargetMinor = Number(formData.get('stakeTargetMinor') ?? 10000)
  const graceDays = formData.get('graceDays') === 'on' ? 1 : 0
  const shortfallDestination = String(
    formData.get('shortfallDestination') ?? 'user',
  ) as SettlementDestination
  const motivatingOutcome = String(formData.get('motivatingOutcome') ?? '').trim() || null

  try {
    await createCommitment(store, sink, session, {
      label,
      sizeClass,
      motivatingOutcome,
      mode,
      streakTarget,
      windowDays,
      stakeTargetMinor,
      graceDays,
      shortfallDestination,
    })
  } catch (error) {
    // The N7 rejection is a normal, explainable outcome — not a crash. Its
    // userMessage explains why an outcome is not stakeable, which is where the
    // education happens (SPEC 03 section 5.3).
    if (error instanceof StakeRejectedError) return { error: error.userMessage }
    return { error: error instanceof Error ? error.message : 'Could not create that.' }
  }

  revalidatePath('/')
  redirect('/')
}

export async function logSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session, store, sink } = await context()
  const commitmentId = String(formData.get('commitmentId') ?? '')
  const forDate = String(formData.get('forDate') ?? '') as DayKey
  const completed = formData.get('completed') !== 'false'
  const note = String(formData.get('note') ?? '').trim() || null

  try {
    const result = await logSession(store, sink, session, commitmentId, forDate, completed, note)
    revalidatePath('/')
    revalidatePath(`/habit/${commitmentId}`)
    return {
      ok: true,
      message:
        result.recovery?.headline ??
        (result.cappedOut
          ? 'Logged. You have already earned the full target — this one is for the record.'
          : `Logged. +${result.valueMinor} pts.`),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not log that.' }
  }
}

export async function settleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, store, sink } = await context()
  const commitmentId = String(formData.get('commitmentId') ?? '')
  const destination = String(formData.get('destination') ?? 'user') as SettlementDestination

  try {
    // N5. The instant is taken here, from the request the user's click made.
    await settleCommitment(store, sink, session, commitmentId, destination, new Date())
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not settle that.' }
  }

  revalidatePath('/')
  redirect('/')
}

export async function acceptDoubleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session, store, sink } = await context()
  const commitmentId = String(formData.get('commitmentId') ?? '')
  try {
    await acceptDouble(store, sink, session, commitmentId)
  } catch (error) {
    if (error instanceof StakeRejectedError) return { error: error.userMessage }
    return { error: error instanceof Error ? error.message : 'Could not start the double.' }
  }
  revalidatePath('/')
  redirect('/')
}

export async function abandonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, store } = await context()
  const commitmentId = String(formData.get('commitmentId') ?? '')
  // SPEC 01 section 1.8: an explicit user action, and the only path to it.
  await abandonCommitment(store, session, commitmentId)
  revalidatePath('/')
  redirect('/')
}

/* --------------------------------------------------------------- partners */

/**
 * SPEC 04 section 4.2 / N6.
 *
 * `createInvite` returns a `PendingInvite` — an attribute of the inviter's
 * profile. No person record is created for the address, and there is no code
 * path here that could create one.
 */
export async function invitePartnerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session, store, sink } = await context()
  const commitmentId = String(formData.get('commitmentId') ?? '')
  const email = String(formData.get('email') ?? '')
  const role = String(formData.get('role') ?? 'witness') as 'witness' | 'referee'

  try {
    const existing = await store.listPartners(session.userId, commitmentId)
    const invite = createInvite({
      inviterUserId: session.userId,
      commitmentId,
      email,
      role,
      existing,
      invitedAt: new Date(),
    })
    await store.insertPartner({ status: 'pending', ...invite })

    await emit(
      sink,
      'partner_added',
      { userId: session.userId, commitmentId, occurredAt: new Date() },
      // The address itself never enters the event stream (SPEC 07 section 7.5).
      { role, opted_in: false },
    )
  } catch (error) {
    if (error instanceof PartnerInviteError) return { error: error.userMessage }
    return { error: error instanceof Error ? error.message : 'Could not send that invite.' }
  }

  revalidatePath(`/habit/${commitmentId}`)
  return { ok: true, message: 'Invited. They will only ever get the completion notes.' }
}

export async function removePartnerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session, store } = await context()
  const commitmentId = String(formData.get('commitmentId') ?? '')
  const email = String(formData.get('email') ?? '')
  // SPEC 04 section 4.2: unlinking removes the address from the profile.
  await store.removePartnerInvite(session.userId, commitmentId, email)
  revalidatePath(`/habit/${commitmentId}`)
  return { ok: true }
}

/* ---------------------------------------------------------------- cleanup */

export async function noteRecipeApplied(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session, store } = await context()
  const recipeKey = String(formData.get('recipeKey') ?? '')
  const provider = String(formData.get('provider') ?? 'generic')
  const applied = formData.get('applied') === 'on'

  // SPEC 06 section 6.4: stored is the recipe and whether it was applied.
  // Nothing else — no mailbox is read to verify this, and none can be.
  await store.upsertRecipe({
    userId: session.userId,
    recipeKey,
    provider,
    applied,
    notedAt: new Date().toISOString(),
  })
  revalidatePath('/reclaim')
  return { ok: true, message: applied ? 'Noted. That counts as a session.' : 'Noted.' }
}

export async function generateRecipesFor(goalText: string) {
  return generateRecipes(goalText)
}

/* ------------------------------------------------------------------- push */

/**
 * Q15. Stores where to send a contentless tickle, and the client keys the push
 * service cannot decrypt with. No habit, no schedule, no content.
 */
export async function savePushSubscription(subscription: {
  endpoint: string
  p256dh: string
  auth: string
}): Promise<void> {
  const { session, store } = await context()
  if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) {
    throw new Error('Incomplete push subscription.')
  }
  await store.upsertPushSubscription({
    userId: session.userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    userAgent: null,
  })
  revalidatePath('/settings')
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const { session, store } = await context()
  await store.removePushSubscription(session.userId, endpoint)
  revalidatePath('/settings')
}

/* ----------------------------------------------------- demo (local only) */

/**
 * Seeds the states that need an elapsed window — settlement, the recovery day,
 * the double, the month-end record.
 *
 * Guarded twice: `isLocalMode()` here, and again inside `seedDemoData`. With
 * Supabase configured neither runs.
 */
export async function seedDemoAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  if (!isLocalMode()) return { error: 'Demo data is only available in local mode.' }
  const { session, store, sink } = await context()
  try {
    const created = await seedDemoData(store, sink, session)
    revalidatePath('/')
    revalidatePath('/insights')
    return {
      ok: true,
      message:
        created === 0
          ? 'No room — you are already holding five habits.'
          : `Added ${created}. One window has finished, one is a recovery day, one hit the streak.`,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not seed.' }
  }
}
