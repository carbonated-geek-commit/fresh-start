/**
 * SPEC 08 section 8.4 — the Health playbook. First domain in v1.
 *
 * "Starter habits must be `small` and require no connected device (v1 is
 * honesty box, N10)."
 *
 * > **Open question Q13 is not closed.** `decisions/OPEN-QUESTIONS.md` records
 * > the concrete reclaim, rules and starter-habit content as OPEN and blocking
 * > T14. The content below is a complete, shippable first pass written against
 * > the section 8.3 ritual order and the section 5.5 copy constraints — not a
 * > placeholder, but it is the build fleet's proposal and wants human sign-off
 * > before launch. Nothing in the engine depends on these strings.
 *
 * This file is **data**. Adding the Financial playbook means adding a sibling
 * file, not editing anything here or in `src/engine/**` (SPEC 08 section 8.2).
 */

import { assertCleanupCopy } from '@/cleanup'
import type { Playbook } from '../types'

export const healthPlaybook: Playbook = {
  domain: 'health',
  name: 'Health',

  // SPEC 08 section 8.3: Reclaim, then Set rules, then Lock the habit.
  rituals: [
    {
      order: 1,
      kind: 'cleanup',
      label: 'Reclaim the morning',
      // The cleanup ritual is itself the first habit — "the ceremonial act of
      // reclaiming ground before rebuilding" (section 8.3).
      sizeClass: 'small',
      copyKey: 'health.reclaim',
    },
    {
      order: 2,
      kind: 'rules',
      label: 'Set the rules',
      sizeClass: 'small',
      copyKey: 'health.rules',
    },
    {
      order: 3,
      kind: 'habit',
      label: 'Lock one habit',
      sizeClass: 'small',
      copyKey: 'health.lock',
    },
  ],

  // Every starter is small and needs no device. A user with a phone and a
  // kitchen tap can do all of these tomorrow — which is the point of starting
  // at the smallest rung (SPEC 03 section 3.3).
  starterHabits: [
    {
      label: 'Out of bed within 10 minutes of the alarm',
      sizeClass: 'small',
      rationale:
        'The single decision the rest of the morning hangs on. It is also completely within your ' +
        'control, which is what makes it worth staking on.',
    },
    {
      label: 'A glass of water before anything else',
      sizeClass: 'small',
      rationale: 'Small enough that a bad day cannot stop it. That is the feature, not the limitation.',
    },
    {
      label: 'Ten minutes of walking',
      sizeClass: 'small',
      rationale:
        'Movement that needs no kit, no venue, and no weather. Easy to hold on the days that are ' +
        'going badly.',
    },
    {
      label: 'Phone out of the bedroom overnight',
      sizeClass: 'small',
      rationale:
        'One action in the evening that changes the next morning. It also pairs with the reclaim ' +
        'ritual you just did.',
    },
    {
      label: 'Lights out at a fixed time',
      sizeClass: 'small',
      rationale:
        'The behaviour you control. How well you actually sleep is not, so we do not ask you to ' +
        'stake on that.',
    },
  ],

  copy: {
    'health.reclaim': {
      headline: 'Start by taking the noise down',
      body:
        'Before adding anything, take back the ground you are building on. Most people trying to ' +
        'change something in the morning are competing with a phone that has other plans. Freeze ' +
        'that first — it is the cheapest win available and it makes everything after it easier.',
      action: 'Set a quiet window around the time you want to get up.',
    },
    'health.rules': {
      headline: 'Set the rules once, in your own accounts',
      body:
        'We will suggest filter rules based on what you told us you are working on. You apply ' +
        'them yourself, in your own mail and phone settings. We never connect to your inbox and ' +
        'we never read your messages — we only write the recipe.',
      action: 'Apply one rule, then log it. It counts as a session.',
    },
    'health.lock': {
      headline: 'Now pick one thing and put something behind it',
      body:
        'One habit. The smallest version of it. You can add more later, and the app will tell you ' +
        'honestly when you are carrying more than most people hold — but it will not stop you.',
      action: 'Choose a starter habit and set your window.',
    },
  },

  // N10, stated to the user rather than buried. Blueprint section 4 calls this
  // an honesty box, and the point of one is that it is visible.
  honestyBox: assertCleanupCopy(
    'This version takes you at your word. There is no watch to connect, no step count to sync, ' +
      'and no health record stored anywhere in the app — you log what you did, and that is the ' +
      'whole verification. If that sounds too easy to work, the honest answer is that it works ' +
      'for the people who wanted it to.',
  ),
}

export default healthPlaybook
