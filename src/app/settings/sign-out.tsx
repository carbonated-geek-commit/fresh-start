'use client'

import { signOut } from '../actions'
import { Button } from '@/ui/components'

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" className="w-full">
        Sign out
      </Button>
    </form>
  )
}
