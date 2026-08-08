/**
 * SPEC 04 sections 4.1–4.3 — partners.
 *
 * **N6 is the shape of this module, not a check inside it.**
 *
 * "Before the invitee opts in: the email is stored as an attribute on the
 * inviting user's profile. No person record, no user row, no identity is
 * created for the invitee."
 *
 * So there is no `Invitee` type here with an id. A pending invite is
 * `PendingInvite`, which is explicitly modelled as a row on the inviter's
 * profile, and it carries no fields a person record would have. The type
 * system is the enforcement: there is no function in this module that returns
 * a person for a non-opted-in address, because no such type exists to return.
 *
 * There is likewise **no marketing send path** — the only send function is
 * `completionNotification`, and its payload is fixed by section 4.3.
 */

export type PartnerRole = 'witness' | 'referee'

export interface PartnerRoleDescriptor {
  readonly id: PartnerRole
  readonly name: string
  readonly summary: string
  /** What the partner can actually do. Stated plainly so consent is informed. */
  readonly capability: string
}

export const PARTNER_ROLES: readonly PartnerRoleDescriptor[] = [
  {
    id: 'witness',
    name: 'Witness',
    summary: 'They see that you showed up.',
    capability: 'Receives a note each time you complete a day. Cannot dispute anything.',
  },
  {
    id: 'referee',
    name: 'Referee',
    summary: 'They see that you showed up, and can raise a hand.',
    // SPEC 04 section 4.1: v1 referee flags are advisory only.
    capability:
      'Receives the same notes, and can flag a day they doubt. A flag is recorded and shown to ' +
      'you — it does not change your value, your streak, or your settlement.',
  },
]

/* ------------------------------------------------------------------------ */
/* N6 — the invitee data model                                               */
/* ------------------------------------------------------------------------ */

/**
 * A pending invite. **An attribute of the inviter's profile, not a person.**
 *
 * Note what is absent and must stay absent: no `id` for the invitee, no name,
 * no marketing consent flag, no last-seen, no anything that would make this a
 * profile of the person invited. It records an address the inviter asked us to
 * notify, and the scope of that authorisation.
 */
export interface PendingInvite {
  /** The inviter. This row belongs to them. */
  readonly inviterUserId: string
  readonly commitmentId: string
  /** The address the inviter typed. Normalised, never enriched. */
  readonly email: string
  readonly role: PartnerRole
  readonly invitedAt: string
  /** Exactly what the inviter authorised us to send. Nothing else may be sent. */
  readonly authorizedSends: 'completion_notifications_only'
}

/** A partner who has opted in. Now — and only now — a normal user record. */
export interface LinkedPartner {
  readonly partnerUserId: string
  readonly inviterUserId: string
  readonly commitmentId: string
  readonly role: PartnerRole
  readonly linkedAt: string
  readonly displayName: string
}

export type Partner =
  | ({ readonly status: 'pending' } & PendingInvite)
  | ({ readonly status: 'linked' } & LinkedPartner)

export class PartnerInviteError extends Error {
  readonly userMessage: string
  constructor(userMessage: string) {
    super(userMessage)
    this.name = 'PartnerInviteError'
    this.userMessage = userMessage
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** SPEC 04 section 4.2. Max one partner per role per commitment keeps it simple. */
export const MAX_PARTNERS_PER_COMMITMENT = 2

export interface CreateInviteInput {
  readonly inviterUserId: string
  readonly commitmentId: string
  readonly email: string
  readonly role: PartnerRole
  readonly existing: readonly Partner[]
  readonly invitedAt: Date
}

/**
 * Create a pending invite.
 *
 * Returns a `PendingInvite` — an attribute of the inviter's profile. It does
 * not create, and cannot create, a record for the person invited (N6).
 */
export function createInvite(input: CreateInviteInput): PendingInvite {
  const email = normalizeEmail(input.email)
  if (!EMAIL_PATTERN.test(email)) {
    throw new PartnerInviteError('That does not look like an email address.')
  }
  if (input.existing.length >= MAX_PARTNERS_PER_COMMITMENT) {
    throw new PartnerInviteError('This habit already has the partners it can hold.')
  }
  if (input.existing.some((p) => p.status === 'pending' && p.email === email)) {
    throw new PartnerInviteError('You have already invited that address to this habit.')
  }

  return {
    inviterUserId: input.inviterUserId,
    commitmentId: input.commitmentId,
    email,
    role: input.role,
    invitedAt: input.invitedAt.toISOString(),
    authorizedSends: 'completion_notifications_only',
  }
}

/**
 * Unlinking removes the address from the inviter's profile (SPEC 04 section
 * 4.2). Modelled as a filter rather than a soft delete: a retained-but-hidden
 * address is still an address we hold.
 */
export function removeInvite(partners: readonly Partner[], email: string): Partner[] {
  const target = normalizeEmail(email)
  return partners.filter((p) => !(p.status === 'pending' && p.email === target))
}

/* ------------------------------------------------------------------------ */
/* SPEC 04 section 4.3 — notification content                                */
/* ------------------------------------------------------------------------ */

/**
 * The complete notification payload.
 *
 * Section 4.3 fixes this exactly: "the inviter's display name, the habit
 * label, and the completion event. It contains no other habit data, no accrued
 * value, no health data, and no other partners' identities."
 *
 * There is no field on this type for accrued value, streak position, target,
 * or any other partner. A caller that wanted to leak one would have to change
 * the type, which is a reviewable diff rather than an accident.
 */
export interface CompletionNotification {
  readonly to: string
  readonly inviterDisplayName: string
  readonly habitLabel: string
  readonly completedOn: string
  readonly subject: string
  readonly body: string
}

export function completionNotification(params: {
  readonly to: string
  readonly inviterDisplayName: string
  readonly habitLabel: string
  readonly completedOn: string
}): CompletionNotification {
  return {
    to: params.to,
    inviterDisplayName: params.inviterDisplayName,
    habitLabel: params.habitLabel,
    completedOn: params.completedOn,
    subject: `${params.inviterDisplayName} did it today`,
    body:
      `${params.inviterDisplayName} completed "${params.habitLabel}" on ${params.completedOn}. ` +
      `They asked you to see this. You can stop receiving it at any time by replying.`,
  }
}

/**
 * The one send path that exists.
 *
 * Section 4.2: "Notification sends to a non-opted-in address are limited to
 * the completion notifications the inviter explicitly authorized." The guard
 * is here, in the only function that can send, so there is no second path to
 * audit.
 */
export interface NotificationSender {
  send(notification: CompletionNotification): Promise<void>
}

export async function notifyPartners(
  sender: NotificationSender,
  partners: readonly Partner[],
  params: { readonly inviterDisplayName: string; readonly habitLabel: string; readonly completedOn: string },
): Promise<number> {
  let sent = 0
  for (const partner of partners) {
    if (partner.status !== 'pending') continue
    if (partner.authorizedSends !== 'completion_notifications_only') continue
    await sender.send(
      completionNotification({
        to: partner.email,
        inviterDisplayName: params.inviterDisplayName,
        habitLabel: params.habitLabel,
        completedOn: params.completedOn,
      }),
    )
    sent++
  }
  return sent
}

/** Records sends without performing them. The default in v1. */
export class RecordingNotificationSender implements NotificationSender {
  readonly sent: CompletionNotification[] = []
  async send(notification: CompletionNotification): Promise<void> {
    this.sent.push(notification)
  }
}

/* ------------------------------------------------------------------------ */
/* SPEC 04 section 4.1 — referee flags (advisory in v1)                      */
/* ------------------------------------------------------------------------ */

export interface RefereeFlag {
  readonly commitmentId: string
  readonly forDate: string
  readonly flaggedByPartnerUserId: string
  readonly flaggedAt: string
}

/**
 * A referee flag changes nothing.
 *
 * SPEC 04 section 4.1: "a referee flag is **advisory only**. It is recorded
 * and shown to the user. It does not alter accrual, settlement, or any value."
 *
 * This function returns display copy and takes no state. There is deliberately
 * no function in this module that accepts a `StreakState` or a `Ramp` — the
 * absence is what makes the advisory-only property structural rather than a
 * promise. Dispute adjudication is deferred (`decisions/BACKLOG.md`).
 */
export function describeFlag(flag: RefereeFlag, partnerName: string): { title: string; body: string } {
  return {
    title: `${partnerName} flagged ${flag.forDate}`,
    body:
      'This is recorded, and it changes nothing — not your value, not your streak, not your ' +
      'settlement. It is here because they saw something worth a conversation.',
  }
}
