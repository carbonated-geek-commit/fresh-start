/**
 * The invariant suite.
 *
 * One describe block per invariant that is testable in TypeScript. N1, N2, N6,
 * N8, N9 and N10 are enforced by absence — of an enum value, a credential, a
 * type, a code path — so they are asserted here by scanning the source tree,
 * which is the only way to test that something does not exist.
 *
 * N9's database half, and the RLS enforcement of SPEC 06, live in
 * `db/tests/rls.test.sql` — they cannot be tested from here, because the thing
 * under test is Postgres refusing a query the application never saw.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SETTLEMENT_DESTINATIONS, pointsStubRail, settle } from '@/settlement/stub'
import { StakeRejectedError, assertStakeable, MAX_CONCURRENT_COMMITMENTS } from '@/goals/stake-guard'
import { classify, reconcileSizeClass } from '@/goals/classifier'
import { parseTranslation, TranslationValidationError } from '@/goals/schema'
import { runTranslator } from '@/goals/translator'
import { heuristicProvider } from '@/goals/providers/heuristic'
import { assertCleanupCopy, CopyViolationError, generateRecipes } from '@/cleanup'
import { parseEvent, EventValidationError } from '@/analytics/events'
import { createInvite, completionNotification, PARTNER_ROLES } from '@/partners'
import { MODES } from '@/engine/modes'
import { cueDueWithin, isPushConfigured, publicVapidKey } from '@/nudges/push'
import { acknowledgeRecovery, recoveryPrompt } from '@/engine/recovery'
import { healthPlaybook } from '@/domains'

const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const SOURCES = sourceFiles(SRC).map((path) => ({
  path: relative(ROOT, path).replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}))

/* ========================================================================= */

describe('N1 — revenue never depends on a user failing', () => {
  it('the destination enum contains no company value', () => {
    expect([...SETTLEMENT_DESTINATIONS]).toEqual(['user', 'charity'])
  })

  it('no source file introduces a company destination', () => {
    const offenders = SOURCES.filter(({ text }) =>
      /destination[^\n]{0,40}['"](company|platform|freshstart|house)['"]/i.test(text),
    )
    expect(offenders.map((o) => o.path)).toEqual([])
  })

  it('the SQL enum contains no company value', () => {
    const sql = readFileSync(join(ROOT, 'db/migrations/stakes/0001_stake_ledger.sql'), 'utf8')
    const match = /create type public\.settlement_destination as enum \(([^)]*)\)/.exec(sql)
    expect(match).not.toBeNull()
    expect((match as RegExpExecArray)[1]).not.toMatch(/company|platform|house/i)
  })
})

describe('N2 — the product holds no balances', () => {
  it('no payment SDK is a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    const payment = deps.filter((d) =>
      /stripe|braintree|adyen|paypal|square|plaid|dwolla|checkout\.com/i.test(d),
    )
    expect(payment).toEqual([])
  })

  it('no payment credential appears in the environment example', () => {
    // Assignments only. The file's own prose says "PAYMENT CREDENTIAL" while
    // explaining that none may be added, and a naive substring scan flags it.
    const assignments = readFileSync(join(ROOT, '.env.example'), 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z0-9_]+=/.test(line.trim()))
    const payment = assignments.filter((line) =>
      /STRIPE|PAYMENT|CARD|MERCHANT|ACQUIRER|SECRET_KEY/i.test(line),
    )
    expect(payment).toEqual([])
  })

  it('the settlement rail is a stub that moves nothing', async () => {
    expect(pointsStubRail.id).toBe('points_stub')
    const result = await settle({
      commitmentId: 'c1',
      userId: 'u1',
      accruedMinor: 7_500,
      targetMinor: 10_000,
      destination: 'user',
      userActionAt: new Date('2026-02-01T12:00:00Z'),
    })
    expect(result.rail).toBe('points_stub')
    expect(result.settledMinor).toBe(7_500)
    expect(result.shortfallMinor).toBe(2_500)
  })
})

describe('N3 — a user never loses more than staked or is zeroed after earning', () => {
  it('the settled amount is floored at zero and capped at accrued', async () => {
    const result = await settle({
      commitmentId: 'c1',
      userId: 'u1',
      accruedMinor: 0,
      targetMinor: 10_000,
      destination: 'user',
      userActionAt: new Date(),
    })
    expect(result.settledMinor).toBe(0)
    expect(result.shortfallMinor).toBe(10_000)
  })

  it('accrued exceeding target is refused rather than paid out', async () => {
    await expect(
      settle({
        commitmentId: 'c1',
        userId: 'u1',
        accruedMinor: 20_000,
        targetMinor: 10_000,
        destination: 'user',
        userActionAt: new Date(),
      }),
    ).rejects.toThrow(/exceeds the target/)
  })
})

describe('N5 — settlement requires a live user choice', () => {
  it('no scheduler, cron, or timer calls the settlement path', () => {
    const callers = SOURCES.filter(
      ({ text, path }) =>
        /settleCommitment|settlement\/stub/.test(text) &&
        /setInterval|setTimeout|node-cron|cron\.schedule|scheduleJob/.test(text) &&
        !path.startsWith('tests/'),
    )
    expect(callers.map((c) => c.path)).toEqual([])
  })

  it('the settlement request type has no default for the user-action instant', () => {
    const text = readFileSync(join(SRC, 'settlement/stub/index.ts'), 'utf8')
    expect(text).toMatch(/readonly userActionAt: Date/)
    expect(text).not.toMatch(/userActionAt\s*[?]:/)
  })
})

describe('N6 — a non-opted-in invitee is never a person record', () => {
  it('a pending invite carries no invitee identifier', () => {
    const invite = createInvite({
      inviterUserId: 'u1',
      commitmentId: 'c1',
      email: 'Partner@Example.test',
      role: 'witness',
      existing: [],
      invitedAt: new Date('2026-02-01T00:00:00Z'),
    })
    expect(invite.email).toBe('partner@example.test')
    expect(Object.keys(invite).sort()).toEqual(
      ['authorizedSends', 'commitmentId', 'email', 'invitedAt', 'inviterUserId', 'role'].sort(),
    )
    expect(invite).not.toHaveProperty('inviteeUserId')
    expect(invite).not.toHaveProperty('id')
    expect(invite).not.toHaveProperty('name')
  })

  it('there is no marketing send path anywhere in the source', () => {
    // Identifiers, not prose — "blast radius" in the ramp's own header comment
    // is not a marketing send path, and a bare substring scan says it is.
    const offenders = SOURCES.filter(
      ({ text, path }) =>
        !path.includes('tests/') &&
        /\b(sendMarketing|marketingEmail|sendCampaign|sendNewsletter|dripSequence|emailBlast|promotional_send|broadcastTo)\b/.test(
          text,
        ),
    )
    expect(offenders.map((o) => o.path)).toEqual([])
  })

  it('a completion notification carries only the three permitted facts (SPEC 04 §4.3)', () => {
    const notification = completionNotification({
      to: 'partner@example.test',
      inviterDisplayName: 'Alex',
      habitLabel: 'At gym by 5:30',
      completedOn: '2026-02-01',
    })
    expect(Object.keys(notification).sort()).toEqual(
      ['body', 'completedOn', 'habitLabel', 'inviterDisplayName', 'subject', 'to'].sort(),
    )
    // No value, no streak, no other partner.
    expect(`${notification.subject} ${notification.body}`).not.toMatch(
      /\d+\s*(pts|points)|streak|accrued|target/i,
    )
  })
})

describe('N7 — a user never stakes on an outcome', () => {
  const base = {
    windowDays: 30,
    graceDays: 0,
    mode: 'streak' as const,
    profile: { targetMinor: 10_000, streakTarget: 12 },
    activeCommitmentCount: 0,
  }

  it('stake creation rejects x_large at the persistence boundary', () => {
    expect(() =>
      assertStakeable({ ...base, habitLabel: 'Increase PR 50%', sizeClass: 'x_large' }),
    ).toThrow(StakeRejectedError)
  })

  it('the SPEC 03 §3.2 worked example classifies exactly as the spec states', () => {
    expect(classify('Wake at 5:00', 5).sizeClass).toBe('small')
    expect(classify('At gym by 5:30', 5).sizeClass).toBe('small')
    expect(classify('Work out 1 hour', 60).sizeClass).toBe('large')
    expect(classify('Increase PR 50% in 30 days', null).sizeClass).toBe('x_large')
    expect(classify('Increase PR 50% in 30 days', null).isOutcome).toBe(true)
  })

  it('an outcome stays x_large even with a duration attached', () => {
    expect(classify('Increase my PR by 50% by end of month', 60).sizeClass).toBe('x_large')
  })

  it('the classifier may demote to x_large but never promotes one to stakeable', () => {
    // A model proposing `small` for an outcome is overruled.
    expect(reconcileSizeClass('Lose 10 lbs this month', 10, 'small').sizeClass).toBe('x_large')
    // A model proposing `x_large` is never overruled into something stakeable.
    expect(reconcileSizeClass('Walk for ten minutes', 10, 'x_large').sizeClass).toBe('x_large')
  })

  it('the worked example end to end: the outcome is separated, the behaviours are not', async () => {
    const result = await runTranslator(
      heuristicProvider,
      'Go to the gym every morning 5:30-6:30 and increase my PR by 50% by end of month',
    )
    const outcomes = result.translation.behaviors.filter((b) => b.size_class === 'x_large')
    const stakeable = result.translation.behaviors.filter((b) => b.size_class !== 'x_large')

    expect(outcomes.length).toBeGreaterThan(0)
    expect(stakeable.length).toBeGreaterThan(0)
    expect(result.translation.motivating_outcome).toMatch(/PR/i)
    // recommended_start never proposes an outcome as a starting rung.
    for (const label of result.translation.recommended_start) {
      const behavior = result.translation.behaviors.find((b) => b.label === label)
      expect(behavior?.size_class).not.toBe('x_large')
    }
  })

  it('the ceiling of five is enforced at the same boundary (SPEC 01 §1.7)', () => {
    expect(() =>
      assertStakeable({
        ...base,
        habitLabel: 'One more',
        sizeClass: 'small',
        activeCommitmentCount: MAX_CONCURRENT_COMMITMENTS,
      }),
    ).toThrow(/ceiling/)
  })

  it('an inadmissible ramp profile is refused at the same boundary (ADR-001)', () => {
    expect(() =>
      assertStakeable({
        ...base,
        habitLabel: 'Fine habit',
        sizeClass: 'small',
        profile: { targetMinor: 1_000, streakTarget: 30 },
      }),
    ).toThrow(/fair ladder/)
  })
})

describe('N8 — the app never ingests inbox content', () => {
  it('no mail API client is a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(
      deps.filter((d) => /imap|nodemailer|googleapis|gmail|mailparser|@microsoft\/microsoft-graph/i.test(d)),
    ).toEqual([])
  })

  it('no source file reads a mailbox', () => {
    const offenders = SOURCES.filter(({ text, path }) =>
      !path.includes('tests/') &&
      /(imap|fetchMessages|listMessages|readInbox|messages\.list|mail\.read)/i.test(text),
    )
    expect(offenders.map((o) => o.path)).toEqual([])
  })

  it('the rules advisor emits recipes only', () => {
    const recipes = generateRecipes('go to the gym and sleep better')
    expect(recipes.length).toBeGreaterThan(0)
    for (const recipe of recipes) {
      expect(recipe.steps.length).toBeGreaterThan(0)
      expect(recipe).not.toHaveProperty('messages')
      expect(recipe).not.toHaveProperty('senders')
    }
  })
})

describe('N9 — behavioural data is never pushed outward', () => {
  it('no outbound HTTP call exists in the analytics or engine modules', () => {
    const offenders = SOURCES.filter(
      ({ text, path }) =>
        /^src\/(analytics|engine|logging|settlement)\//.test(path) &&
        /(fetch\(|axios|XMLHttpRequest|navigator\.sendBeacon)/.test(text),
    )
    expect(offenders.map((o) => o.path)).toEqual([])
  })

  it('the event schema rejects a payload carrying free-text user content (SPEC 07 §7.5)', () => {
    expect(() =>
      parseEvent({
        name: 'session_logged',
        user_id: 'u1',
        commitment_id: 'c1',
        occurred_at: new Date().toISOString(),
        payload: {
          for_date: '2026-02-01',
          logged_at: new Date().toISOString(),
          completed: true,
          position_before: 0,
          position_after: 1,
          value_minor: 500,
          is_late: false,
          note: 'felt rough',
        },
      }),
    ).toThrow(EventValidationError)
  })
})

describe('Q15 — the push tickle carries no behavioural data (N9)', () => {
  it('sendTickle has no payload parameter', () => {
    const source = readFileSync(join(SRC, 'nudges/push.ts'), 'utf8')
    // The call passes `undefined` where web-push takes a payload, and the
    // exported signature offers no way to supply one.
    expect(source).toMatch(/sendNotification\([\s\S]{0,200}undefined,/)
    expect(source).toMatch(/export async function sendTickle\(target: PushTarget\)/)
  })

  it('the service worker builds the notification from its own fetch, not the push', () => {
    const sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8')
    // It must not read text out of the push event — that would mean a payload
    // had been sent.
    expect(sw).not.toMatch(/event\.data\.(json|text)\(\)/)
    expect(sw).toMatch(/fetch\('\/api\/cue'/)
    expect(sw).toMatch(/credentials: 'include'/)
  })

  it('the dispatcher never reads habit or session data', () => {
    const dispatch = readFileSync(join(SRC, 'app/api/nudges/dispatch/route.ts'), 'utf8')
    for (const forbidden of ['listSessions', 'listCommitments', 'listHabits', 'listEvents']) {
      expect(dispatch).not.toContain(forbidden)
    }
    expect(dispatch).toContain('listNudgeTargets')
  })

  it('the nudge-target type carries scheduling metadata only', () => {
    const types = readFileSync(join(SRC, 'data/types.ts'), 'utf8')
    const block = /export interface NudgeTarget \{([\s\S]*?)\n\}/.exec(types)
    expect(block).not.toBeNull()
    const body = (block as RegExpExecArray)[1] as string
    for (const forbidden of ['habit', 'session', 'commitment', 'accrued', 'streak', 'label']) {
      expect(body.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('push is off unless the deployment supplies VAPID keys', () => {
    const before = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY }
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    expect(isPushConfigured()).toBe(false)
    expect(publicVapidKey()).toBeNull()
    if (before.pub) process.env.VAPID_PUBLIC_KEY = before.pub
    if (before.priv) process.env.VAPID_PRIVATE_KEY = before.priv
  })

  it('cueDueWithin decides from the clock alone — it cannot see a session', () => {
    const target = { time_zone: 'UTC', morning_cue: '07:00', evening_check: '20:00' }
    expect(cueDueWithin(target, new Date('2026-02-01T07:05:00Z'), 15)).toBe('morning_cue')
    expect(cueDueWithin(target, new Date('2026-02-01T20:10:00Z'), 15)).toBe('evening_check')
    expect(cueDueWithin(target, new Date('2026-02-01T12:00:00Z'), 15)).toBeNull()
    // Before the cue time, not after: a window that looked backwards would
    // fire the morning cue at midnight.
    expect(cueDueWithin(target, new Date('2026-02-01T06:55:00Z'), 15)).toBeNull()
  })

  it('respects the user timezone rather than the server clock', () => {
    const tokyo = { time_zone: 'Asia/Tokyo', morning_cue: '07:00', evening_check: '20:00' }
    // 22:05 UTC is 07:05 next day in Tokyo.
    expect(cueDueWithin(tokyo, new Date('2026-02-01T22:05:00Z'), 15)).toBe('morning_cue')
    expect(cueDueWithin(tokyo, new Date('2026-02-01T07:05:00Z'), 15)).toBeNull()
  })
})

describe('N10 — no health data beyond a verification event', () => {
  it('the health playbook needs no connected device', () => {
    expect(healthPlaybook.starterHabits.every((h) => h.sizeClass === 'small')).toBe(true)
    const text = JSON.stringify(healthPlaybook)
    expect(text).not.toMatch(/apple ?health|healthkit|strava|fitbit|garmin|oauth/i)
  })

  it('no health connector is a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter((d) => /healthkit|strava|fitbit|garmin|withings|oura/i.test(d))).toEqual([])
  })
})

describe('N11 — copy never promises deletion or erasure', () => {
  it('the copy guard rejects the forbidden words', () => {
    expect(() => assertCleanupCopy('We will delete your data')).toThrow(CopyViolationError)
    expect(() => assertCleanupCopy('Erase everything')).toThrow(CopyViolationError)
    expect(() => assertCleanupCopy('You are pre-approved')).toThrow(CopyViolationError)
    expect(assertCleanupCopy('Freeze, suppress, take control')).toBeTruthy()
  })

  it('every generated cleanup string passes the guard', () => {
    for (const recipe of generateRecipes('sort out my mornings and my money')) {
      expect(() => assertCleanupCopy(recipe.title)).not.toThrow()
      expect(() => assertCleanupCopy(recipe.rationale)).not.toThrow()
      recipe.steps.forEach((step) => expect(() => assertCleanupCopy(step)).not.toThrow())
    }
  })
})

describe('SPEC 05 §5.5 — copy constraints', () => {
  it('streak mode is framed as harder and more motivating, not as destroying progress', () => {
    const streak = MODES.find((m) => m.id === 'streak')
    expect(streak?.tagline).toMatch(/harder/i)
    expect(`${streak?.tagline} ${streak?.mechanics}`).not.toMatch(
      /lose (your|all)|wipe|destroy|lost progress|back to zero/i,
    )
    // It says the opposite, explicitly.
    expect(streak?.mechanics).toMatch(/stays yours/i)
  })

  it('recovery copy never frames a return as a reset or a failure', () => {
    for (const days of [1, 2, 5, 30]) {
      const ack = acknowledgeRecovery(days)
      const prompt = recoveryPrompt(days)
      const text = `${ack.headline} ${ack.body} ${ack.credit} ${prompt.headline} ${prompt.body}`
      expect(text).not.toMatch(/fail|failure|start over|from scratch|lost your|reset/i)
    }
  })

  it('a partner role description states the referee flag changes nothing', () => {
    const referee = PARTNER_ROLES.find((r) => r.id === 'referee')
    expect(referee?.capability).toMatch(/does not change/i)
  })
})

describe('SPEC 03 §3.3 — the translator contract', () => {
  it('rejects output that recommends an outcome as a starting rung', () => {
    expect(() =>
      parseTranslation({
        motivating_outcome: null,
        behaviors: [
          { label: 'Get ripped', size_class: 'x_large', est_minutes: null, rationale: 'a result' },
        ],
        recommended_start: ['Get ripped'],
      }),
    ).toThrow(TranslationValidationError)
  })

  it('rejects output referencing a behaviour that does not exist', () => {
    expect(() =>
      parseTranslation({
        motivating_outcome: null,
        behaviors: [
          { label: 'Walk ten minutes', size_class: 'small', est_minutes: 10, rationale: 'ok' },
        ],
        recommended_start: ['Something else'],
      }),
    ).toThrow(TranslationValidationError)
  })

  it('retries once on invalid output, then errors — never partially applies', async () => {
    let attempts = 0
    const flaky = {
      id: 'flaky',
      async translate() {
        attempts++
        if (attempts === 1) return { nonsense: true }
        return {
          motivating_outcome: null,
          behaviors: [
            { label: 'Walk ten minutes', size_class: 'small', est_minutes: 10, rationale: 'ok' },
          ],
          recommended_start: ['Walk ten minutes'],
        }
      },
    }
    const result = await runTranslator(flaky, 'walk more')
    expect(attempts).toBe(2)
    expect(result.retried).toBe(true)

    let alwaysBad = 0
    const broken = {
      id: 'broken',
      async translate() {
        alwaysBad++
        return { nope: true }
      },
    }
    await expect(runTranslator(broken, 'walk more')).rejects.toThrow()
    expect(alwaysBad).toBe(2) // one attempt, one retry, then stop
  })
})
