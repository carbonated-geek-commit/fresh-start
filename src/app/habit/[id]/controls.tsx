'use client'

import { useActionState, useState } from 'react'
import { abandonAction, acceptDoubleAction, type ActionState } from '../../actions'
import { Button, ErrorText } from '@/ui/components'

export function DoubleControl({ commitmentId }: { commitmentId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptDoubleAction, {})
  return (
    <form action={action}>
      <input type="hidden" name="commitmentId" value={commitmentId} />
      <Button type="submit" disabled={pending} variant="quiet">
        {pending ? 'Starting…' : 'Take the double'}
      </Button>
      {state.error ? <ErrorText>{state.error}</ErrorText> : null}
    </form>
  )
}

/**
 * SPEC 01 section 1.8: `abandoned` requires an explicit user action, and
 * inactivity never abandons a commitment.
 *
 * The two-step confirm is not friction for its own sake — it is the difference
 * between a deliberate decision and a mis-tap on a phone, and this is the one
 * control that discards a window.
 */
export function AbandonControl({ commitmentId }: { commitmentId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(abandonAction, {})
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-ink-faint w-full text-center text-xs underline underline-offset-4"
      >
        Step back from this habit
      </button>
    )
  }

  return (
    <form action={action} className="border-line rounded-xl border p-4 text-center">
      <input type="hidden" name="commitmentId" value={commitmentId} />
      <p className="text-sm font-medium">Stop this one?</p>
      <p className="text-ink-soft mx-auto mt-1 max-w-sm text-xs leading-relaxed">
        The window closes and it stops counting. Stepping back on purpose is a normal thing to do —
        it is better than letting it rot in the list.
      </p>
      <div className="mt-3 flex justify-center gap-2">
        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? 'Stopping…' : 'Yes, stop it'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Keep going
        </Button>
      </div>
      {state.error ? <ErrorText>{state.error}</ErrorText> : null}
    </form>
  )
}
