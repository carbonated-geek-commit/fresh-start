# SPEC 06 — Data Spine and Consent Ledger

## 6.1 Spine

Supabase: Postgres, Auth, Row-Level Security.

**RLS is where the consent ledger is enforced, not merely where it is stored.**
Application-layer checks are insufficient and do not satisfy this spec.

## 6.2 Consent-lineage ledger

Every stored piece of user data carries a ledger entry:

| Column | Meaning |
|---|---|
| `provenance` | how it was obtained — `user_entered`, `derived`, `partner_invite`, `rule_receipt` |
| `consent_basis` | what the user agreed to for this data, and when |
| `permitted_use` | what the application may do with it |
| `egress_record` | where the user has permitted it to go, and current revocation state |

**Enforcement:** data whose `egress_record` lacks a current permission cannot be
read by any outbound path. Enforced by RLS policy, not application code (N9).

This is the root dependency of the build. No data-writing feature may ship
before it exists.

## 6.3 Prohibited storage

| Prohibited | Invariant |
|---|---|
| Email or inbox content of any kind | N8 |
| Health or movement records beyond a verification event | N10 |
| A person record for a non-opted-in invitee | N6 |
| Any company-owned stake destination | N1 |
| Any payment credential, token, or key | N2 |

## 6.4 Rules advisor (cleanup ritual)

The rules advisor is a **generator only**.

- Input: the user's stated goals.
- Output: recommended email/SMS filter rules for the user to apply themselves in
  their own provider.
- Stored: the recommended rule recipe, and whether the user applied it. Nothing
  else.

**The application never connects to, reads, or ingests a mailbox (N8).** There
is no inbox read path and none may be added.

Applying a recommended recipe is itself a loggable habit session (SPEC 01).

## 6.5 Data-broker requests (mock in v1)

Broker suppression requests are **logged as intended requests and not sent** in
v1. No broker credential exists. The user-facing framing is suppression and
control, never deletion (N11).
