'use client'

import { useActionState, useEffect, useState } from 'react'
import { updateSettingsAction, type ActionState } from '../actions'
import { Button, Card, ErrorText, FieldLabel } from '@/ui/components'

/**
 * A short list of common zones plus whatever the browser reports.
 *
 * The browser's own zone is offered first and preselected on a profile that
 * has never been set, because a nudge in the wrong timezone is worse than no
 * nudge — it arrives at 3am and teaches the user to ignore the app.
 */
const COMMON_ZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
]

export function SettingsForm({
  displayName,
  timeZone,
  morningCue,
  eveningCheck,
}: {
  displayName: string
  timeZone: string
  morningCue: string
  eveningCheck: string
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSettingsAction, {})
  const [detected, setDetected] = useState<string | null>(null)

  useEffect(() => {
    try {
      setDetected(Intl.DateTimeFormat().resolvedOptions().timeZone)
    } catch {
      setDetected(null)
    }
  }, [])

  const zones = [...new Set([detected, timeZone, ...COMMON_ZONES].filter(Boolean))] as string[]

  return (
    <form action={action} className="space-y-4">
      <Card>
        <label className="block space-y-2">
          <FieldLabel>What should we call you?</FieldLabel>
          <input
            name="displayName"
            defaultValue={displayName}
            required
            maxLength={80}
            className="border-line bg-paper tap w-full rounded-xl border px-3 text-base"
          />
        </label>
      </Card>

      <Card>
        <label className="block space-y-2">
          <FieldLabel hint="Your day boundary, and when the prompts land. Not the server's.">
            Your timezone
          </FieldLabel>
          <select
            name="timeZone"
            defaultValue={timeZone}
            className="border-line bg-paper tap w-full rounded-xl border px-3 text-base"
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
                {zone === detected ? ' · detected' : ''}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <Card>
        <label className="block space-y-2">
          <FieldLabel hint="Prompts you to do the thing. Put it where the behaviour actually starts.">
            Morning cue
          </FieldLabel>
          <input
            type="time"
            name="morningCue"
            defaultValue={morningCue}
            required
            className="border-line bg-paper tap w-full rounded-xl border px-3 text-base"
          />
        </label>

        <label className="mt-4 block space-y-2">
          <FieldLabel hint="Prompts you to log. Goes quiet on its own once you have.">
            Evening check
          </FieldLabel>
          <input
            type="time"
            name="eveningCheck"
            defaultValue={eveningCheck}
            required
            className="border-line bg-paper tap w-full rounded-xl border px-3 text-base"
          />
        </label>
      </Card>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Save'}
      </Button>
      {state.error ? <ErrorText>{state.error}</ErrorText> : null}
      {state.message && !state.error ? (
        <p className="text-ink-soft text-center text-xs">{state.message}</p>
      ) : null}
    </form>
  )
}
