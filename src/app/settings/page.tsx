import { redirect } from 'next/navigation'
import { getSession, isLocalMode } from '@/auth'
import { resolveStore } from '@/data'
import { loadDashboard } from '@/services/habit-service'
import { Card, Notice, PageTitle } from '@/ui/components'
import { DemoPanel } from './demo'
import { SettingsForm } from './form'
import { SignOutButton } from './sign-out'

export const dynamic = 'force-dynamic'

/**
 * SPEC 05 section 5.3.
 *
 * "Times are user-configurable." Note what is *not* configurable here: whether
 * the nudges happen at all. The spec calls them "core scaffolding, not a
 * preference — the cue is what triggers the behavior", so there is no switch
 * to turn them off, only a choice of when.
 */
export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/start')

  const store = resolveStore(session.accessToken)
  const dashboard = await loadDashboard(store, session)

  return (
    <>
      <PageTitle kicker="Settings">When should we prompt you?</PageTitle>

      <SettingsForm
        displayName={dashboard.profile.displayName}
        timeZone={dashboard.profile.timeZone}
        morningCue={dashboard.profile.morningCue}
        eveningCheck={dashboard.profile.eveningCheck}
      />

      <div className="mt-4">
        <Notice title="Why there is no off switch">
          <p>
            The cue is what triggers the behaviour — it is the mechanism, not a notification
            setting. You can move both prompts to whatever times actually fit your day, and the
            evening one goes quiet on its own once you have logged.
          </p>
        </Notice>
      </div>

      <Card className="mt-4">
        <p className="text-sm font-medium">Your data</p>
        <ul className="text-ink-soft mt-2 space-y-1.5 text-xs leading-relaxed">
          <li>Stored: your habits, the days you logged, and the events behind your insights.</li>
          <li>
            Not stored: anything from your inbox, any health or movement record, and any payment
            detail. There is no code path in this app that could collect them.
          </li>
          <li>
            Not sent: nothing behavioural leaves this server. The only outbound message that
            exists is a completion note to a partner you invited.
          </li>
        </ul>
      </Card>

      {isLocalMode() ? (
        <div className="mt-4">
          <DemoPanel />
        </div>
      ) : null}

      <div className="mt-6">
        <SignOutButton />
      </div>
    </>
  )
}
