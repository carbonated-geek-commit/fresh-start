/**
 * SPEC 06 sections 6.4 and 6.5 — the cleanup ritual.
 *
 * Two things live here, and both are generators:
 *
 *   - **The rules advisor** (6.4). Input: the user's stated goals. Output: a
 *     recipe of filter rules for the user to apply *themselves, in their own
 *     provider*. Stored: the recipe, and whether they applied it. Nothing
 *     else. **The application never connects to, reads, or ingests a mailbox
 *     (N8)** — there is no mail client, no OAuth scope, and no inbox field
 *     anywhere in this repository.
 *   - **Broker suppression requests** (6.5). Logged as intended requests and
 *     **not sent** in v1. No broker credential exists.
 *
 * **Copy constraint, SPEC 05 section 5.5 / N11:** the language is "freeze,
 * suppress, take control." Never "delete", "erase", or "wipe". The app does
 * not do those things and must not imply it does. `assertCleanupCopy` below
 * makes that testable rather than a review note.
 */

import type { SizeClass } from '@/goals/schema'

/* ------------------------------------------------------------------------ */
/* N11 — the copy guard                                                      */
/* ------------------------------------------------------------------------ */

/** Words that promise erasure. The app cannot deliver them, so it cannot say them. */
const FORBIDDEN_COPY = [
  'delete',
  'deleted',
  'deletion',
  'erase',
  'erased',
  'erasure',
  'wipe',
  'wiped',
  'remove your data',
  'permanently removed',
  'scrub',
  'purge',
]

/** Words that promise an outcome we do not control (never "pre-approved"). */
const FORBIDDEN_CLAIMS = ['pre-approved', 'preapproved', 'pre-qualified', 'prequalified', 'guaranteed']

export class CopyViolationError extends Error {
  readonly term: string
  constructor(term: string, context: string) {
    super(`Cleanup copy violates N11 — contains "${term}": ${context}`)
    this.name = 'CopyViolationError'
    this.term = term
  }
}

/**
 * Assert a user-facing string keeps the ritual's language.
 *
 * Called on every string this module emits, and exported so the UI layer and
 * the test suite can assert the same rule on their own copy.
 */
export function assertCleanupCopy(text: string): string {
  const lower = text.toLowerCase()
  for (const term of [...FORBIDDEN_COPY, ...FORBIDDEN_CLAIMS]) {
    if (lower.includes(term)) throw new CopyViolationError(term, text)
  }
  return text
}

/* ------------------------------------------------------------------------ */
/* 6.4 — the rules advisor                                                   */
/* ------------------------------------------------------------------------ */

export type RuleProvider = 'gmail' | 'outlook' | 'apple_mail' | 'ios_sms' | 'android_sms' | 'generic'

export interface RuleRecipe {
  readonly id: string
  readonly provider: RuleProvider
  readonly title: string
  /** What this rule is for, in the user's terms. */
  readonly rationale: string
  /** Literal steps the user performs in their own provider. */
  readonly steps: readonly string[]
  /** The matcher, written out so the user can read it before applying it. */
  readonly matches: string
  /** What happens to matches. Never deletion — N11. */
  readonly action: 'label_and_skip_inbox' | 'mute_thread' | 'filter_to_folder' | 'silence_sender'
}

export interface AppliedRecipe {
  readonly recipeId: string
  /** Whether the user says they applied it. Self-report, like everything else. */
  readonly applied: boolean
  readonly notedAt: string
}

/**
 * Generate rule recipes from the user's stated goals.
 *
 * The only input is goal text the user typed. No mailbox is read to produce
 * these, which is why they are generic recipes rather than tailored to actual
 * senders — a limitation the honesty box acknowledges rather than works
 * around.
 */
export function generateRecipes(goalText: string, provider: RuleProvider = 'generic'): RuleRecipe[] {
  const goal = goalText.toLowerCase()
  const recipes: RuleRecipe[] = []

  const push = (recipe: RuleRecipe) => {
    assertCleanupCopy(recipe.title)
    assertCleanupCopy(recipe.rationale)
    recipe.steps.forEach(assertCleanupCopy)
    recipes.push(recipe)
  }

  push({
    id: 'quiet-promotions',
    provider,
    title: 'Freeze promotional mail out of the inbox',
    rationale:
      'Promotional mail is the loudest thing competing with the habit you are trying to start. ' +
      'This suppresses it without losing it.',
    matches: 'category:promotions OR unsubscribe in body',
    action: 'label_and_skip_inbox',
    steps: [
      'Open your mail settings and create a new filter.',
      'Match: messages in the Promotions category, or containing an unsubscribe link.',
      'Action: apply a label such as "Later", and skip the inbox.',
      'Do not choose an action that removes the messages — they stay, just out of the way.',
    ],
  })

  if (/\b(gym|workout|run|health|fitness|sleep|eat|diet|walk|weight)\b/.test(goal)) {
    push({
      id: 'quiet-fitness-marketing',
      provider,
      title: 'Suppress fitness marketing while you build the habit',
      rationale:
        'Apps and brands in the space you are working on will push hardest exactly when you are ' +
        'starting. Take control of when you see it.',
      matches: 'from: fitness apps, supplement brands, gym chains',
      action: 'filter_to_folder',
      steps: [
        'Create a filter matching senders you already recognise from this category.',
        'Send them to a folder you check on purpose, rather than the inbox.',
        'Revisit in a month. If you have not missed it, leave it there.',
      ],
    })
  }

  if (/\b(money|debt|budget|save|spend|financ)\b/.test(goal)) {
    push({
      id: 'quiet-offers',
      provider,
      title: 'Silence credit and offer mail',
      rationale:
        'Offer mail is designed to arrive when you are thinking about money. Putting it on your ' +
        'schedule instead of theirs is the point of this step.',
      matches: 'from: card issuers, lenders, "you may qualify" subject lines',
      action: 'label_and_skip_inbox',
      steps: [
        'Create a filter for senders that offer credit or financing.',
        'Label them and skip the inbox so they are there when you go looking.',
      ],
    })
  }

  push({
    id: 'quiet-notifications-window',
    provider: provider === 'generic' ? 'generic' : provider,
    title: 'Set a quiet window around your cue',
    rationale:
      'The half hour around your cue is when a notification does the most damage. Freeze it.',
    matches: 'all notifications during your cue window',
    action: 'silence_sender',
    steps: [
      'Open your phone’s focus or do-not-disturb settings.',
      'Add a scheduled window covering the 30 minutes around your morning cue.',
      'Allow only the people you would want interrupted for.',
    ],
  })

  return recipes
}

/**
 * SPEC 08 section 8.3: "Each ritual is a loggable session." Applying a
 * recommended recipe is itself a habit session (SPEC 06 section 6.4), which is
 * why the ritual is not a separate product surface.
 */
export function recipeAsHabit(recipe: RuleRecipe): { label: string; sizeClass: SizeClass } {
  return { label: recipe.title, sizeClass: 'small' }
}

/* ------------------------------------------------------------------------ */
/* 6.5 — broker suppression requests (mock in v1)                            */
/* ------------------------------------------------------------------------ */

export type BrokerRequestStatus = 'intended' | 'user_sent'

/**
 * A suppression request the user intends to make.
 *
 * "Broker suppression requests are **logged as intended requests and not
 * sent** in v1. No broker credential exists." There is no `send` function in
 * this module and no broker endpoint in this repository — the absence is the
 * enforcement (N9).
 */
export interface BrokerSuppressionRequest {
  readonly brokerName: string
  readonly status: BrokerRequestStatus
  readonly notedAt: string
  /** The link the user follows to make the request themselves. */
  readonly userActionUrl: string | null
}

export function describeBrokerRitual(): { headline: string; body: string; caveat: string } {
  return {
    headline: assertCleanupCopy('Take control of what is out there'),
    body: assertCleanupCopy(
      'Data brokers hold records about you. You can ask them to suppress your record, and most ' +
        'have a form for it. This step is about reclaiming ground before you rebuild on it.',
    ),
    // The honesty box. Stated up front rather than in a footnote.
    caveat: assertCleanupCopy(
      'In this version we record which requests you intend to make and give you the links. We do ' +
        'not contact anyone on your behalf, and we cannot promise any broker will act.',
    ),
  }
}
