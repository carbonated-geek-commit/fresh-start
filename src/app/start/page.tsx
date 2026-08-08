import { redirect } from 'next/navigation'
import { getSession, isLocalMode } from '@/auth'
import { Card, Notice, PageTitle } from '@/ui/components'
import { LocalSignInForm } from './form'

export const dynamic = 'force-dynamic'

export default async function StartPage() {
  const session = await getSession()
  if (session) redirect('/')

  return (
    <>
      <PageTitle kicker="FreshStart">A fresh start, made concrete.</PageTitle>

      <Card>
        <p className="text-ink-soft text-sm leading-relaxed">
          You pick one behaviour you control. You put something behind it. Each day in a row is
          worth more than the last, and what you earn stays yours — a missed day costs you the day
          ahead, never the days behind.
        </p>
      </Card>

      <div className="mt-4">
        {isLocalMode() ? (
          <LocalSignInForm />
        ) : (
          <Notice tone="warm" title="Sign-in is handled by Supabase Auth">
            <p>
              This deployment has Supabase configured, so the local development identity is
              disabled. Wire the Supabase Auth UI here — the session helper in{' '}
              <code className="text-xs">src/auth</code> already reads it.
            </p>
          </Notice>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <Notice title="What this app does not do">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>It never reads your inbox, and there is no path in the code that could.</li>
            <li>It stores no health record. You log what you did, and that is the verification.</li>
            <li>
              Nothing is charged, held, or moved. This version is points only, and no payment
              credential exists in the repository.
            </li>
            <li>The company never receives your stake. There is nowhere for it to go.</li>
          </ul>
        </Notice>
      </div>
    </>
  )
}
