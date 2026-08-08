'use client'

import { useActionState } from 'react'
import { seedDemoAction, type ActionState } from '../actions'
import { Button, Card, ErrorText } from '@/ui/components'

/**
 * Rendered only when the server says local mode is on, and the action refuses
 * again server-side. Two independent guards, because a demo affordance that
 * leaks into a real deployment writes fake history into someone's account.
 */
export function DemoPanel() {
  const [state, action, pending] = useActionState<ActionState, FormData>(seedDemoAction, {})

  return (
    <Card>
      <p className="text-sm font-medium">Demo data</p>
      <p className="text-ink-soft mt-1 text-xs leading-relaxed">
        Settlement, the recovery day, the double, and the month-end record all need a window that
        has partly or fully elapsed. This creates three habits in those states so you can see them
        without waiting a month. They go through the same validation and emit the same events as
        real ones.
      </p>
      <form action={action} className="mt-3">
        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? 'Building…' : 'Add demo habits'}
        </Button>
      </form>
      {state.error ? <ErrorText>{state.error}</ErrorText> : null}
      {state.message && !state.error ? (
        <p className="text-ink-soft mt-2 text-xs leading-relaxed">{state.message}</p>
      ) : null}
    </Card>
  )
}
