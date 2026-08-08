'use client'

import { useActionState, useState } from 'react'
import { settleAction, type ActionState } from '../../actions'
import { Button, Card, ErrorText } from '@/ui/components'
import type { SettlementDestination } from '@/engine/streak/types'

interface Option {
  id: SettlementDestination
  label: string
  description: string
}

export function SettleForm({
  commitmentId,
  options,
  currentChoice,
}: {
  commitmentId: string
  options: Option[]
  currentChoice: SettlementDestination
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(settleAction, {})
  const [choice, setChoice] = useState<SettlementDestination>(currentChoice)

  return (
    <form action={action}>
      <input type="hidden" name="commitmentId" value={commitmentId} />
      <Card>
        <fieldset>
          <legend className="text-sm font-medium">Where does it go?</legend>
          <div className="mt-3 space-y-2">
            {options.map((option) => (
              <label
                key={option.id}
                className={`block cursor-pointer rounded-xl border p-3 ${
                  choice === option.id ? 'border-accent bg-accent-soft' : 'border-line'
                }`}
              >
                <input
                  type="radio"
                  name="destination"
                  value={option.id}
                  checked={choice === option.id}
                  onChange={() => setChoice(option.id)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-ink-soft mt-1 block text-xs leading-relaxed">
                  {option.description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button type="submit" disabled={pending} className="mt-4 w-full">
          {pending ? 'Recording…' : 'Settle it'}
        </Button>
        {state.error ? <ErrorText>{state.error}</ErrorText> : null}
      </Card>
    </form>
  )
}
