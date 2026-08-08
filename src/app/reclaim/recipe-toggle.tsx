'use client'

import { useActionState } from 'react'
import { noteRecipeApplied, type ActionState } from '../actions'
import { Button, ErrorText } from '@/ui/components'

/**
 * SPEC 06 section 6.4: "Stored: the recommended rule recipe, and whether the
 * user applied it. Nothing else."
 *
 * Self-report, like every other log in this product. Nothing verifies it,
 * because verifying it would mean reading a mailbox (N8).
 */
export function RecipeToggle({
  recipeKey,
  provider,
  applied,
}: {
  recipeKey: string
  provider: string
  applied: boolean
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(noteRecipeApplied, {})

  return (
    <form action={action} className="flex items-center justify-between gap-3">
      <input type="hidden" name="recipeKey" value={recipeKey} />
      <input type="hidden" name="provider" value={provider} />
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" name="applied" defaultChecked={applied} className="size-4" />
        I have set this one up
      </label>
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      {state.error ? <ErrorText>{state.error}</ErrorText> : null}
    </form>
  )
}
