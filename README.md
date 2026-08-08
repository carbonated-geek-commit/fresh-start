# FreshStart

One habit engine, many life domains — for a person at a life-reset moment who
wants habits that hold.

You pick a behaviour you control. You put something behind it. Each day in a
row is worth more than the last, and what you earn stays yours: a missed day
costs you the day ahead, never the days behind.

**v1 is points only.** No payment rail, no payment credential, nothing charged
or held. Web and mobile-web first; native is deferred (ADR-002).

## Run it

Nothing to configure. With no credentials the app runs on an in-memory store
and the deterministic goal classifier — that is a supported mode, not a
degraded one.

```bash
npm install && npm run dev
```

Verify:

```bash
npm run verify
```

That is `tsc --noEmit` plus the Vitest suite: golden fixtures, ramp properties
P1–P8, the streak state machine, and one describe block per invariant.

The data spine is tested separately, against a real Postgres, because RLS is
the thing under test and it cannot be exercised from TypeScript:

```bash
./scripts/db-test.sh
```

## Layout

| Path | Contents |
|---|---|
| `thesis.md` | Intent and red lines. Overrides everything. |
| `CLAUDE.md` | Fleet constitution: authority, protected paths, invariants N1–N11 |
| `specs/` | The buildable specification. Protected — human commit only. |
| `specs/fixtures/` | Authoritative golden values for the money math |
| `specs-draft/` | Agent proposals awaiting promotion |
| `decisions/adr/` | Interpretive calls, each anchored to a spec line |
| `src/engine/` | Ramp, streak machine, modes, recovery. Pure — no I/O, no clock. |
| `src/goals/` | Translator, size classifier, and the N7 stake guard |
| `src/services/` | The one place the N5 and N7 gates are applied |
| `src/data/` | `Store` interface + memory and Supabase implementations |
| `src/app/` | Next.js App Router surface, mobile-first |
| `src/app/record/` | The month-end artifact (ADR-003) — owner-only, print-friendly |
| `public/sw.js` | Offline fallback only. Deliberately caches no app code — see the comment. |
| `db/migrations/`, `db/policies/` | Consent ledger, stake ledger, RLS |
| `db/tests/rls.test.sql` | Proves an application-layer bypass of RLS fails |

## The parts that carry the most weight

**The ramp** (`src/engine/ramp`) determines value owed to a user, so it is a
pure function over BigInt and an exact rational — no binary float appears in
any value path. `specs/fixtures/ramp-golden.json` is authoritative and
reproduces bit-exactly.

**Admissibility, not ranges.** SPEC 02 §2.3 declares P1–P8 across `N` 3..60,
`T` 100..1,000,000, `R` 0.01..0.20. Measured, roughly 73% of that space
produces a non-increasing ramp and roughly 50% a negative one — `N=6, T=1000,
R=0.20` descends `200, 187, 173, 160, …`. So `buildRamp` computes the ramp and
then **asserts P1–P3 on the values it produced**, throwing rather than
returning an unlawful one. See `decisions/adr/ADR-001-ramp-profile-domain.md`
and the proposed spec amendment in `specs-draft/`.

**N7 is validation, not a UI hint.** `assertStakeable` runs at the persistence
boundary and rejects `x_large`. The deterministic classifier — not the LLM —
has the last word on `size_class`, and it may only ever demote toward
`x_large`, never promote out of it. Errors fall on the side of not staking.

**RLS is the consent ledger's enforcement.** The Supabase store performs no
ownership checks on purpose; SPEC 06 §6.1 says application-layer checks do not
satisfy the spec, and a TypeScript copy of the rule is a second, weaker one.

## Surfaces

| Route | What it is |
|---|---|
| `/` | Today. The cue that matters now, then a card per habit. |
| `/new` | Goal in, sized behaviours out. Outcomes are shown but cannot be staked. |
| `/habit/[id]` | The ladder, the window, logging, partners, the double. |
| `/settle/[id]` | The settlement decision. No timer, no countdown, no default. |
| `/record/[id]` | The month-end artifact. Screenshot or print it. |
| `/insights` | Your own data, analysed and handed back (SPEC 07 §7.4). |
| `/reclaim` | The health playbook's three rituals, and the rule recipes. |
| `/settings` | Nudge times and timezone. No off switch — see SPEC 05 §5.3. |

In local mode, `/settings` also seeds the states that need an elapsed window
(settlement, the recovery day, the double, the record) so the whole product can
be walked in a couple of minutes rather than a month.

## Non-negotiables

- Money and points are **integer minor units**. No floating point.
- Ramp and payout logic is a **pure function**. Time and state are passed in.
- `specs/fixtures/ramp-golden.json` is authoritative. If code disagrees with
  it, the code is wrong.
- **No payment credential exists in this repository.** That absence is the
  enforcement of N2, not an oversight.
- Agents propose to `specs-draft/`; only a human commit promotes to `specs/`.

## What this app deliberately cannot do

Each of these is enforced by something missing — an enum value, a dependency, a
code path — rather than by a check that could be removed:

- **Read your inbox.** No mail client is a dependency and no inbox read path
  exists. The rules advisor writes recipes you apply yourself.
- **Store health data.** v1 is an honesty box. No connector, no schema field.
- **Charge, hold, or move money.** No payment rail and no credential.
- **Send your stake to the company.** The destination enum is `{user,
  charity}`. There is nowhere for it to go.
- **Settle without you.** `user_action_at` is NOT NULL with no default, and
  nothing calls the settlement path from a timer.
- **Create a person record for someone you invited.** A pending invite is a row
  on *your* profile with no identifier for them, and no marketing send path
  exists.

## Sequencing

Phase A was sequential: T00 → T01 → T17. Phase B parallelised by
`file_ownership`. T19 and T20 were added under ADR-002 for the data seam and
the web surface, which the original DAG did not name.
