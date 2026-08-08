# SPEC 04 — Partners and Settlement

## 4.1 Partner roles

Per partner, per commitment:

- **witness** — receives completion notifications. No dispute capability.
- **referee** — receives completion notifications and may flag a session.

**v1:** a referee flag is **advisory only**. It is recorded and shown to the
user. It does not alter accrual, settlement, or any value. Dispute
adjudication, appeal, and non-response policy are **deferred** and out of scope
(see `decisions/BACKLOG.md`).

## 4.2 Invitee data model (N6)

A user invites a partner by email address.

**Before the invitee opts in:**
- The email is stored as an **attribute on the inviting user's profile**.
- No person record, no user row, no identity is created for the invitee.
- The address is treated as an attribute of the inviter, not as a person.

**After the invitee opts in:**
- A normal user record is created and the relationship is linked.

**Hard rules:**
- No marketing or promotional send path may exist for a non-opted-in address.
- Notification sends to a non-opted-in address are limited to the completion
  notifications the inviter explicitly authorized.
- Unlinking removes the address from the inviter's profile.

## 4.3 Notification content

A partner notification contains: the inviter's display name, the habit label,
and the completion event. It contains no other habit data, no accrued value, no
health data, and no other partners' identities.

## 4.4 Settlement interface (v1 stub)

Settlement resolves only on explicit user action (N5). The interface is:

    settle(commitment_id, destination) -> SettlementResult

`destination` is one of `user` or `charity`. **There is no company destination
and none may be added (N1).**

**v1 implementation is a stub.** It records the user's settlement decision and
returns a result. It performs no charge, holds no balance, and integrates no
payment provider. No payment credential exists in the repository (N2).

The stub must be a clean seam: swapping in a real rail later must not require
changing the commitment or accrual model.
