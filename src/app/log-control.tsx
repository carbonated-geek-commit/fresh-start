'use client'

import { useActionState } from 'react'
import { logSessionAction, type ActionState } from './actions'
import { Button, ErrorText } from '@/ui/components'

/**
 * The log control.
 *
 * SPEC 05 section 5.2 shapes this: yesterday is offered as an equal button,
 * not hidden behind an "I forgot" flow, because a late log is accepted at full
 * value and never penalised. Making it awkward to find would push people
 * toward the dishonest option, which is exactly what the spec says not to do.
 */
export function LogControl({
  commitmentId,
  loggableDays,
  today,
}: {
  commitmentId: string
  loggableDays: string[]
  today: string
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(logSessionAction, {})

  if (loggableDays.length === 0) {
    return (
      <p className="text-ink-faint text-xs">
        {state.message ?? 'Logged for today. Nothing else to do.'}
      </p>
    )
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="commitmentId" value={commitmentId} />

      <div className="flex flex-wrap gap-2">
        {loggableDays.map((day) => {
          const isToday = day === today
          return (
            <Button
              key={day}
              type="submit"
              name="forDate"
              value={day}
              variant={isToday ? 'primary' : 'quiet'}
              disabled={pending}
            >
              {isToday ? 'I did it today' : 'I did it yesterday'}
            </Button>
          )
        })}
      </div>

      {state.error ? <ErrorText>{state.error}</ErrorText> : null}
      {state.message && !state.error ? (
        <p className="text-ink-soft text-xs leading-relaxed">{state.message}</p>
      ) : null}
    </form>
  )
}
