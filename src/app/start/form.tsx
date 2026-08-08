'use client'

import { useActionState } from 'react'
import { signInLocal, type ActionState } from '../actions'
import { Button, Card, ErrorText, FieldLabel } from '@/ui/components'

export function LocalSignInForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(signInLocal, {})

  return (
    <Card>
      <form action={action} className="space-y-3">
        <label className="block space-y-2">
          <FieldLabel hint="Used to greet you, and shown to a partner if you invite one. Nothing else.">
            What should we call you?
          </FieldLabel>
          <input
            name="displayName"
            required
            maxLength={80}
            autoComplete="given-name"
            className="border-line bg-paper tap w-full rounded-xl border px-3 text-base"
            placeholder="Alex"
          />
        </label>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'One moment…' : 'Start'}
        </Button>
        {state.error ? <ErrorText>{state.error}</ErrorText> : null}
      </form>
    </Card>
  )
}
