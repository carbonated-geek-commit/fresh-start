'use client'

import { useActionState, useState } from 'react'
import {
  createCommitmentAction,
  translateGoal,
  type ActionState,
  type TranslateState,
} from '../actions'
import { MODES } from '@/engine/modes'
import { admissibleStreakTargets, formatMinor } from '@/engine/ramp'
import { isStakeable, type SizeClass } from '@/goals/schema'
import { Button, Card, ErrorText, FieldLabel, Notice } from '@/ui/components'

interface Starter {
  label: string
  sizeClass: SizeClass
  rationale: string
}

interface Chosen {
  label: string
  sizeClass: SizeClass
}

const SIZE_LABEL: Record<SizeClass, string> = {
  small: 'Small · under 15 min',
  medium: 'Medium · 15–30 min',
  large: 'Large · over 30 min',
  x_large: 'An outcome, not an action',
}

export function NewHabitFlow({ starters }: { starters: Starter[] }) {
  const [translation, translateAction, translating] = useActionState<TranslateState, FormData>(
    translateGoal,
    {},
  )
  const [chosen, setChosen] = useState<Chosen | null>(null)

  if (chosen) {
    return (
      <ConfigureStep
        chosen={chosen}
        motivatingOutcome={translation.motivatingOutcome ?? null}
        onBack={() => setChosen(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <form action={translateAction} className="space-y-3">
          <label className="block space-y-2">
            <FieldLabel hint="Say it however it sits in your head. We will break it into the parts you actually control.">
              Your goal
            </FieldLabel>
            <textarea
              name="goal"
              rows={3}
              maxLength={2000}
              defaultValue={translation.goalText}
              className="border-line bg-paper w-full rounded-xl border px-3 py-2.5 text-base leading-relaxed"
              placeholder="Go to the gym every morning 5:30–6:30 and increase my PR by 50% by end of month."
            />
          </label>
          <Button type="submit" disabled={translating} className="w-full">
            {translating ? 'Reading it…' : 'Break it down'}
          </Button>
          {translation.error ? <ErrorText>{translation.error}</ErrorText> : null}
        </form>
      </Card>

      {translation.behaviors ? (
        <Proposal translation={translation} onChoose={setChosen} />
      ) : (
        <Card>
          <p className="mb-3 text-sm font-medium">Or start from one of these</p>
          <ul className="space-y-2">
            {starters.map((starter) => (
              <li key={starter.label}>
                <button
                  type="button"
                  onClick={() => setChosen({ label: starter.label, sizeClass: starter.sizeClass })}
                  className="border-line hover:border-accent w-full rounded-xl border p-3 text-left"
                >
                  <span className="block text-sm font-medium">{starter.label}</span>
                  <span className="text-ink-faint mt-0.5 block text-xs leading-relaxed">
                    {starter.rationale}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/**
 * SPEC 03 section 3.2 in the interface.
 *
 * Outcomes are shown — they are the user's real reason and hiding them would
 * be dishonest — but they are visually separated and have no button. The
 * education and the friction arrive in the same moment (section 5.3).
 */
function Proposal({
  translation,
  onChoose,
}: {
  translation: TranslateState
  onChoose: (chosen: Chosen) => void
}) {
  const behaviors = translation.behaviors ?? []
  const stakeable = behaviors.filter((b) => isStakeable(b.sizeClass))
  const outcomes = behaviors.filter((b) => !isStakeable(b.sizeClass))
  const recommended = new Set(translation.recommended ?? [])

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="display mb-1 text-lg">Things you control</h2>
        <p className="text-ink-faint mb-3 text-xs leading-relaxed">
          Pick one. The smallest rung is usually the right first move — you can step up once it
          holds.
        </p>
        <ul className="space-y-2">
          {stakeable.map((behavior) => (
            <li key={behavior.label}>
              <button
                type="button"
                onClick={() => onChoose({ label: behavior.label, sizeClass: behavior.sizeClass })}
                className="border-line hover:border-accent w-full rounded-xl border p-3 text-left"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{behavior.label}</span>
                  {recommended.has(behavior.label) ? (
                    <span className="bg-hold-soft text-ink shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold">
                      start here
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-faint mt-1 block text-xs">
                  {SIZE_LABEL[behavior.sizeClass]}
                </span>
                <span className="text-ink-soft mt-1 block text-xs leading-relaxed">
                  {behavior.rationale}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {outcomes.length > 0 ? (
        <Notice tone="warm" title="This part stays as your reason">
          <ul className="space-y-2">
            {outcomes.map((outcome) => (
              <li key={outcome.label}>
                <p className="text-ink font-medium">{outcome.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed">{outcome.rationale}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed">
            You could do everything right and still not hit it, so it is not something to stake on.
            It stays attached to the habit as your why.
          </p>
        </Notice>
      ) : null}
    </div>
  )
}

function ConfigureStep({
  chosen,
  motivatingOutcome,
  onBack,
}: {
  chosen: Chosen
  motivatingOutcome: string | null
  onBack: () => void
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createCommitmentAction,
    {},
  )
  const [mode, setMode] = useState<'streak' | 'consistency'>('streak')
  const [target, setTarget] = useState(10_000)

  // ADR-001. The selectable streak targets are derived from the ramp's own
  // admissibility, not offered as a blanket 3–60 — at the default ratio only
  // N <= 19 can produce a rising ladder.
  const targets = admissibleStreakTargets(target)
  const [streakTarget, setStreakTarget] = useState(12)
  const effectiveStreak = targets.includes(streakTarget) ? streakTarget : (targets[targets.length - 1] ?? 3)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="label" value={chosen.label} />
      <input type="hidden" name="sizeClass" value={chosen.sizeClass} />
      <input type="hidden" name="motivatingOutcome" value={motivatingOutcome ?? ''} />
      <input type="hidden" name="windowDays" value={30} />

      <Card>
        <p className="text-ink-faint text-xs tracking-widest uppercase">Your habit</p>
        <p className="display mt-1 text-xl">{chosen.label}</p>
        {motivatingOutcome ? (
          <p className="text-ink-soft mt-2 text-xs leading-relaxed">Because: {motivatingOutcome}</p>
        ) : null}
        <button type="button" onClick={onBack} className="text-ink-soft mt-3 text-xs underline underline-offset-4">
          Choose something else
        </button>
      </Card>

      <Card>
        <FieldLabel hint="This is the only difference between them — what a missed day does.">
          How should it work?
        </FieldLabel>
        <div className="mt-3 space-y-2">
          {MODES.map((descriptor) => (
            <label
              key={descriptor.id}
              className={`block cursor-pointer rounded-xl border p-3 ${
                mode === descriptor.id ? 'border-accent bg-accent-soft' : 'border-line'
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={descriptor.id}
                checked={mode === descriptor.id}
                onChange={() => setMode(descriptor.id)}
                className="sr-only"
              />
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{descriptor.name}</span>
                <span className="text-ink-faint text-xs">{descriptor.tagline}</span>
              </span>
              <span className="text-ink-soft mt-1.5 block text-xs leading-relaxed">
                {descriptor.mechanics}
              </span>
              <span className="text-ink-faint mt-1 block text-xs leading-relaxed">
                {descriptor.suitedTo}
              </span>
            </label>
          ))}
        </div>

        {mode === 'streak' ? (
          <label className="mt-3 flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="graceDays" className="mt-0.5 size-4" />
            <span>
              Give me one grace day
              <span className="text-ink-faint block text-xs leading-relaxed">
                Absorbs a single missed day without sending you back to the first rung. It does not
                come back once used.
              </span>
            </span>
          </label>
        ) : null}
      </Card>

      <Card>
        <label className="block space-y-2">
          <FieldLabel hint="Points in this version. Nothing is charged, held, or moved.">
            What is it worth if you finish?
          </FieldLabel>
          <select
            name="stakeTargetMinor"
            value={target}
            onChange={(event) => setTarget(Number(event.target.value))}
            className="border-line bg-paper tap w-full rounded-xl border px-3 text-base"
          >
            {[2_500, 5_000, 10_000, 20_000, 50_000].map((value) => (
              <option key={value} value={value}>
                {formatMinor(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block space-y-2">
          <FieldLabel hint="Reaching it unlocks an optional double. Longer is harder and pays later.">
            Days in a row to aim for
          </FieldLabel>
          <select
            name="streakTarget"
            value={effectiveStreak}
            onChange={(event) => setStreakTarget(Number(event.target.value))}
            className="border-line bg-paper tap w-full rounded-xl border px-3 text-base"
          >
            {targets.map((value) => (
              <option key={value} value={value}>
                {value} days{value === 12 ? ' · recommended' : ''}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <Card>
        <FieldLabel hint="You can change this any time before the window ends, including on the last day.">
          If you fall short, where should the rest go?
        </FieldLabel>
        <div className="mt-3 space-y-2">
          <label className="border-line flex cursor-pointer items-start gap-2.5 rounded-xl border p-3">
            <input type="radio" name="shortfallDestination" value="user" defaultChecked className="mt-0.5 size-4" />
            <span className="text-sm">
              Back to me
              <span className="text-ink-faint block text-xs leading-relaxed">
                Always available, and choosing it is not a failure.
              </span>
            </span>
          </label>
          <label className="border-line flex cursor-pointer items-start gap-2.5 rounded-xl border p-3">
            <input type="radio" name="shortfallDestination" value="charity" className="mt-0.5 size-4" />
            <span className="text-sm">
              To a cause
              <span className="text-ink-faint block text-xs leading-relaxed">
                In this version nothing moves — we record the choice.
              </span>
            </span>
          </label>
        </div>
        <p className="text-ink-faint mt-3 text-xs leading-relaxed">
          It never comes to us. There is no company option, and there is nowhere in the code for
          one to go.
        </p>
      </Card>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Setting it up…' : 'Lock it in'}
      </Button>
      {state.error ? <ErrorText>{state.error}</ErrorText> : null}
    </form>
  )
}
